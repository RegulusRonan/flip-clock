# Flip Clock

A minimal flip clock with a pomodoro timer and a countdown timer. Plain HTML, CSS and JavaScript, no build step.

- **Clock**: hours, minutes and seconds on flip cards, with the date above and random motivational quotes below.
- **Pomodoro**: 25 min focus, 5 min short break, 15 min long break after 4 sessions.
- **Timer**: scroll or drag a card to set hours, minutes or seconds.

Move the mouse (or tap) to show the controls. Double-click for fullscreen.

OLED-friendly: the clock drifts a few pixels each minute (pixel shift) and dims to 40% between 22:00 and 07:00 (tap to brighten for 10 s). Change `NIGHT_START`, `NIGHT_END` and `SHIFT_MAX_PX` in `script.js`.

| Key | Action |
| --- | --- |
| C / P / T | Clock / Pomodoro / Timer |
| Space | Start / pause |
| R | Reset |
| S | Skip (pomodoro) |
| A | Auto-start next session on / off (pomodoro) |
| M | Tick sound on / off |
| ↑ / ↓ | Timer minutes |

## Run locally

Open `index.html`, or serve the folder:

```bash
npx serve .
```

## Deploy

Static site: import the repo on Vercel with the default settings (no framework, no build command). `sw.js` makes it work offline and updates it automatically on the next open after a deploy.
