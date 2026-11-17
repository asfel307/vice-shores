// The game's rules and state, with no drawing and no browser in it: the player on foot
// and in cars, traffic that stays on the roads, pedestrians, police, wanted heat,
// combat, pickups and the six-mission story chain. step() advances one fixed step and
// returns what happened as bit flags, so the caller can react (sound, screens) without
// the world knowing about screens or sound. Nothing here allocates after createWorld.
import {
  CAR, MISSIONS, PED, PICKUP, PISTOL, PLAYER, POLICE, TRAFFIC, WANTED, WORLD,
} from './config.js';
import { buildCity, buildingAt, inIntersection, isBlocked, randomRoadPoint, randomSidewalkPoint, roadAt } from './city.js';
import { pick, range } from './random.js';

export const EVENT_WASTED = 1;
export const EVENT_BUSTED = 2;
export const EVENT_MISSION = 4;
export const EVENT_PICKUP = 8;
export const EVENT_SHOT = 16;
export const EVENT_PUNCH = 32;
export const EVENT_CRASH = 64;
export const EVENT_HIT = 128;
export const EVENT_JINGLE = 256;

const CAR_COLORS = ['#ff5d6c', '#4fa8ff', '#ffd94d', '#7dff9e', '#c99aff', '#ff9a4d', '#e8e8f0', '#4dd8c8'];
const PED_COLORS = ['#f2c94c', '#7dd8ff', '#ff8a7a', '#a8e07a', '#e0a8ff', '#ffb84d'];

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    city,
    player: { x: 1280, y: 900, angle: -Math.PI / 2, hp: PLAYER.hp, onFoot: true, car: null, punchCd: 0, shootCd: 0, speed: 0, hurtTimer: 0 },
    cars: [],
    peds: [],
    cops: [],
    gang: [],
    bullets: [],
    particles: [],
    pickups: [],
    wanted: 0,
    wantedTimer: 0,
    unseenTimer: 0,
    cash: 0,
    ammo: PISTOL.ammoStart,
    missionIndex: 0,
    mission: { phase: 'steal', timer: 0, target: null, count: 0, progress: 0 },
    clock: 17.5 * 3600,
    elapsed: 0,
    message: '',
    messageTimer: 0,
    banner: '',
    bannerTimer: 0,
    shake: 0,
    marker: null,
    over: false,
  };

  function say(text, seconds = 3) {
    state.message = text;
    state.messageTimer = seconds;
  }

  function showBanner(text, seconds = 3.5) {
    state.banner = text;
    state.bannerTimer = seconds;
  }

  function addParticles(x, y, color, n, speed = 160) {
    for (let i = 0; i < n; i += 1) {
      const a = random() * Math.PI * 2;
      const s = range(random, speed * 0.3, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: range(random, 0.3, 0.8), color, size: range(random, 2, 5) });
    }
    if (state.particles.length > 220) state.particles.splice(0, state.particles.length - 220);
  }

  function addWanted(n) {
    const before = state.wanted;
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.unseenTimer = 0;
    if (state.wanted > before && state.wanted >= 3) say(`Wanted level ${state.wanted} — the heat is on!`);
  }

  function makeCar(x, y, angle, kind) {
    return {
      x, y, angle, speed: 0, color: pick(random, CAR_COLORS), kind,
      road: null, targetSpeed: TRAFFIC.cruiseSpeed, turnCooldown: 0, stuckTimer: 0, driver: kind === 'traffic',
    };
  }

  function spawnTrafficCar() {
    const p = randomRoadPoint(random, city);
    const road = roadAt(city, p.x, p.y);
    const car = makeCar(p.x, p.y, 0, 'traffic');
    if (road) {
      car.road = { axis: road.axis, center: road.center, dir: random() < 0.5 ? 1 : -1 };
      car.angle = road.axis === 'v' ? (car.road.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.road.dir > 0 ? 0 : Math.PI);
      car.speed = TRAFFIC.cruiseSpeed * range(random, 0.8, 1.1);
    }
    state.cars.push(car);
    return car;
  }

  function spawnParkedCar() {
    const p = randomRoadPoint(random, city);
    const road = roadAt(city, p.x, p.y);
    if (!road) return;
    const side = random() < 0.5 ? -1 : 1;
    const car = makeCar(p.x, p.y, 0, 'parked');
    if (road.axis === 'v') {
      car.x = road.center + side * (city.roadW / 2 - 16);
      car.angle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.y = road.center + side * (city.roadW / 2 - 16);
      car.angle = side > 0 ? 0 : Math.PI;
    }
    state.cars.push(car);
  }

  function spawnPed() {
    const p = randomSidewalkPoint(random, city);
    state.peds.push({
      x: p.x, y: p.y, angle: random() * Math.PI * 2, speed: PED.speed * range(random, 0.7, 1.2),
      color: pick(random, PED_COLORS), state: 'walk', panic: 0,
    });
  }

  function spawnPickup(kind) {
    const p = randomSidewalkPoint(random, city);
    state.pickups.push({ x: p.x, y: p.y, kind });
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function nearestCopDist(x, y) {
    let best = Infinity;
    for (const cop of state.cops) best = Math.min(best, dist(x, y, cop.x, cop.y));
    return best;
  }

  function desiredPolice() {
    const w = state.wanted;
    if (w === 0) return { foot: 0, car: 0 };
    if (w === 1) return { foot: 1, car: 0 };
    if (w === 2) return { foot: 2, car: 1 };
    if (w === 3) return { foot: 2, car: 2 };
    if (w === 4) return { foot: 2, car: 3 };
    return { foot: 3, car: 3 };
  }

  /** A road point near the player, so fresh police arrive in the action, not across town. */
  function roadPointNearPlayer() {
    const p = state.player;
    for (let tries = 0; tries < 10; tries += 1) {
      const pt = randomRoadPoint(random, city);
      const d = dist(pt.x, pt.y, p.x, p.y);
      if (d > 380 && d < 800) return pt;
    }
    return randomRoadPoint(random, city);
  }

  function spawnFootCop() {
    const p = roadPointNearPlayer();
    state.cops.push({ kind: 'foot', x: p.x, y: p.y, angle: 0, hp: 60, car: null, shootCd: 0 });
  }

  function spawnCopCar() {
    const p = roadPointNearPlayer();
    const road = roadAt(city, p.x, p.y);
    const car = makeCar(p.x, p.y, 0, 'police');
    car.color = '#e8ecf5';
    if (road) {
      car.road = { axis: road.axis, center: road.center, dir: random() < 0.5 ? 1 : -1 };
      car.angle = road.axis === 'v' ? (car.road.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.road.dir > 0 ? 0 : Math.PI);
    }
    state.cars.push(car);
    state.cops.push({ kind: 'car', x: car.x, y: car.y, angle: car.angle, hp: 100, car, shootCd: 0 });
  }

  function damagePlayer(amount, events) {
    if (state.over) return events;
    state.player.hp -= amount;
    state.player.hurtTimer = 4;
    addParticles(state.player.x, state.player.y, '#ff5d6c', 8, 120);
    if (state.player.hp <= 0) {
      state.player.hp = 0;
      state.over = true;
      return events | EVENT_WASTED;
    }
    return events | EVENT_HIT;
  }

  function fireBullet(x, y, angle, from) {
    state.bullets.push({ x, y, angle, speed: 780, life: PISTOL.range / 780, from });
    addParticles(x + Math.cos(angle) * 20, y + Math.sin(angle) * 20, '#ffd94d', 4, 90);
  }

  function playerShoot(aimX, aimY) {
    const p = state.player;
    if (p.shootCd > 0 || state.ammo <= 0 || !p.onFoot) return 0;
    p.shootCd = PISTOL.cooldown;
    state.ammo -= 1;
    p.angle = angleTo(p.x, p.y, aimX, aimY);
    fireBullet(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20, p.angle, 'player');
    if (nearestCopDist(p.x, p.y) < 600) addWanted(WANTED.shootSeen);
    return EVENT_SHOT;
  }

  function playerPunch() {
    const p = state.player;
    if (p.punchCd > 0 || !p.onFoot) return 0;
    p.punchCd = PLAYER.punchCooldown;
    const targets = [];
    for (const g of state.gang) if (g.hp > 0) targets.push(g);
    for (const cop of state.cops) if (cop.kind === 'foot') targets.push(cop);
    for (const ped of state.peds) targets.push(ped);
    for (const t of targets) {
      if (dist(p.x, p.y, t.x, t.y) < PLAYER.punchRange + 12) {
        if (t.hp !== undefined) t.hp -= PLAYER.punchDamage;
        else {
          const i = state.peds.indexOf(t);
          if (i >= 0) state.peds.splice(i, 1);
        }
        addParticles(t.x, t.y, '#ffd94d', 6, 110);
        break;
      }
    }
    return EVENT_PUNCH;
  }

  function enterCar(car) {
    const p = state.player;
    p.car = car;
    p.onFoot = false;
    car.kind = 'player';
    car.driver = false;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (nearestCopDist(p.x, p.y) < 450) addWanted(WANTED.stealSeen);
  }

  function exitCar() {
    const p = state.player;
    const car = p.car;
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    const side = { x: Math.cos(car.angle + Math.PI / 2), y: Math.sin(car.angle + Math.PI / 2) };
    p.x = car.x + side.x * 46;
    p.y = car.y + side.y * 46;
    if (isBlocked(city, p.x, p.y, PLAYER.radius)) {
      p.x = car.x - side.x * 46;
      p.y = car.y - side.y * 46;
    }
    p.onFoot = true;
    p.car = null;
    p.speed = 0;
  }

  function setMission(index) {
    state.missionIndex = index;
    const m = MISSIONS[index];
    state.mission = { phase: 'start', timer: 0, target: null, count: 0, progress: 0 };
    state.marker = null;
    if (!m) {
      showBanner('FREE ROAM — Vice Shores is yours');
      return;
    }
    showBanner(`MISSION ${m.id}: ${m.name}`);
    say(m.text, 5);
    if (index === 0) {
      state.mission.phase = 'steal';
    } else if (index === 1) {
      state.mission.phase = 'pickup';
      state.mission.target = { ...city.packageSpot };
      state.marker = { ...city.packageSpot };
    } else if (index === 2) {
      state.mission.phase = 'lose';
      addWanted(2);
    } else if (index === 3) {
      state.mission.phase = 'hunt';
      state.gang = [];
      const spots = [
        { x: 800, y: 720 }, { x: 1760, y: 1120 }, { x: 1280, y: 1520 },
      ];
      for (const s of spots) state.gang.push({ x: s.x, y: s.y, angle: 0, hp: 60, shootCd: 1 });
      state.marker = { ...spots[0] };
    } else if (index === 4) {
      state.mission.phase = 'rob';
      state.mission.target = { ...city.bank };
      state.marker = { ...city.bank };
    } else if (index === 5) {
      state.mission.phase = 'deliver';
      addWanted(3);
      state.mission.target = { x: 2240, y: 1650 };
      state.marker = { x: 2240, y: 1650 };
    }
  }

  function completeMission(events) {
    const m = MISSIONS[state.missionIndex];
    if (!m) return events;
    state.cash += m.pay;
    showBanner(`MISSION COMPLETE — +$${m.pay}`);
    say(`${m.name} done. $${m.pay} banked.`, 4);
    state.missionIndex += 1;
    setMission(state.missionIndex);
    return events | EVENT_MISSION | EVENT_JINGLE;
  }

  function updateMissions(dt, events) {
    const p = state.player;
    const mi = state.missionIndex;
    const ms = state.mission;
    if (mi >= MISSIONS.length) return events;
    if (mi === 0) {
      if (ms.phase === 'steal' && !p.onFoot) {
        ms.phase = 'drive';
        ms.target = { x: 1760, y: 720 };
        state.marker = { ...ms.target };
        say('Nice wheels. Drive to the marker.', 4);
      } else if (ms.phase === 'drive' && !p.onFoot && ms.target && dist(p.x, p.y, ms.target.x, ms.target.y) < 80) {
        return completeMission(events);
      }
    } else if (mi === 1) {
      if (ms.phase === 'pickup' && ms.target && dist(p.x, p.y, ms.target.x, ms.target.y) < 55) {
        ms.phase = 'deliver';
        ms.timer = MISSIONS[1].timer;
        ms.target = { ...city.safehouse };
        state.marker = { ...city.safehouse };
        say('Package secured. Deliver it — fast!', 4);
      } else if (ms.phase === 'deliver') {
        ms.timer -= dt;
        if (ms.target && dist(p.x, p.y, ms.target.x, ms.target.y) < 80) return completeMission(events);
        if (ms.timer <= 0) {
          ms.phase = 'pickup';
          ms.target = { ...city.packageSpot };
          state.marker = { ...city.packageSpot };
          say('Too slow! Grab the package again.', 4);
        }
      }
    } else if (mi === 2) {
      if (ms.phase === 'lose' && state.wanted === 0) return completeMission(events);
    } else if (mi === 3) {
      const alive = state.gang.filter((g) => g.hp > 0);
      ms.count = 3 - alive.length;
      if (alive.length > 0) state.marker = { x: alive[0].x, y: alive[0].y };
      if (alive.length === 0) return completeMission(events);
    } else if (mi === 4) {
      if (ms.phase === 'rob') {
        if (ms.target && dist(p.x, p.y, ms.target.x, ms.target.y) < 70 && p.onFoot) {
          ms.progress += dt;
          if (ms.progress >= 3) {
            ms.phase = 'escape';
            addWanted(3);
            ms.target = { ...city.safehouse };
            state.marker = { ...city.safehouse };
            say('Vault cracked! Lose the heat — get to the safehouse!', 5);
          }
        } else ms.progress = Math.max(0, ms.progress - dt);
      } else if (ms.phase === 'escape' && ms.target && dist(p.x, p.y, ms.target.x, ms.target.y) < 80) {
        return completeMission(events);
      }
    } else if (mi === 5) {
      if (ms.phase === 'deliver' && ms.target && dist(p.x, p.y, ms.target.x, ms.target.y) < 80) {
        return completeMission(events);
      }
    }
    return events;
  }

  function updatePlayer(dt, input, events) {
    const p = state.player;
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.shootCd = Math.max(0, p.shootCd - dt);
    p.hurtTimer = Math.max(0, p.hurtTimer - dt);
    if (!input) return events;
    if (input.enter) {
      if (p.onFoot) {
        const car = nearestCar(p.x, p.y, 70);
        if (car) {
          if (car.kind === 'traffic' && car.driver) {
            state.peds.push({ x: car.x + 30, y: car.y + 30, angle: 0, speed: PED.fleeSpeed, color: pick(random, PED_COLORS), state: 'flee', panic: 3 });
          }
          enterCar(car);
          say('You took the car.', 2);
        }
      } else exitCar();
    }
    if (input.punch) events |= playerPunch();
    if (input.shoot && input.aim) events |= playerShoot(input.aim.wx, input.aim.wy);

    if (p.onFoot) {
      const speed = input.move.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      const nx = p.x + input.move.x * speed * dt;
      const ny = p.y + input.move.y * speed * dt;
      if (!isBlocked(city, nx, p.y, PLAYER.radius)) p.x = nx;
      if (!isBlocked(city, p.x, ny, PLAYER.radius)) p.y = ny;
      p.speed = (input.move.x !== 0 || input.move.y !== 0) ? speed : 0;
      if (p.speed > 0) p.angle = Math.atan2(input.move.y, input.move.x);
      if (input.aim) p.angle = angleTo(p.x, p.y, input.aim.wx, input.aim.wy);
    } else if (p.car) {
      events |= updatePlayerCar(dt, input, p.car);
      p.x = p.car.x;
      p.y = p.car.y;
      p.angle = p.car.angle;
      p.speed = Math.abs(p.car.speed);
    }
    return events;
  }

  function updatePlayerCar(dt, input, car) {
    let events = 0;
    const move = input.move;
    const forward = move.up ? 1 : 0;
    const reverse = move.down ? 1 : 0;
    if (forward) car.speed += CAR.accel * dt;
    else if (reverse) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt;
    else {
      car.speed -= CAR.drag * car.speed * dt;
      if (Math.abs(car.speed) < 4 && !forward && !reverse) car.speed = 0;
    }
    if (move.brake) {
      car.speed -= Math.sign(car.speed) * CAR.handbrakeDrag * 260 * dt;
      if (Math.abs(car.speed) < 8) car.speed = 0;
      if (Math.abs(car.speed) > 60) addParticles(car.x, car.y, '#c9c9d8', 2, 60);
    }
    car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
    const steer = (move.right ? 1 : 0) - (move.left ? 1 : 0);
    const speedFactor = Math.max(0.35, 1 - Math.abs(car.speed) / (CAR.maxSpeed * 1.6));
    if (Math.abs(car.speed) > 1) {
      car.angle += steer * CAR.turnRate * speedFactor * (car.speed >= 0 ? 1 : -1) * dt;
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (isBlocked(city, nx, ny, 22)) {
      if (Math.abs(car.speed) > 120) {
        events |= EVENT_CRASH;
        state.shake = Math.min(14, Math.abs(car.speed) / 22);
        addParticles(nx, ny, '#ffb84d', 10, 200);
        state.player.hp = Math.max(1, state.player.hp - 6);
      }
      car.speed *= -0.25;
    } else {
      car.x = nx;
      car.y = ny;
    }
    car.x = Math.max(24, Math.min(WORLD.width - 24, car.x));
    car.y = Math.max(24, Math.min(WORLD.height - 24, car.y));
    return events;
  }

  function laneOffset(car) {
    // Right-hand traffic: the lane is on the right of the direction of travel.
    if (car.road.axis === 'v') return car.road.dir > 0 ? -22 : 22;
    return car.road.dir > 0 ? 22 : -22;
  }

  function nearestHCross(y) {
    let best = null;
    let bestD = Infinity;
    for (const hy of city.roadsH) {
      const d = Math.abs(y - hy);
      if (d < bestD) {
        bestD = d;
        best = hy;
      }
    }
    return bestD < 60 ? best : null;
  }

  function nearestVCross(x) {
    let best = null;
    let bestD = Infinity;
    for (const vx of city.roadsV) {
      const d = Math.abs(x - vx);
      if (d < bestD) {
        bestD = d;
        best = vx;
      }
    }
    return bestD < 60 ? best : null;
  }

  function updateTrafficCar(dt, car) {
    if (!car.road) return;
    // Slow near intersections so a turn never overshoots the road.
    const aheadX = car.x + Math.cos(car.angle) * TRAFFIC.cornerDistance;
    const aheadY = car.y + Math.sin(car.angle) * TRAFFIC.cornerDistance;
    const nearCorner = inIntersection(city, aheadX, aheadY);
    const target = nearCorner ? TRAFFIC.cornerSpeed : car.targetSpeed;
    car.speed += Math.sign(target - car.speed) * 220 * dt;
    car.turnCooldown = Math.max(0, car.turnCooldown - dt);
    // Decide a turn inside the intersection: update the road record with the turn —
    // a car that turns without updating its road is the bug that cut through the park.
    if (inIntersection(city, car.x, car.y) && car.turnCooldown <= 0) {
      const cross = car.road.axis === 'v'
        ? { axis: 'h', center: nearestHCross(car.y) }
        : { axis: 'v', center: nearestVCross(car.x) };
      if (cross.center !== null && random() < 0.4) {
        const dir = random() < 0.5 ? 1 : -1;
        car.road = { axis: cross.axis, center: cross.center, dir };
        car.angle = cross.axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
        car.turnCooldown = 1.2;
      } else {
        car.turnCooldown = 0.4;
      }
    }
    // The vertical roads end at the beach (y 1700): a car that reaches the end of its
    // road turns around instead of driving onto the sand.
    if (car.road.axis === 'v' && car.road.dir > 0 && car.y > 1640) {
      car.road.dir = -1;
      car.angle = -Math.PI / 2;
      car.turnCooldown = 1.2;
    }
    // Ease onto the lane centre of the road the car is actually on, then drive along it.
    const lane = laneOffset(car);
    if (car.road.axis === 'v') {
      car.x += (car.road.center + lane - car.x) * Math.min(1, 3 * dt);
      car.y += Math.sin(car.angle) * car.speed * dt;
    } else {
      car.y += (car.road.center + lane - car.y) * Math.min(1, 3 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
    }
    // Keep on the map: respawn if it drove off an edge, or if it got stuck.
    car.stuckTimer = Math.abs(car.speed) < 8 ? car.stuckTimer + dt : 0;
    const offMap = car.x < 40 || car.x > WORLD.width - 40 || car.y < 40 || car.y > WORLD.height - 60;
    if (offMap || car.stuckTimer > 2.5) {
      const p = randomRoadPoint(random, city);
      const road = roadAt(city, p.x, p.y);
      if (road) {
        car.x = p.x;
        car.y = p.y;
        car.road = { axis: road.axis, center: road.center, dir: random() < 0.5 ? 1 : -1 };
        car.angle = road.axis === 'v' ? (car.road.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.road.dir > 0 ? 0 : Math.PI);
        car.speed = TRAFFIC.cruiseSpeed;
        car.stuckTimer = 0;
      }
    }
  }

  function updatePeds(dt) {
    const p = state.player;
    for (let i = state.peds.length - 1; i >= 0; i -= 1) {
      const ped = state.peds[i];
      if (ped.state === 'flee' || dist(ped.x, ped.y, p.x, p.y) < 130) {
        ped.state = 'flee';
        ped.panic = Math.max(ped.panic, 1.5);
      }
      if (ped.panic > 0) {
        ped.panic -= dt;
        const a = angleTo(p.x, p.y, ped.x, ped.y);
        ped.angle = a;
        const nx = ped.x + Math.cos(a) * PED.fleeSpeed * dt;
        const ny = ped.y + Math.sin(a) * PED.fleeSpeed * dt;
        if (!isBlocked(city, nx, ped.y, PED.radius)) ped.x = nx;
        if (!isBlocked(city, ped.x, ny, PED.radius)) ped.y = ny;
        if (ped.panic <= 0) ped.state = 'walk';
      } else {
        const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
        const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
        if (isBlocked(city, nx, ny, PED.radius) || random() < 0.002) {
          ped.angle = random() * Math.PI * 2;
        } else {
          ped.x = nx;
          ped.y = ny;
        }
      }
      // Run over by the player's car.
      if (!p.onFoot && p.car && dist(ped.x, ped.y, p.x, p.y) < 34) {
        state.peds.splice(i, 1);
        addParticles(ped.x, ped.y, '#ff5d6c', 10, 160);
        addWanted(WANTED.hitPed);
        say('You hit a pedestrian!', 3);
      }
    }
    while (state.peds.length < PED.count) spawnPed();
  }

  function updateCops(dt, events) {
    const p = state.player;
    const want = desiredPolice();
    const foot = state.cops.filter((c) => c.kind === 'foot').length;
    const cars = state.cops.filter((c) => c.kind === 'car').length;
    if (foot < want.foot) spawnFootCop();
    if (cars < want.car) spawnCopCar();
    // Thin the force out once the heat is gone and they are far away.
    if (state.wanted === 0 && state.cops.length > 0) {
      state.cops = state.cops.filter((c) => dist(c.x, c.y, p.x, p.y) < 700);
    }
    for (let i = state.cops.length - 1; i >= 0; i -= 1) {
      const cop = state.cops[i];
      if (cop.kind === 'foot') {
        const d = dist(cop.x, cop.y, p.x, p.y);
        cop.angle = angleTo(cop.x, cop.y, p.x, p.y);
        const nx = cop.x + Math.cos(cop.angle) * POLICE.footSpeed * dt;
        const ny = cop.y + Math.sin(cop.angle) * POLICE.footSpeed * dt;
        if (!isBlocked(city, nx, cop.y, 12)) cop.x = nx;
        if (!isBlocked(city, cop.x, ny, 12)) cop.y = ny;
        if (p.onFoot && d < POLICE.bustDistance && p.speed < 100) {
          state.over = true;
          return events | EVENT_BUSTED;
        }
        if (p.onFoot && d < 60) events = damagePlayer(12 * dt, events);
      } else if (cop.car) {
        const car = cop.car;
        const d = dist(car.x, car.y, p.x, p.y);
        const wantAngle = angleTo(car.x, car.y, p.x, p.y);
        car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, angleDiff(car.angle, wantAngle)));
        car.speed = Math.min(POLICE.carSpeed, car.speed + 420 * dt);
        const nx = car.x + Math.cos(car.angle) * car.speed * dt;
        const ny = car.y + Math.sin(car.angle) * car.speed * dt;
        if (!isBlocked(city, nx, ny, 22)) {
          car.x = nx;
          car.y = ny;
        } else {
          car.speed *= 0.4;
          car.angle += 0.9 * dt;
        }
        cop.x = car.x;
        cop.y = car.y;
        cop.angle = car.angle;
        // Ram the player's car: one thump per contact, not a continuous drain —
        // a per-frame damage rate killed the player in under two seconds.
        cop.ramCd = Math.max(0, (cop.ramCd || 0) - dt);
        if (!p.onFoot && p.car && d < 62 && cop.ramCd <= 0) {
          cop.ramCd = 1.0;
          p.car.speed *= 0.82;
          car.speed *= 0.6;
          state.shake = Math.max(state.shake, 6);
          events |= EVENT_CRASH;
          events = damagePlayer(8, events);
        }
        // At 4-5 stars the patrol cars shoot.
        if (state.wanted >= 4 && d < POLICE.shootRange) {
          cop.shootCd -= dt;
          if (cop.shootCd <= 0) {
            cop.shootCd = POLICE.shootCooldown;
            fireBullet(car.x, car.y, wantAngle, 'cop');
            events |= EVENT_SHOT;
          }
        }
        if (d > 1400) {
          state.cars.splice(state.cars.indexOf(car), 1);
          state.cops.splice(i, 1);
        }
      }
    }
    return events;
  }

  function updateGang(dt, events) {
    const p = state.player;
    for (const g of state.gang) {
      if (g.hp <= 0) continue;
      const d = dist(g.x, g.y, p.x, p.y);
      g.shootCd -= dt;
      if (d < 380 && g.shootCd <= 0) {
        g.shootCd = 1.4;
        fireBullet(g.x, g.y, angleTo(g.x, g.y, p.x, p.y), 'cop');
        events |= EVENT_SHOT;
      }
    }
    return events;
  }

  function updateBullets(dt, events) {
    const p = state.player;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.x > WORLD.width || b.y < 0 || b.y > WORLD.height;
      if (!dead && b.from === 'player') {
        for (const g of state.gang) {
          if (g.hp > 0 && dist(b.x, b.y, g.x, g.y) < 18) {
            g.hp -= PISTOL.damage;
            addParticles(b.x, b.y, '#ff5d6c', 6, 120);
            if (g.hp <= 0) {
              addWanted(1);
              say('Rival down.', 2);
            }
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (const cop of state.cops) {
            if (dist(b.x, b.y, cop.x, cop.y) < 18) {
              if (cop.kind === 'foot') cop.hp -= PISTOL.damage;
              addParticles(b.x, b.y, '#4fa8ff', 6, 120);
              addWanted(WANTED.kill);
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (let pi = state.peds.length - 1; pi >= 0; pi -= 1) {
            const ped = state.peds[pi];
            if (dist(b.x, b.y, ped.x, ped.y) < 14) {
              state.peds.splice(pi, 1);
              addParticles(b.x, b.y, '#ff5d6c', 8, 140);
              addWanted(WANTED.hitPed);
              dead = true;
              break;
            }
          }
        }
      } else if (!dead && b.from !== 'player') {
        const hitR = p.onFoot ? PLAYER.radius + 4 : 30;
        if (dist(b.x, b.y, p.x, p.y) < hitR) {
          events = damagePlayer(9, events);
          dead = true;
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
    return events;
  }

  function updatePickups(dt, events) {
    const p = state.player;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pk = state.pickups[i];
      if (dist(p.x, p.y, pk.x, pk.y) < PICKUP.radius + 14) {
        if (pk.kind === 'health') {
          state.player.hp = Math.min(PLAYER.hp, state.player.hp + PICKUP.health);
          say(`Health +${PICKUP.health}`, 2);
        } else {
          state.ammo = Math.min(PISTOL.maxAmmo, state.ammo + PICKUP.ammo);
          say(`Ammo +${PICKUP.ammo}`, 2);
        }
        state.pickups.splice(i, 1);
        addParticles(pk.x, pk.y, '#7dff9e', 8, 120);
        events |= EVENT_PICKUP;
      }
    }
    while (state.pickups.length < PICKUP.count) spawnPickup(random() < 0.5 ? 'health' : 'ammo');
    return events;
  }

  function updateWanted(dt) {
    const p = state.player;
    const nearest = nearestCopDist(p.x, p.y);
    if (nearest < 450) state.unseenTimer = 0;
    else state.unseenTimer += dt;
    if (state.wanted > 0 && state.unseenTimer > WANTED.decayDelay) {
      state.wantedTimer += dt;
      if (state.wantedTimer >= WANTED.decayInterval) {
        state.wantedTimer = 0;
        state.wanted -= 1;
        if (state.wanted === 0) say('You lost them. Heat is off.', 3);
      }
    } else state.wantedTimer = 0;
  }

  function reset() {
    state.player.x = 1280;
    state.player.y = 900;
    state.player.angle = -Math.PI / 2;
    state.player.hp = PLAYER.hp;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.punchCd = 0;
    state.player.shootCd = 0;
    state.player.speed = 0;
    state.cars = [];
    state.peds = [];
    state.cops = [];
    state.gang = [];
    state.bullets = [];
    state.particles = [];
    state.pickups = [];
    state.wanted = 0;
    state.wantedTimer = 0;
    state.unseenTimer = 0;
    state.cash = 0;
    state.ammo = PISTOL.ammoStart;
    state.clock = 17.5 * 3600;
    state.elapsed = 0;
    state.message = '';
    state.messageTimer = 0;
    state.banner = '';
    state.bannerTimer = 0;
    state.shake = 0;
    state.over = false;
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar();
    for (let i = 0; i < 8; i += 1) spawnParkedCar();
    for (let i = 0; i < PED.count; i += 1) spawnPed();
    for (let i = 0; i < PICKUP.count; i += 1) spawnPickup(i % 2 === 0 ? 'health' : 'ammo');
    setMission(0);
  }

  function step(dt, input, ambient = false) {
    let events = 0;
    state.elapsed += dt;
    state.clock += dt;
    state.messageTimer = Math.max(0, state.messageTimer - dt);
    state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    state.shake = Math.max(0, state.shake - 30 * dt);
    // Particles always age, even on the title screen.
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    if (state.over) return events;
    events = updatePlayer(dt, input, events);
    if (state.over) return events;
    for (const car of state.cars) if (car.kind === 'traffic') updateTrafficCar(dt, car);
    updatePeds(dt);
    events = updateCops(dt, events);
    if (state.over) return events;
    events = updateGang(dt, events);
    events = updateBullets(dt, events);
    if (state.over) return events;
    events = updatePickups(dt, events);
    updateWanted(dt);
    if (!ambient) events = updateMissions(dt, events);
    // Slow health regen once the player has been safe for a while.
    if (state.player.hurtTimer <= 0 && state.player.hp > 0 && state.player.hp < PLAYER.hp) {
      state.player.hp = Math.min(PLAYER.hp, state.player.hp + 2 * dt);
    }
    // Car-on-car bumps: push apart, scrub speed, shake on hard hits. A push that would
    // shove a car into a building or off the road is skipped for that car — an unchecked
    // push is what used to drive cars through blocks and off the map.
    for (let i = 0; i < state.cars.length; i += 1) {
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const a = state.cars[i];
        const b = state.cars[j];
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < 58 && d > 0.01) {
          const push = (58 - d) / 2;
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          if (!isBlocked(city, a.x - nx * push, a.y - ny * push, 20)) {
            a.x -= nx * push;
            a.y -= ny * push;
          }
          if (!isBlocked(city, b.x + nx * push, b.y + ny * push, 20)) {
            b.x += nx * push;
            b.y += ny * push;
          }
          const rel = Math.abs(a.speed - b.speed);
          if (rel > 90) {
            a.speed *= 0.7;
            b.speed *= 0.7;
            state.shake = Math.max(state.shake, 5);
            events |= EVENT_CRASH;
            addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffb84d', 6, 150);
          }
        }
      }
    }
    return events;
  }

  reset();

  return {
    state,
    city,
    reset,
    step,
    setMission,
    addWanted,
    enterCar,
    exitCar,
    spawnTrafficCar,
    spawnParkedCar,
    spawnCopCar,
    spawnFootCop,
    nearestCar,
    say,
    showBanner,
    addParticles,
    fireBullet,
  };
}
