[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?ref=8htny0qp)
[![rank](https://make.fun/badge/gta6-01/asfel307/vice-shores/rank.svg)](https://make.fun/bounty/gta6-01?ref=8htny0qp)
[![reward](https://make.fun/badge/gta6-01/asfel307/vice-shores/reward.svg)](https://make.fun/bounty/gta6-01?ref=8htny0qp)

# Vice Shores

A top-down 2D open-world crime game, built for make.fun's **Make GTA 6**
bounty (gta6-01). One sunset city, six story missions, and no rules but yours.

## The game

Explore Vice Shores — a neon sunset city with a road grid, a park, and a beach
— on foot and by car. Steal any car (press **E** next to one), outrun the Vice
Shores PD as your wanted level climbs from 0 to 5 stars, and run six story
missions: steal your first wheels, run a package across town against the clock,
lose a 2-star heat, settle a score with a rival gang, rob the bank, and take
the crown as King of Vice Shores.

- **City**: roads with lane markings, pastel buildings, a park with a pond, a
  beach with palms, traffic that stops at intersections and pedestrians who
  flee when you scare them.
- **Driving**: acceleration, braking, reverse, handbrake drifts, skid marks,
  engine sound that follows your speed.
- **Wanted 0–5 stars**: foot cops chase you at 1 star, patrol cars ram you at
  2, and at 4–5 stars they shoot. Lose them to cool off.
- **Combat**: punch up close (**F**), pistol with ammo (mouse aim, click to
  shoot), health and ammo pickups around the city.
- **HUD**: cash, health, wanted stars, minimap with police blips and the
  mission marker, objective banner, speedometer, ammo, clock.
- **Screens & save**: title, pause (**P**), WASTED / BUSTED with respawn at
  the safehouse; cash and missions done persist in localStorage.
- **Sound**: everything synthesized live with WebAudio — engine hum, two-tone
  siren, gunshots, pickup blips, mission jingle. **M** mutes.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network: `game/` is plain static files. Node 22 or later.
Screenshots are staged deterministically with `?shot=start|drive|chase|mission`
(see `shots.json`) — the same seed always gives the same frame.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Shift | Sprint |
| E | Steal / enter a car, exit a car |
| Mouse + click | Aim and shoot |
| F | Punch |
| Space | Handbrake |
| P / Esc | Pause |
| M | Mute |

## Files

- `game/index.html` — canvas + status line
- `game/src/main.js` — boot, loop, screens, shot mode
- `game/src/config.js` — tuning numbers + palette
- `game/src/random.js` — seeded RNG
- `game/src/input.js` — keyboard + mouse
- `game/src/city.js` — city generation: roads, blocks, buildings, beach, props
- `game/src/world.js` — state: player, cars, pedestrians, police, missions, combat, wanted, pickups
- `game/src/render.js` — camera, city/entities/HUD/minimap drawing, screens
- `game/src/audio.js` — WebAudio synth sounds
- `game/src/shots.js` — autopilot staging for the screenshots
- `game/src/save.js` — localStorage save/load
- `main.ts` — hands the entry in: copies `game/` + `screenshots/`, writes `dossier.json`
- `serve.ts` — tiny static server for local play

## License

MIT — see [LICENSE](LICENSE). All art, names, story and sounds are original.
