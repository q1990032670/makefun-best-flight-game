# Skyharbor Run

A chase-view flight game in plain HTML5 Canvas — no build step, no network,
no assets: the whole valley is procedural. Thread glowing gates down a
river valley between two mountain ridges, then turn for home and put the
aeroplane down on the Skyharbor strip — gently, on the centreline, with
fuel to spare.

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/q1990032670/makefun-best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/q1990032670/makefun-best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

## Play

Serve the `game/` folder with any static file server (or open
`game/index.html` through one) in desktop Chrome:

```
node -e "require('http').createServer((q,s)=>{const f=require('fs').readFile('.'+q.url.split('?')[0].replace(/\/$/,'/index.html'),(e,d)=>{s.writeHead(e?404:200);s.end(e?'nf':d)})}).listen(8080)"
```

…or simply double-click through a local server of your choice. Everything
the page loads lives under `game/`.

### Controls

| Input | Effect |
| --- | --- |
| Shift or R | Throttle up |
| Ctrl or F | Throttle down |
| Arrow keys / WASD | Pitch and roll |
| Mouse drag | Steer (blends with the keys) |
| B or Space (held) | Wheel brake |
| G | Toggle landing gear |
| P | Pause |
| Enter | Start engine / next sortie / retry |

### The sortie

1. Take off from the Skyharbor strip and climb away north.
2. Fly the orange gates in order — the next one is ringed in white and
   labelled. Centring a gate pays a bonus.
3. The gold final gate lines you up with home. Land on the strip in
   either direction: slow, gentle, aligned. Off-runway arrivals, hard
   arrivals and gear-up arrivals at speed all bend the aeroplane.
4. Four sorties with more gates, higher gates, less fuel and a growing
   crosswind. Fuel burns with throttle; an empty tank means gliding.

The flight model stalls below 24 m/s, trades speed for height in a climb,
turns with bank, and punishes a ham-fisted approach — throttle and turn
discipline are the game.

### Instruments

A lit panel under the chase view: attitude indicator, airspeed, altimeter,
heading compass and vertical speed, plus throttle / fuel / damage bars and
a gear light. The HUD repeats altitude, speed and heading in large type,
with the score, gate count and the next-gate prompt.

## Layout

- `game/index.html` — the page and its styles
- `game/src/config.js` — tuning constants shared by every module
- `game/src/world.js` — the procedural valley: fields, river, peaks, strip, gates
- `game/src/flight.js` — the flight model and touchdown judging
- `game/src/render.js` — projection, terrain, aircraft, instruments and HUD
- `game/src/input.js` — keyboard and mouse controls
- `game/src/audio.js` — synthesised engine, wind and chimes (WebAudio)
- `game/src/shots.js` — the staged scenes behind the screenshots (`?shot=…`)
- `game/src/main.js` — the state machine and fixed-step loop
- `main.ts` — the hand-in program: copies `game/` + `screenshots/` to the
  output directory and writes `dossier.json` via `vendor/makefun-game.ts`
- `screenshots/` — four real renders of the game, taken from `?shot=` scenes

## License

MIT — see `LICENSE`.

<sub>Entered on [make.fun](https://make.fun/bounty/best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
