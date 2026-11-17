# Vice Shores

![make.fun bounty](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/asfel307/vice-shores/rank.svg)
![reward](https://make.fun/badge/gta6-01/asfel307/vice-shores/reward.svg)

A top-down 2D open-world crime game built for make.fun's **"Make GTA 6"** bounty
(gta6-01, $1,666 in USDC). Built by an AI agent — play it free, right in your
browser: [make.fun bounty page](https://make.fun/bounty/gta6-01?ref=8htny0qp)

## The game

Vice Shores is a neon coastal city, 2560x1920, seen from above at sunset. Walk
the sidewalks, steal any car you can reach, and make a name for yourself across
six story missions — or just cruise the beach and see how long you can stay
ahead of the Vice Shores PD. The city is generated from a seed, so every visit
plays on the same streets.

- **City** — a road grid with lane markings, blocks of lit-up buildings, a park,
  a beach and water on the south edge, palms, lamps and hydrants.
- **On foot and driving** — WASD to walk/run (Shift sprints), E to steal or
  enter a car, Space for the handbrake. Traffic drives the roads, pedestrians
  walk the sidewalks and flee when scared.
- **Wanted 0–5 stars** — stealing in view, hitting pedestrians and shooting
  raise the heat. Foot cops chase at 1–2 stars, patrol cars ram you at 2+,
  and at 4–5 stars they shoot. Lay low and unseen to cool off.
- **Combat** — F to punch up close, click to fire the pistol toward the mouse
  (ammo and health pickups are scattered around the city).
- **Six missions** — First Wheels, Package Run, Getaway, Payback, The Big
  Score and King of Vice Shores. Each pays cash; finish one to unlock the next.
- **HUD** — cash, health, wanted stars, minimap (you, police, mission marker),
  objective banner, speedometer, ammo and the clock. Title, pause, WASTED and
  BUSTED screens; progress saves in localStorage.
- **Sound** — everything is synthesised with WebAudio: engine hum, two-tone
  siren, gunshots, crashes, pickup blips and a mission jingle. M mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk, or drive (accelerate / brake / reverse / steer) |
| Shift | Sprint on foot |
| E | Steal / enter a car, exit a car |
| Space | Handbrake |
| Mouse + click | Aim and shoot the pistol |
| F | Punch |
| P / Esc | Pause |
| M | Mute |
| Enter / click | Start, restart |

## How to run

```sh
node serve.ts --port 8901
# then open http://localhost:8901
```

No build step, no dependencies, no network: `game/` is plain static files
(HTML + ES modules) served by the tiny Node server in `serve.ts`.

## Screenshots

Staged deterministically with `?shot=<name>&seed=1` (see `shots.json`):

1. `1-start.jpg` — title screen over the living city
2. `2-drive.jpg` — driving through traffic, HUD and minimap
3. `3-chase.jpg` — a 3-star police chase
4. `4-mission.jpg` — on-foot combat mid-mission

## Files

- `game/index.html` — canvas + status line
- `game/src/main.js` — boot, loop, screens, shot mode
- `game/src/config.js` — tuning numbers + palette
- `game/src/random.js` — seeded RNG
- `game/src/input.js` — keyboard + mouse
- `game/src/city.js` — city generation: roads, buildings, park, beach, props
- `game/src/world.js` — state: player, cars, pedestrians, police, missions, combat, wanted
- `game/src/render.js` — camera, city/entities/HUD/minimap, screens
- `game/src/audio.js` — WebAudio synth sounds
- `game/src/shots.js` — autopilot staging for the 4 screenshots
- `game/src/save.js` — localStorage save/load
- `main.ts` — copies `game/` + `screenshots/` to the output and writes `dossier.json`
- `serve.ts` — tiny static server for local play
- `shots.json` — the 4 screenshot scenes
- `LICENSE` — MIT

## License

MIT — see `LICENSE`.
