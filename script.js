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
    nextPhase(state.pomo);
    pomo.reset(); // a skipped-to session waits for Start
  },
};

// focus -> short break -> focus ... -> long break after ROUNDS focus sessions
function nextPhase(p) {
  if (p.phase === "focus") {
    p.phase = p.round >= ROUNDS ? "long" : "short";
  } else {
    p.round = p.phase === "long" ? 1 : p.round + 1;
    p.phase = "focus";
  }
}

// Auto-start: when a session ends, the next one starts by itself.
let autoStart = true;
try { autoStart = localStorage.getItem("flipclock.autostart") !== "off"; } catch {}

function pomoEnd() {
  const p = state.pomo;
  if (!p.running || remaining(p) > 0) return;
  chime();

  if (!autoStart) {
    nextPhase(p);
    pomo.reset(); // waits for Start
    return;
  }

  // Chain sessions from the moment the last one really ended, so the
  // schedule stays right even if the phone was locked for a while.
  let end = p.endAt;
  nextPhase(p);
  while (end + DURATION[p.phase] <= Date.now()) {
    end += DURATION[p.phase];
    nextPhase(p);
  }
  p.endAt = end + DURATION[p.phase];
  p.running = true;
  update();
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
// Phones only let a page make sound after a real tap (the end of a touch,
// not its start). This runs on every tap/click/key and switches the sound on
// as soon as the phone allows it, then plays one silent sample, which iOS
// needs to fully unlock audio.
function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "running") return;
    audio.resume?.();
    const src = audio.createBufferSource();
    src.buffer = audio.createBuffer(1, 1, audio.sampleRate);
    src.connect(audio.destination);
    src.start();
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

// Soft "tick" each second, like a mechanical flip clock: a very short burst
// of filtered noise. Can be switched off with the Tick button (or M key).
let tickOn = true;
try { tickOn = localStorage.getItem("flipclock.tick") !== "off"; } catch {}

let tickBuffer = null;
function playTick() {
  if (!tickOn || !audio || audio.state !== "running" || document.hidden) return;
  if (!tickBuffer) {
    const len = Math.floor(audio.sampleRate * 0.03); // 30ms
    tickBuffer = audio.createBuffer(1, len, audio.sampleRate);
    const data = tickBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
  }
  const src = audio.createBufferSource();
  src.buffer = tickBuffer;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800; // lower = gentler, less "clicky"
  filter.Q.value = 0.9;
  const gain = audio.createGain();
  gain.gain.value = 0.06; // very soft (was 0.18)
  src.connect(filter).connect(gain).connect(audio.destination);
  src.start();
}

// Every quarter hour (:00, :15, :30, :45) a soft bell plays instead of the
// tick. Follows the Tick on/off button too.
function playQuarter() {
  if (!tickOn || !audio || audio.state !== "running" || document.hidden) return;
  const t = audio.currentTime;
  // A bell-like tone: a main note plus two quieter overtones, fading out
  [[1318.5, 1], [2637, 0.35], [3955.5, 0.12]].forEach(([freq, level]) => {
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06 * level, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 1.7);
  });
}

const tickBtn = document.querySelector('[data-act="sound"]');
function showTickState() {
  tickBtn.textContent = tickOn ? "Tick on" : "Tick off";
  tickBtn.classList.toggle("off", !tickOn);
}
function toggleTick() {
  tickOn = !tickOn;
  try { localStorage.setItem("flipclock.tick", tickOn ? "on" : "off"); } catch {}
  showTickState();
}
showTickState();

const autoBtn = document.querySelector('[data-act="auto"]');
function showAutoState() {
  autoBtn.textContent = autoStart ? "Auto on" : "Auto off";
  autoBtn.classList.toggle("off", !autoStart);
}
function toggleAuto() {
  autoStart = !autoStart;
  try { localStorage.setItem("flipclock.autostart", autoStart ? "on" : "off"); } catch {}
  showAutoState();
}
showAutoState();

// ---------- Rendering ----------

const runBtn = document.querySelector('[data-act="run"]');
const tabBtns = document.querySelectorAll("[data-view]");

const secondsLeft = (c) => Math.ceil(remaining(c) / 1000);
const mmss = (secs) => `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
const hhmmss = (secs) => `${pad(Math.floor(secs / 3600))}:${mmss(secs % 3600)}`;

let lastTickValue = null;
let lastQuarter = null;

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

  // Quarter hours of the real time get the bell (in every view)
  let rang = false;
  if (now.getSeconds() === 0 && now.getMinutes() % 15 === 0) {
    const key = `${now.getHours()}:${now.getMinutes()}`;
    if (key !== lastQuarter) {
      lastQuarter = key;
      playQuarter();
      rang = true;
    }
  }

  // Tick whenever the seconds card flips (paused timers stay silent)
  if (cards.s.value !== lastTickValue) {
    if (lastTickValue !== null && !rang) playTick();
    lastTickValue = cards.s.value;
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
  else if (btn.dataset.act === "sound") toggleTick();
  else if (btn.dataset.act === "auto") toggleAuto();
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
  else if (key === "m") toggleTick();
  else if (key === "a" && state.view === "pomo") toggleAuto();
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

// Holds a screen wake lock while the clock is on screen, so the phone never
// dims or auto-locks. Phones drop the lock when the app is hidden (and
// sometimes on their own), so it's requested again whenever it's lost.
let wakeLock = null;
let wakeLockPending = false;
async function keepAwake() {
  if (wakeLock || wakeLockPending || !("wakeLock" in navigator)) return;
  if (document.visibilityState !== "visible") return;
  wakeLockPending = true;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
      if (document.visibilityState === "visible") setTimeout(keepAwake, 1000);
    });
  } catch {
    // Some phones only allow it after a tap; the next tap tries again
  } finally {
    wakeLockPending = false;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    keepAwake();
    render(); // catch up right away after the phone was locked
  }
});
keepAwake();
setInterval(keepAwake, 15000); // safety net: re-check every 15 seconds

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
// The end of a tap is what phones count as permission for sound (and
// sometimes for keeping the screen on), so try both again there.
["pointerup", "touchend", "click"].forEach((ev) =>
  document.addEventListener(ev, () => { unlockAudio(); keepAwake(); }, { passive: true })
);
wake();

// ---------- Random quotes ----------

const QUOTES = [
  "MAKE IT HAPPEN",
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
  "JUST START",
  "SHOW UP EVERY DAY",
  "CONSISTENCY WINS",
  "DREAM BIG, START SMALL",
  "STOP WISHING, START DOING",
  "YOU'VE GOT THIS",
  "FINISH WHAT YOU START",
  "NO EXCUSES",
  "DO THE HARD THING",
  "WORK NOW, REST LATER",
  "STAY FOCUSED",
  "ONE TASK AT A TIME",
  "PUSH YOUR LIMITS",
  "BE RELENTLESS",
  "GO THE EXTRA MILE",
  "PROVE THEM WRONG",
  "TRUST THE PROCESS",
  "EFFORT COMPOUNDS",
  "GET 1% BETTER TODAY",
  "WIN THE MORNING",
  "OWN YOUR DAY",
  "MOVE WITH PURPOSE",
  "LEAVE NOTHING ON THE TABLE",
  "HUSTLE IN SILENCE",
  "KEEP PUSHING",
  "NEVER SETTLE",
  "RISE AND GRIND",
  "BE UNSTOPPABLE",
  "DO IT FOR FUTURE YOU",
  "YOUR FUTURE IS WATCHING",
  "HABITS BUILD FUTURES",
  "MOMENTUM IS EVERYTHING",
  "BETTER EVERY DAY",
  "START WHERE YOU ARE",
  "FAIL FORWARD",
  "GROWTH OVER COMFORT",
  "COMFORT IS THE ENEMY",
  "GET UNCOMFORTABLE",
  "STAY THE COURSE",
  "CHASE YOUR GOALS",
  "RESULTS, NOT EXCUSES",
  "DISCIPLINE IS FREEDOM",
  "FOCUS. EXECUTE. REPEAT.",
  "THINK LESS, DO MORE",
  "MORE ACTION, LESS TALK",
  "DO SOMETHING TODAY",
  "THE BEST TIME IS NOW",
  "EVERY MINUTE MATTERS",
  "TIME IS TICKING",
  "DON'T WAIT, CREATE",
  "MAKE PROGRESS",
  "KEEP THE STREAK ALIVE",
  "BUILD THE HABIT",
  "RAISE THE BAR",
  "HARD WORK PAYS OFF",
  "GRIND NOW, SHINE LATER",
  "STAY DETERMINED",
  "TAKE THE FIRST STEP",
  "DO IT ANYWAY",
  "BE THE ENERGY",
  "CHOOSE TO WIN",
  "GO ALL IN",
  "COMMIT TO IT",
  "FINISH STRONG",
  "STAY READY",
  "KEEP MOVING FORWARD",
  "SMALL WINS ADD UP",
  "DEEP WORK ONLY",
  "ELIMINATE DISTRACTIONS",
  "PROTECT YOUR FOCUS",
  "THE WORK IS THE WAY",
  "BE PROUD OF TODAY",
  "BUILD YOUR LEGACY",
  "BELIEVE AND ACHIEVE",
  "FORTUNE FAVORS THE BOLD",
  "SWEAT NOW, SMILE LATER",
  "MAKE YOURSELF PROUD",
  "OUTLAST THE DOUBT",
  "LEVEL UP",
  "GET IT DONE",
];

const QUOTE_SECONDS = 30; // how long each quote stays up
const FADE_MS = 600;      // matches the .motto transition in style.css

const mottoEl = document.getElementById("motto");
let quoteIndex = -1;

// Pick a random quote, never the same one twice in a row
function randomQuote() {
  let i;
  do i = Math.floor(Math.random() * QUOTES.length);
  while (i === quoteIndex && QUOTES.length > 1);
  quoteIndex = i;
  return QUOTES[i];
}

mottoEl.textContent = randomQuote();

setInterval(() => {
  mottoEl.classList.add("hidden");
  setTimeout(() => {
    mottoEl.textContent = randomQuote();
    mottoEl.classList.remove("hidden");
  }, FADE_MS);
}, QUOTE_SECONDS * 1000);

// ---------- Offline support ----------
// sw.js keeps a copy of the app on the device. When it finds that a newer
// version was published, it tells us here. If sound hasn't been switched on
// yet (usually right after opening), reload into the new version at once;
// otherwise wait until the app is next reopened, so a running session isn't
// interrupted and you don't need to tap again for sound.

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  navigator.serviceWorker.startMessages?.(); // receive messages sent while loading

  let updateWaiting = false;
  let reloadTimer = null;
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type !== "updated") return;
    updateWaiting = true;
    if (audio && audio.state === "running") return; // apply on next reopen
    // Several files can change at once: wait until they've all arrived
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => location.reload(), 1500);
  });
  document.addEventListener("visibilitychange", () => {
    if (updateWaiting && document.visibilityState === "visible") location.reload();
  });
}

// Double-click anywhere (except the buttons) to toggle fullscreen
document.addEventListener("dblclick", (e) => {
  if (e.target.closest("button")) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
