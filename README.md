# Flip Clock

A minimal flip clock with a pomodoro timer and a countdown timer. Plain HTML, CSS and JavaScript, no build step.

- **Clock**: hours, minutes and seconds on flip cards, with the date above and random motivational quotes below.
- **Pomodoro**: 25 min focus, 5 min short break, 15 min long break after 4 sessions.
- **Timer**: scroll or drag a card to set hours, minutes or seconds.

Move the mouse (or tap) to show the controls. Double-click for fullscreen.

| Key | Action |
| --- | --- |
| C / P / T | Clock / Pomodoro / Timer |
| Space | Start / pause |
| R | Reset |
| S | Skip (pomodoro) |
| M | Tick sound on / off |
| ↑ / ↓ | Timer minutes |

## Run locally

Open `index.html`, or serve the folder:

```bash
npx serve .
```

## Deploy

Static site: import the repo on Vercel with the default settings (no framework, no build command).
