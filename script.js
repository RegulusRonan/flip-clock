const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n) => String(n).padStart(2, "0");

function half(cls, value) {
  const el = document.createElement("div");
  el.className = `half ${cls}`;
  el.innerHTML = `<span>${value}</span>`;
  return el;
}

class FlipCard {
  constructor(el) {
    this.el = el;
    this.value = null;
    this.top = half("top", "");
    this.bottom = half("bottom", "");
    el.append(this.top, this.bottom);
  }

  set(value) {
    if (value === this.value) return;
    const old = this.value;
    this.value = value;

    // First render: no animation
    if (old === null) {
      this.top.firstChild.textContent = value;
      this.bottom.firstChild.textContent = value;
      return;
    }

    // Clear any flaps still running from a previous flip
    this.el.querySelectorAll(".flap").forEach((f) => f.remove());

    // Static halves: new value on top (revealed as the flap falls),
    // old value on bottom (covered when the lower flap lands)
    this.top.firstChild.textContent = value;
    this.bottom.firstChild.textContent = old;

    const flapTop = half("top flap", old);
    const flapBottom = half("bottom flap", value);
    this.el.append(flapTop, flapBottom);

    flapBottom.addEventListener("animationend", () => {
      this.bottom.firstChild.textContent = value;
      flapTop.remove();
      flapBottom.remove();
    }, { once: true });
  }
}

const cards = {
  h: new FlipCard(document.getElementById("hours")),
  m: new FlipCard(document.getElementById("minutes")),
  s: new FlipCard(document.getElementById("seconds")),
};
const dateEl = document.getElementById("date");

// ---------- Settings ----------

// Pomodoro
const FOCUS_MIN = 25;
const SHORT_BREAK_MIN = 5;
const LONG_BREAK_MIN = 15;
const ROUNDS = 4; // focus sessions before a long break

const DURATION = {
  focus: FOCUS_MIN * 60000,
  short: SHORT_BREAK_MIN * 60000,
  long: LONG_BREAK_MIN * 60000,
};
const PHASE_LABEL = { focus: "Focus", short: "Short break", long: "Long break" };

// ---------- State (saved, so a refresh keeps running timers) ----------

const STORE_KEY = "flipclock.state";

let state = {
  view: "clock", // clock | pomo | timer
  pomo: { phase: "focus", round: 1, running: false, endAt: 0, left: DURATION.focus },
  timer: { running: false, endAt: 0, left: 0, total: 0, done: false },
};

try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY));
  if (saved?.pomo && saved?.timer) state = saved;
} catch {}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

// ---------- Countdown helpers (shared by pomodoro and timer) ----------

const remaining = (c) => (c.running ? Math.max(0, c.endAt - Date.now()) : c.left);

function startCountdown(c) {
  if (c.running || c.left <= 0) return;
  // Snap the end to a whole second so the countdown flips with the clock
  c.endAt = Math.floor((Date.now() + c.left) / 1000) * 1000;
  c.running = true;
}

function pauseCountdown(c) {
  if (!c.running) return;
  c.left = remaining(c);
  c.running = false;
}

// A one-off timer per countdown still fires on time in a background tab
const endTimers = {};
function arm(name, onEnd) {
  clearTimeout(endTimers[name]);
  const c = state[name];
  if (c.running) endTimers[name] = setTimeout(onEnd, remaining(c) + 50);
}

function update() {
  arm("pomo", pomoEnd);
  arm("timer", timerEnd);
  save();
  render();
}

// ---------- Pomodoro ----------

const pomo = {
  run() {
    const p = state.pomo;
    p.running ? pauseCountdown(p) : startCountdown(p);
    update();
  },
  reset() {
    const p = state.pomo;
    p.running = false;
    p.left = DURATION[p.phase];
    update();
  },
  skip() {
    const p = state.pomo;
    if (p.phase === "focus") {
      p.phase = p.round >= ROUNDS ? "long" : "short";
    } else {
      p.round = p.phase === "long" ? 1 : p.round + 1;
      p.phase = "focus";
    }
    pomo.reset(); // next session waits for Start
  },
};

function pomoEnd() {
  const p = state.pomo;
  if (!p.running || remaining(p) > 0) return;
  chime();
  pomo.skip();
}

// ---------- Timer ----------

const timer = {
  run() {
    const t = state.timer;
    t.done = false;
    t.running ? pauseCountdown(t) : startCountdown(t);
    update();
  },
  // Reset goes back to the time you set; press again to clear to 00:00:00
  reset() {
    const t = state.timer;
    const atStart = !t.running && t.left === t.total;
    t.running = false;
    t.done = false;
    if (atStart) t.total = 0;
    t.left = t.total;
    update();
  },
  // Move one unit (h / m / s) up or down by `steps`, wrapping around
  nudge(unit, steps) {
    const t = state.timer;
    if (t.running || !steps) return;
    const secs = Math.round(t.left / 1000);
    let h = Math.floor(secs / 3600);
    let m = Math.floor((secs % 3600) / 60);
    let s = secs % 60;
    const wrap = (v, n) => ((v % n) + n) % n;
    if (unit === "h") h = wrap(h + steps, 100);
    if (unit === "m") m = wrap(m + steps, 60);
    if (unit === "s") s = wrap(s + steps, 60);
    t.left = t.total = (h * 3600 + m * 60 + s) * 1000;
    t.done = false;
    update();
  },
};

function timerEnd() {
  const t = state.timer;
  if (!t.running || remaining(t) > 0) return;
  t.running = false;
  t.left = 0;
  t.done = true;
  chime();
  setTimeout(chime, 1100);
  update();
}

// ---------- Sound ----------

let audio = null;
function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
  } catch {}
}

function chime() {
  if (!audio) return;
  const t0 = audio.currentTime;
  [880, 880, 1175].forEach((freq, i) => {
    const t = t0 + i * 0.28;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.27);
  });
}

// ---------- Rendering ----------

const runBtn = document.querySelector('[data-act="run"]');
const tabBtns = document.querySelectorAll("[data-view]");

const secondsLeft = (c) => Math.ceil(remaining(c) / 1000);
const mmss = (secs) => `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
const hhmmss = (secs) => `${pad(Math.floor(secs / 3600))}:${mmss(secs % 3600)}`;

function render() {
  // Catch ends we may have missed (e.g. the laptop was asleep)
  if (state.pomo.running && remaining(state.pomo) <= 0) return pomoEnd();
  if (state.timer.running && remaining(state.timer) <= 0) return timerEnd();

  const { view, pomo: p, timer: t } = state;
  const now = new Date();

  document.body.dataset.view = view;
  document.body.classList.toggle("done", view === "timer" && t.done);
  document.body.classList.toggle("timer-set", view === "timer" && !t.running);
  tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.view === view));

  if (view === "pomo") {
    const secs = secondsLeft(p);
    cards.m.set(pad(Math.floor(secs / 60)));
    cards.s.set(pad(secs % 60));

    let label = PHASE_LABEL[p.phase];
    if (p.phase === "focus") label += `  ${p.round}/${ROUNDS}`;
    if (!p.running && p.left < DURATION[p.phase]) label += "  ·  Paused";
    dateEl.textContent = label;
    runBtn.textContent = p.running ? "Pause" : "Start";
  } else if (view === "timer") {
    const secs = secondsLeft(t);
    cards.h.set(pad(Math.floor(secs / 3600)));
    cards.m.set(pad(Math.floor((secs % 3600) / 60)));
    cards.s.set(pad(secs % 60));

    dateEl.textContent =
      t.done ? "Time's up" :
      t.running ? "Timer" :
      t.left === 0 ? "Scroll the numbers to set a time" :
      t.left < t.total ? "Timer  ·  Paused" : "Timer";
    runBtn.textContent = t.running ? "Pause" : "Start";
  } else {
    cards.h.set(pad(now.getHours()));
    cards.m.set(pad(now.getMinutes()));
    cards.s.set(pad(now.getSeconds()));
    dateEl.textContent =
      `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}  ${DAYS[now.getDay()]}`;
  }

  // Tab title shows whatever is counting down (current view first)
  const pomoTitle = p.running && `${mmss(secondsLeft(p))} · ${PHASE_LABEL[p.phase]}`;
  const timerTitle = t.running && `${hhmmss(secondsLeft(t))} · Timer`;
  document.title = (view === "timer" ? timerTitle || pomoTitle : pomoTitle || timerTitle) || "Flip Clock";
}

function tick() {
  render();
  // Re-align to the start of the next second so ticks don't drift
  setTimeout(tick, 1000 - new Date().getMilliseconds());
}

arm("pomo", pomoEnd);
arm("timer", timerEnd);
tick();

// ---------- Controls ----------

function setView(view) {
  state.view = view;
  update();
}

const current = () => (state.view === "timer" ? timer : state.view === "pomo" ? pomo : null);

document.getElementById("controls").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (lastPointer !== "mouse") btn.blur(); // don't leave a tapped button highlighted
  unlockAudio();
  if (btn.dataset.view) setView(btn.dataset.view);
  else current()?.[btn.dataset.act]?.();
});

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // Let a focused button handle its own Space/Enter
  if (e.target.closest("button") && (e.key === " " || e.key === "Enter")) return;

  const key = e.key.toLowerCase();
  const views = { c: "clock", p: "pomo", t: "timer" };
  const acts = { " ": "run", r: "reset", s: "skip" };

  if (views[key]) setView(views[key]);
  else if (acts[key] && current()?.[acts[key]]) current()[acts[key]]();
  else if (state.view === "timer" && (key === "arrowup" || key === "arrowdown"))
    timer.nudge("m", key === "arrowup" ? 1 : -1);
  else return;
  e.preventDefault();
});

// ---------- Timer: scroll or drag the cards to set the time ----------

const canSetTimer = () => state.view === "timer" && !state.timer.running;

[["hours", "h"], ["minutes", "m"], ["seconds", "s"]].forEach(([id, unit]) => {
  const el = document.getElementById(id);

  // Mouse wheel / trackpad: scroll up = more time
  let acc = 0;
  el.addEventListener("wheel", (e) => {
    if (!canSetTimer()) return;
    e.preventDefault();
    const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1);
    if (Math.abs(dy) >= 50) {
      // Mouse wheel: one step per notch (~100px each)
      acc = 0;
      const notches = Math.max(1, Math.round(Math.abs(dy) / 100));
      timer.nudge(unit, dy < 0 ? notches : -notches);
      return;
    }
    // Trackpad: small deltas, so add them up
    if (Math.sign(dy) !== Math.sign(acc)) acc = 0;
    acc += dy;
    const steps = Math.trunc(acc / 30);
    if (steps) {
      acc -= steps * 30;
      timer.nudge(unit, -steps);
    }
  }, { passive: false });

  // Touch / click-drag: drag up = more time
  let dragY = null;
  el.addEventListener("pointerdown", (e) => {
    if (!canSetTimer()) return;
    dragY = e.clientY;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (dragY === null) return;
    const steps = Math.trunc((dragY - e.clientY) / 24);
    if (steps) {
      dragY -= steps * 24;
      timer.nudge(unit, steps);
    }
  });
  const endDrag = () => { dragY = null; };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
});

// ---------- Keep the screen on (phones/tablets) ----------

let wakeLock = null;
async function keepAwake() {
  if (wakeLock || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    keepAwake();
    render(); // catch up right away after the phone was locked
  }
});
keepAwake();

// Any click or key stops the "time's up" blinking
function dismissDone() {
  if (state.timer.done) {
    state.timer.done = false;
    update();
  }
}

// Show the controls on activity, hide them (and the cursor) when idle
const controlsEl = document.getElementById("controls");
let idleTimer = null;
// Phones keep the last tapped button in a "hover" state, so only trust
// :hover (to keep the controls up while the mouse is over them) for a mouse.
let lastPointer = "mouse";
document.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; }, true);
document.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") lastPointer = "mouse";
}, true);

function wake() {
  controlsEl.classList.add("show");
  document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (lastPointer === "mouse" && controlsEl.matches(":hover")) return wake();
    controlsEl.classList.remove("show");
    document.body.classList.add("idle");
  }, 1000); // hide the controls 1 second after the last activity
}
document.addEventListener("mousemove", wake);
["pointerdown", "keydown"].forEach((ev) =>
  document.addEventListener(ev, () => { unlockAudio(); keepAwake(); wake(); dismissDone(); })
);
wake();

// ---------- Rotating quotes ----------

const QUOTES = [
  "LESS IS MORE",
  "DO IT NOW",
  "ONE MORE REP",
  "START BEFORE YOU'RE READY",
  "SMALL STEPS EVERY DAY",
  "DISCIPLINE OVER MOTIVATION",
  "NO ZERO DAYS",
  "PROGRESS, NOT PERFECTION",
  "DONE IS BETTER THAN PERFECT",
  "BUILD WHILE THEY SLEEP",
  "STAY HUNGRY",
  "THE TIME IS NOW",
  "OUTWORK YESTERDAY",
  "MAKE TODAY COUNT",
  "FOCUS ON WHAT MATTERS",
  "ACTION BEATS INTENTION",
  "KEEP GOING",
  "EARN IT",
  "BE BETTER THAN YESTERDAY",
  "THIS SECOND IS YOURS",
];

const QUOTE_SECONDS = 30; // how long each quote stays up
const FADE_MS = 600;      // matches the .motto transition in style.css

const mottoEl = document.getElementById("motto");
let quoteIndex = 0;

setInterval(() => {
  quoteIndex = (quoteIndex + 1) % QUOTES.length;
  mottoEl.classList.add("hidden");
  setTimeout(() => {
    mottoEl.textContent = QUOTES[quoteIndex];
    mottoEl.classList.remove("hidden");
  }, FADE_MS);
}, QUOTE_SECONDS * 1000);

// Double-click anywhere (except the buttons) to toggle fullscreen
document.addEventListener("dblclick", (e) => {
  if (e.target.closest("button")) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
