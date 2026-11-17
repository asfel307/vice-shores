// The game's rules and state, with no drawing and no browser in it: the player
// on foot and in cars, traffic, pedestrians, police, the wanted level, combat,
// pickups, the six-mission story and the clock. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react (sound, screens)
// without the world knowing about them.
import {
  BEACH, CAR, CLOCK, MISSIONS, PEDS, PISTOL, PLAYER, POLICE, STEP, TRAFFIC, WANTED, WORLD,
} from './config.js';
import { CAR_COLORS, PED_COLORS } from './config.js';
import { buildCity, collideBounds, collideBuildings, onRoad, randomRoadPoint, randomSidewalkPoint } from './city.js';

export const EVENT_SHOT = 1;
export const EVENT_HIT = 2;
export const EVENT_CRASH = 4;
export const EVENT_PICKUP = 8;
export const EVENT_MISSION = 16;
export const EVENT_WASTED = 32;
export const EVENT_BUSTED = 64;
export const EVENT_STEAL = 128;
export const EVENT_PUNCH = 256;
export const EVENT_GANG_DOWN = 512;

const TAU = Math.PI * 2;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function turnToward(angle, target, maxTurn) {
  let d = target - angle;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return angle + Math.max(-maxTurn, Math.min(maxTurn, d));
}

export function createWorld(random) {
  const city = buildCity(random);
  const player = {
    x: 960, y: 700, angle: -Math.PI / 2, health: PLAYER.health, cash: 0, ammo: PISTOL.ammo,
    inCar: false, car: null, speed: 0, punchCd: 0, shootCd: 0, invuln: 0, moving: false,
  };
  const cars = [];
  const peds = [];
  const cops = [];
  const bullets = [];
  const gang = [];
  const pickups = [];
  const particles = [];
  const mission = { index: 0, stage: 0, timer: 0, marker: null, text: '', progress: 0, done: 0, packageCarried: false };
  const camera = { x: 0, y: 0, shake: 0 };
  const state = {
    city, player, cars, peds, cops, bullets, gang, pickups, particles, mission, camera,
    wanted: 0, elapsed: 0, clock: CLOCK.startMinutes, storyDone: false, bustedCount: 0,
    lastCrime: -99, quiet: 0, copRemoveTimer: 0, pickupTimer: 4,
  };

  function addParticle(x, y, vx, vy, life, color, size) {
    if (particles.length > 220) particles.shift();
    particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * TAU;
      const s = speed * (0.4 + random() * 0.8);
      addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + random() * 0.4, color, 2 + random() * 3);
    }
  }

  function spawnCar(parked, police) {
    const p = randomRoadPoint(random, city);
    const car = {
      x: p.x, y: p.y,
      angle: p.vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI),
      speed: 0,
      color: police ? '#4f8ef7' : CAR_COLORS[Math.floor(random() * CAR_COLORS.length)],
      police: !!police, parked: !!parked, driver: !parked,
      axis: p.vertical ? 'v' : 'h',
      dir: random() < 0.5 ? 1 : -1,
      road: p.road,
      lane: 0, stopTimer: 0, sirenPhase: random() * TAU,
    };
    if (parked) {
      // Parked cars hug the curb, nose along the road.
      car.x = p.vertical ? p.x + (random() < 0.5 ? -44 : 44) : p.x;
      car.y = p.vertical ? p.y : p.y + (random() < 0.5 ? -44 : 44);
      car.angle = p.vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
    } else {
      car.speed = TRAFFIC.speed + random() * TRAFFIC.speedJitter;
      car.lane = car.axis === 'v' ? (car.dir > 0 ? -28 : 28) : (car.dir > 0 ? 28 : -28);
    }
    cars.push(car);
    return car;
  }

  function spawnPed() {
    const p = randomSidewalkPoint(random, city);
    const vertical = random() < 0.5;
    peds.push({
      x: p.x, y: p.y, angle: random() * TAU,
      road: vertical ? 'v' : 'h', roadPos: vertical ? p.x : p.y,
      along: vertical ? p.y : p.x, dir: random() < 0.5 ? 1 : -1,
      side: random() < 0.5 ? -1 : 1, speed: PEDS.walkSpeed * (0.8 + random() * 0.5),
      scared: 0, down: 0, color: PED_COLORS[Math.floor(random() * PED_COLORS.length)],
    });
  }

  function spawnFootCop() {
    const a = random() * TAU;
    const x = Math.max(30, Math.min(WORLD.width - 30, player.x + Math.cos(a) * POLICE.spawnDistance));
    const y = Math.max(30, Math.min(BEACH.sandY - 30, player.y + Math.sin(a) * POLICE.spawnDistance));
    cops.push({ x, y, angle: 0, speed: POLICE.footSpeed, shootCd: 1 + random() });
  }

  function spawnPatrolCar() {
    const a = random() * TAU;
    const car = spawnCar(false, true);
    car.x = Math.max(30, Math.min(WORLD.width - 30, player.x + Math.cos(a) * POLICE.spawnDistance));
    car.y = Math.max(30, Math.min(BEACH.sandY - 30, player.y + Math.sin(a) * POLICE.spawnDistance));
    car.speed = POLICE.carSpeed * 0.8;
    return car;
  }

  function spawnPickup(kind) {
    const p = randomRoadPoint(random, city);
    pickups.push({ x: p.x + (random() * 80 - 40), y: p.y + (random() * 80 - 40), kind });
  }

  function addWanted(amount) {
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    state.lastCrime = state.elapsed;
  }

  const MISSION_TEXTS = [
    'Steal a car — press E next to one',
    'Drive to the marker downtown',
    'Pick up the package at the marker',
    'Deliver the package before the timer runs out',
    'Lose the cops — get your wanted level to zero',
    'Take out the 3 rival gang members',
    'Rob the bank — stand at the door',
    'Escape to the safehouse with the cash',
    'Reach the checkpoints — lose nobody, lose nothing',
    'Final delivery — reach the pier marker',
  ];

  function missionMarkerFor(index, stage) {
    if (index === 0) return stage === 0 ? null : { x: 1600, y: 960 };
    if (index === 1) return stage === 0 ? { x: 1016, y: 376 } : { x: 2240, y: 320 };
    if (index === 2) return null;
    if (index === 3) return gang.length > 0 ? { x: gang[0].x, y: gang[0].y } : null;
    if (index === 4) return stage === 0 ? { x: city.bank.x + city.bank.w / 2, y: city.bank.y + city.bank.h + 30 } : { x: city.safehouse.x + city.safehouse.w / 2, y: city.safehouse.y + city.safehouse.h + 30 };
    if (index === 5) return [{ x: 2240, y: 1440 }, { x: 960, y: 320 }, { x: 1600, y: 1600 }][stage] ?? { x: 320, y: 1600 };
    return null;
  }

  function missionTextFor(index, stage) {
    if (index === 0) return MISSION_TEXTS[stage];
    if (index === 1) return MISSION_TEXTS[2 + stage];
    if (index === 2) return MISSION_TEXTS[4];
    if (index === 3) return MISSION_TEXTS[5];
    if (index === 4) return MISSION_TEXTS[6 + stage];
    if (index === 5) return MISSION_TEXTS[8 + Math.min(stage, 1)];
    return 'Free roam — Vice Shores is yours';
  }

  function startMission(index) {
    mission.index = index;
    mission.stage = 0;
    mission.timer = 0;
    mission.progress = 0;
    mission.packageCarried = false;
    if (index === 1) mission.timer = 0;
    if (index === 2) {
      state.wanted = 2;
      state.lastCrime = state.elapsed;
    }
    if (index === 3) {
      gang.length = 0;
      const spots = [{ x: 960, y: 1300 }, { x: 1300, y: 700 }, { x: 1900, y: 1100 }];
      for (const s of spots) gang.push({ x: s.x, y: s.y, angle: 0, health: 60, alive: true, shootCd: 1.5 });
    }
    if (index === 4) state.wanted = Math.max(state.wanted, 0);
    if (index === 5) {
      state.wanted = 4;
      state.lastCrime = state.elapsed;
    }
    mission.marker = missionMarkerFor(index, 0);
    mission.text = missionTextFor(index, 0);
  }

  function completeMission() {
    const reward = MISSIONS[mission.index].reward;
    player.cash += reward;
    mission.done += 1;
    let events = EVENT_MISSION;
    burst(player.x, player.y, '#f2c94c', 26, 260);
    if (mission.index >= MISSIONS.length - 1) {
      state.storyDone = true;
      mission.index = MISSIONS.length;
      mission.marker = null;
      mission.text = 'King of Vice Shores — free roam';
    } else {
      startMission(mission.index + 1);
    }
    return events;
  }

  function reset() {
    player.x = 960;
    player.y = 700;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.cash = 0;
    player.ammo = PISTOL.ammo;
    player.inCar = false;
    player.car = null;
    player.speed = 0;
    player.punchCd = 0;
    player.shootCd = 0;
    player.invuln = 0;
    cars.length = 0;
    peds.length = 0;
    cops.length = 0;
    bullets.length = 0;
    gang.length = 0;
    pickups.length = 0;
    particles.length = 0;
    state.wanted = 0;
    state.elapsed = 0;
    state.clock = CLOCK.startMinutes;
    state.storyDone = false;
    state.bustedCount = 0;
    state.lastCrime = -99;
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnCar(false, false);
    for (let i = 0; i < TRAFFIC.parked; i += 1) spawnCar(true, false);
    for (let i = 0; i < PEDS.count; i += 1) spawnPed();
    spawnPickup('health');
    spawnPickup('ammo');
    spawnPickup('health');
    startMission(0);
    camera.x = player.x - 640;
    camera.y = player.y - 360;
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function hurtPlayer(damage, fromX, fromY) {
    if (player.invuln > 0) return 0;
    player.health -= damage;
    player.invuln = PLAYER.invulnerable;
    burst(player.x, player.y, '#e5534b', 10, 200);
    camera.shake = Math.max(camera.shake, 7);
    return EVENT_HIT;
  }

  function shootBullet(x, y, angle, fromPlayer, damage) {
    bullets.push({
      x: x + Math.cos(angle) * 20, y: y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * PISTOL.bulletSpeed, vy: Math.sin(angle) * PISTOL.bulletSpeed,
      life: PISTOL.range / PISTOL.bulletSpeed, fromPlayer, damage,
    });
  }

  function stepPlayer(dt, input) {
    let events = 0;
    player.punchCd = Math.max(0, player.punchCd - dt);
    player.shootCd = Math.max(0, player.shootCd - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    if (player.health < PLAYER.health && state.wanted === 0) player.health = Math.min(PLAYER.health, player.health + 3 * dt);

    if (input.enter) {
      if (player.inCar) {
        const car = player.car;
        player.inCar = false;
        player.car = null;
        player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
        player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
        player.angle = car.angle;
        car.speed = 0;
      } else {
        const car = nearestCar(player.x, player.y, 62);
        if (car) {
          player.inCar = true;
          player.car = car;
          car.parked = false;
          car.driver = false;
          car.speed = 0;
          events |= EVENT_STEAL;
          let seen = false;
          for (const cop of cops) if (dist(player.x, player.y, cop.x, cop.y) < 320) seen = true;
          for (const c of cars) if (c.police && dist(player.x, player.y, c.x, c.y) < 320) seen = true;
          if (seen) addWanted(WANTED.stealSeen);
        }
      }
    }

    if (player.inCar) {
      const car = player.car;
      const forward = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      if (forward > 0) car.speed += CAR.accel * dt;
      else if (forward < 0) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.5) * dt;
      else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 240 * dt);
      car.speed = Math.max(-CAR.reverseMax, Math.min(CAR.maxSpeed, car.speed));
      const grip = input.handbrake ? CAR.handbrakeGrip : CAR.grip;
      const steerAmount = steer * CAR.steer * dt * Math.min(1, Math.abs(car.speed) / 140) * Math.sign(car.speed || 1);
      car.angle += steerAmount * (input.handbrake ? 1.6 : 1);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const circle = { x: nx, y: ny, r: 20 };
      let crashed = collideBuildings(city, circle) || collideBounds(city, circle);
      car.x = circle.x;
      car.y = circle.y;
      if (crashed && Math.abs(car.speed) > 120) {
        events |= EVENT_CRASH;
        camera.shake = Math.max(camera.shake, 9);
        burst(car.x, car.y, '#f2c94c', 12, 220);
        car.speed *= 0.35;
      } else if (crashed) {
        car.speed *= 0.6;
      }
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      player.speed = Math.abs(car.speed);
      if (input.handbrake && Math.abs(car.speed) > 180 && random() < 0.6) {
        addParticle(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 0, 0, 0.4, '#c9c9c9', 3);
      }
      // Running over a pedestrian is a crime the whole street sees.
      for (const ped of peds) {
        if (ped.down > 0) continue;
        if (dist(car.x, car.y, ped.x, ped.y) < 26 && Math.abs(car.speed) > 60) {
          ped.down = 3;
          ped.scared = 5;
          addWanted(WANTED.hitPed);
          events |= EVENT_CRASH;
          camera.shake = Math.max(camera.shake, 6);
          burst(ped.x, ped.y, '#e5534b', 8, 160);
        }
      }
    } else {
      const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      const moving = mx !== 0 || my !== 0;
      player.moving = moving;
      const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      if (moving) {
        const len = Math.hypot(mx, my);
        player.angle = Math.atan2(my / len, mx / len);
        player.x += (mx / len) * speed * dt;
        player.y += (my / len) * speed * dt;
        player.speed = speed;
        const circle = { x: player.x, y: player.y, r: PLAYER.radius };
        collideBuildings(city, circle);
        collideBounds(city, circle);
        player.x = circle.x;
        player.y = circle.y;
      } else {
        player.speed = 0;
      }
      // Aim follows the mouse when one is given; otherwise the walk direction.
      if (input.aimX !== undefined) player.angle = angleTo(player.x, player.y, input.aimX, input.aimY);
    }

    if (input.punch && player.punchCd <= 0 && !player.inCar) {
      player.punchCd = PLAYER.punchCooldown;
      events |= EVENT_PUNCH;
      const targets = [];
      for (const ped of peds) if (ped.down <= 0) targets.push({ x: ped.x, y: ped.y, kind: 'ped', ref: ped });
      for (const cop of cops) targets.push({ x: cop.x, y: cop.y, kind: 'cop', ref: cop });
      for (const g of gang) if (g.alive) targets.push({ x: g.x, y: g.y, kind: 'gang', ref: g });
      for (const t of targets) {
        const d = dist(player.x, player.y, t.x, t.y);
        if (d < PLAYER.punchRange + 14) {
          if (t.kind === 'gang') {
            t.ref.health -= PLAYER.punchDamage;
            burst(t.x, t.y, '#ff8a3d', 8, 180);
            if (t.ref.health <= 0) {
              t.ref.alive = false;
              events |= EVENT_GANG_DOWN;
              addWanted(1);
            }
          } else if (t.kind === 'cop') {
            addWanted(WANTED.killCop);
            cops.splice(cops.indexOf(t.ref), 1);
            burst(t.x, t.y, '#4f8ef7', 10, 200);
          } else {
            t.ref.down = 3;
            addWanted(WANTED.hitPed);
            burst(t.x, t.y, '#e5534b', 8, 160);
          }
          break;
        }
      }
    }

    if (input.shoot && player.shootCd <= 0 && !player.inCar) {
      if (player.ammo > 0) {
        player.shootCd = PLAYER.shootCooldown;
        player.ammo -= 1;
        const aim = input.aimX !== undefined ? angleTo(player.x, player.y, input.aimX, input.aimY) : player.angle;
        shootBullet(player.x, player.y, aim, true, PISTOL.damage);
        events |= EVENT_SHOT;
        camera.shake = Math.max(camera.shake, 2.5);
        addParticle(player.x + Math.cos(aim) * 24, player.y + Math.sin(aim) * 24, Math.cos(aim) * 120, Math.sin(aim) * 120, 0.12, '#ffd76a', 4);
        let seen = false;
        for (const cop of cops) if (dist(player.x, player.y, cop.x, cop.y) < 420) seen = true;
        for (const c of cars) if (c.police && dist(player.x, player.y, c.x, c.y) < 420) seen = true;
        if (seen) addWanted(WANTED.shootSeen);
      } else {
        player.shootCd = 0.3;
      }
    }
    return events;
  }

  function stepTraffic(dt) {
    for (const car of cars) {
      if (car.parked || car === player.car) continue;
      if (car.police) continue; // police cars are steered by stepPolice
      if (car.stopTimer > 0) {
        car.stopTimer -= dt;
        car.speed = Math.max(0, car.speed - 300 * dt);
      } else {
        car.speed += ((TRAFFIC.speed + 40) - car.speed) * Math.min(1, dt);
      }
      // Stop for the car ahead on the same lane.
      for (const other of cars) {
        if (other === car || other.parked) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const ahead = car.axis === 'v' ? dy * car.dir : dx * car.dir;
        const side = car.axis === 'v' ? Math.abs(dx) : Math.abs(dy);
        if (ahead > 0 && ahead < 64 && side < 30) {
          car.speed = Math.max(0, car.speed - 500 * dt);
          if (ahead < 40) car.stopTimer = 0.4;
        }
      }
      const step = car.speed * dt;
      if (car.axis === 'v') car.y += car.dir * step;
      else car.x += car.dir * step;
      // At an intersection, sometimes turn onto the crossing road.
      const roads = car.axis === 'v' ? city.roads.horizontal : city.roads.vertical;
      const along = car.axis === 'v' ? car.y : car.x;
      for (const r of roads) {
        if (Math.abs(along - r) < 6 && random() < 0.012) {
          if (car.axis === 'v') {
            car.axis = 'h';
            car.dir = random() < 0.5 ? 1 : -1;
            car.road = r;
            car.lane = car.dir > 0 ? 28 : -28;
            car.y = r + car.lane;
          } else {
            car.axis = 'v';
            car.dir = random() < 0.5 ? 1 : -1;
            car.road = r;
            car.lane = car.dir > 0 ? -28 : 28;
            car.x = r + car.lane;
          }
          break;
        }
      }
      // Keep the car on its lane and inside the world.
      if (car.axis === 'v') {
        car.x += (car.road + car.lane - car.x) * Math.min(1, 3 * dt);
        if (car.y < 30) { car.y = 30; car.dir = 1; }
        if (car.y > BEACH.sandY - 30) { car.y = BEACH.sandY - 30; car.dir = -1; }
        car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.y += (car.road + car.lane - car.y) * Math.min(1, 3 * dt);
        if (car.x < 30) { car.x = 30; car.dir = 1; }
        if (car.x > WORLD.width - 30) { car.x = WORLD.width - 30; car.dir = -1; }
        car.angle = car.dir > 0 ? 0 : Math.PI;
      }
    }
    // Car-to-car bumps: push apart, trade a little speed.
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < 40 && d > 0.01) {
          const push = (40 - d) / 2;
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          if (a === player.car || b === player.car) {
            const other = a === player.car ? b : a;
            if (Math.abs(player.car.speed) > 100) {
              camera.shake = Math.max(camera.shake, 5);
              burst(other.x, other.y, '#f2c94c', 6, 140);
              player.car.speed *= 0.7;
            }
          }
        }
      }
    }
  }

  function stepPeds(dt) {
    for (const ped of peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        continue;
      }
      const threatX = player.inCar ? player.car.x : player.x;
      const threatY = player.inCar ? player.car.y : player.y;
      const threatD = dist(ped.x, ped.y, threatX, threatY);
      const playerFast = player.inCar ? Math.abs(player.car.speed) > 120 : false;
      if ((threatD < 130 && playerFast) || (threatD < 90 && state.elapsed - state.lastCrime < 2)) ped.scared = 2.5;
      if (ped.scared > 0) {
        ped.scared -= dt;
        ped.speed = PEDS.fleeSpeed;
        // Flee along the road, away from the threat.
        const alongThreat = ped.road === 'v' ? threatY : threatX;
        ped.dir = ped.along > alongThreat ? 1 : -1;
      } else {
        ped.speed = PEDS.walkSpeed * 0.9;
      }
      ped.along += ped.dir * ped.speed * dt;
      if (ped.along < 40) { ped.along = 40; ped.dir = 1; }
      if (ped.along > (ped.road === 'v' ? BEACH.sandY - 40 : WORLD.width - 40)) {
        ped.along = ped.road === 'v' ? BEACH.sandY - 40 : WORLD.width - 40;
        ped.dir = -1;
      }
      if (ped.road === 'v') {
        ped.x = ped.roadPos + ped.side * 72;
        ped.y = ped.along;
        ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        ped.x = ped.along;
        ped.y = ped.roadPos + ped.side * 72;
        ped.angle = ped.dir > 0 ? 0 : Math.PI;
      }
      // Sometimes turn onto a crossing road at an intersection.
      const roads = ped.road === 'v' ? city.roads.horizontal : city.roads.vertical;
      for (const r of roads) {
        if (Math.abs(ped.along - r) < 8 && random() < 0.004) {
          if (ped.road === 'v') {
            ped.road = 'h';
            ped.roadPos = r;
            ped.along = ped.x;
          } else {
            ped.road = 'v';
            ped.roadPos = r;
            ped.along = ped.y;
          }
          ped.side = random() < 0.5 ? -1 : 1;
          ped.dir = random() < 0.5 ? 1 : -1;
          break;
        }
      }
    }
  }

  function stepPolice(dt) {
    const wantedInt = Math.floor(state.wanted);
    const wantFoot = wantedInt >= 1 ? Math.min(wantedInt, 3) : 0;
    const wantCars = wantedInt >= 2 ? Math.min(wantedInt - 1, 3) : 0;
    const patrolCars = cars.filter((c) => c.police && c !== player.car);
    if (cops.length < wantFoot && random() < dt * 2) spawnFootCop();
    if (patrolCars.length < wantCars && random() < dt * 1.5) spawnPatrolCar();
    if (state.wanted === 0) {
      state.copRemoveTimer -= dt;
      if (state.copRemoveTimer <= 0) {
        state.copRemoveTimer = 1;
        if (cops.length > 0) cops.shift();
        const pc = cars.find((c) => c.police && c !== player.car);
        if (pc) cars.splice(cars.indexOf(pc), 1);
      }
    }
    // Foot cops chase; at 4-5 stars they shoot; touching a slow player busts them.
    let events = 0;
    for (let i = cops.length - 1; i >= 0; i -= 1) {
      const cop = cops[i];
      const d = dist(cop.x, cop.y, player.x, player.y);
      cop.angle = angleTo(cop.x, cop.y, player.x, player.y);
      if (d > 30) {
        cop.x += Math.cos(cop.angle) * cop.speed * dt;
        cop.y += Math.sin(cop.angle) * cop.speed * dt;
        const circle = { x: cop.x, y: cop.y, r: 13 };
        collideBuildings(city, circle);
        collideBounds(city, circle);
        cop.x = circle.x;
        cop.y = circle.y;
      }
      cop.shootCd -= dt;
      if (wantedInt >= 4 && d < POLICE.shootRange && cop.shootCd <= 0) {
        cop.shootCd = POLICE.shootCooldown;
        shootBullet(cop.x, cop.y, cop.angle + (random() - 0.5) * 0.2, false, 9);
        events |= EVENT_SHOT;
      }
      if (!player.inCar && d < POLICE.bustDistance && player.speed < 80) {
        state.bustedCount += 1;
        events |= EVENT_BUSTED;
        return events;
      }
    }
    // Patrol cars chase and ram; at 4-5 stars the passenger shoots.
    for (const car of patrolCars) {
      const d = dist(car.x, car.y, player.x, player.y);
      const target = angleTo(car.x, car.y, player.x, player.y);
      car.angle = turnToward(car.angle, target, 2.2 * dt);
      const desired = d > 90 ? POLICE.carSpeed : POLICE.carSpeed * 0.55;
      car.speed += (desired - car.speed) * Math.min(1, 1.5 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const circle = { x: car.x, y: car.y, r: 20 };
      if (collideBuildings(city, circle) || collideBounds(city, circle)) car.speed *= 0.5;
      car.x = circle.x;
      car.y = circle.y;
      car.sirenPhase += dt * 6;
      if (player.inCar && d < 44) {
        player.car.speed *= 0.92;
        camera.shake = Math.max(camera.shake, 4);
        burst(car.x, car.y, '#4f8ef7', 5, 120);
      }
      car.shootCd = (car.shootCd ?? 1) - dt;
      if (wantedInt >= 4 && d < POLICE.shootRange && car.shootCd <= 0) {
        car.shootCd = POLICE.shootCooldown + 0.4;
        shootBullet(car.x, car.y, target + (random() - 0.5) * 0.25, false, 9);
        events |= EVENT_SHOT;
      }
    }
    return events;
  }

  function stepBullets(dt) {
    let events = 0;
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.x > WORLD.width || b.y < 0 || b.y > WORLD.height;
      if (!dead) {
        const circle = { x: b.x, y: b.y, r: 2 };
        if (collideBuildings(city, circle)) {
          dead = true;
          burst(b.x, b.y, '#ffd76a', 4, 120);
        }
      }
      if (!dead && b.fromPlayer) {
        for (const ped of peds) {
          if (ped.down > 0) continue;
          if (dist(b.x, b.y, ped.x, ped.y) < 16) {
            ped.down = 8;
            dead = true;
            addWanted(WANTED.hitPed);
            burst(ped.x, ped.y, '#e5534b', 8, 160);
            break;
          }
        }
        if (!dead) {
          for (let c = cops.length - 1; c >= 0; c -= 1) {
            if (dist(b.x, b.y, cops[c].x, cops[c].y) < 16) {
              cops.splice(c, 1);
              dead = true;
              addWanted(WANTED.killCop);
              burst(b.x, b.y, '#4f8ef7', 10, 200);
              break;
            }
          }
        }
        if (!dead) {
          for (const g of gang) {
            if (!g.alive) continue;
            if (dist(b.x, b.y, g.x, g.y) < 18) {
              g.health -= b.damage;
              dead = true;
              burst(g.x, g.y, '#ff8a3d', 8, 180);
              if (g.health <= 0) {
                g.alive = false;
                events |= EVENT_GANG_DOWN;
                addWanted(1);
              }
              break;
            }
          }
        }
      }
      if (!dead && !b.fromPlayer) {
        if (player.inCar) {
          if (dist(b.x, b.y, player.car.x, player.car.y) < 24) dead = true;
        } else if (dist(b.x, b.y, player.x, player.y) < 15) {
          dead = true;
          events |= hurtPlayer(b.damage, b.x - b.vx, b.y - b.vy);
        }
      }
      if (dead) bullets.splice(i, 1);
    }
    return events;
  }

  function stepGang(dt) {
    for (const g of gang) {
      if (!g.alive) continue;
      const d = dist(g.x, g.y, player.x, player.y);
      g.angle = angleTo(g.x, g.y, player.x, player.y);
      g.shootCd -= dt;
      if (d < 420 && g.shootCd <= 0 && !player.inCar) {
        g.shootCd = 1.1 + random() * 0.6;
        shootBullet(g.x, g.y, g.angle + (random() - 0.5) * 0.3, false, 8);
      }
    }
  }

  function stepPickups(dt) {
    state.pickupTimer -= dt;
    if (state.pickupTimer <= 0) {
      state.pickupTimer = 9;
      if (pickups.length < 6) spawnPickup(random() < 0.5 ? 'health' : 'ammo');
    }
    let events = 0;
    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const p = pickups[i];
      if (dist(player.x, player.y, p.x, p.y) < 32) {
        if (p.kind === 'health') player.health = Math.min(PLAYER.health, player.health + 40);
        else if (p.kind === 'ammo') player.ammo = Math.min(PISTOL.maxAmmo, player.ammo + 24);
        else player.cash += p.amount ?? 100;
        pickups.splice(i, 1);
        events |= EVENT_PICKUP;
        burst(p.x, p.y, '#7dd8a0', 10, 160);
      }
    }
    return events;
  }

  function stepMissions(dt) {
    let events = 0;
    const m = mission;
    if (m.index >= MISSIONS.length) return 0;
    const near = (x, y, r) => dist(player.x, player.y, x, y) < r;
    if (m.index === 0) {
      if (m.stage === 0 && player.inCar) {
        m.stage = 1;
        m.marker = missionMarkerFor(0, 1);
        m.text = missionTextFor(0, 1);
      } else if (m.stage === 1 && m.marker && near(m.marker.x, m.marker.y, 80)) {
        events |= completeMission();
      }
    } else if (m.index === 1) {
      if (m.stage === 0 && m.marker && near(m.marker.x, m.marker.y, 55)) {
        m.stage = 1;
        m.timer = 90;
        m.packageCarried = true;
        m.marker = missionMarkerFor(1, 1);
        m.text = missionTextFor(1, 1);
      } else if (m.stage === 1) {
        m.timer -= dt;
        if (m.marker && near(m.marker.x, m.marker.y, 70)) {
          events |= completeMission();
        } else if (m.timer <= 0) {
          // Too slow: the buyer walks. Run it again.
          m.stage = 0;
          m.timer = 0;
          m.packageCarried = false;
          m.marker = missionMarkerFor(1, 0);
          m.text = missionTextFor(1, 0);
        }
      }
    } else if (m.index === 2) {
      if (state.wanted < 0.5) events |= completeMission();
    } else if (m.index === 3) {
      if (gang.every((g) => !g.alive)) events |= completeMission();
      else if (m.marker) m.marker = missionMarkerFor(3, 0);
    } else if (m.index === 4) {
      if (m.stage === 0 && m.marker && near(m.marker.x, m.marker.y, 65)) {
        m.progress += dt;
        if (m.progress >= 3) {
          m.stage = 1;
          m.progress = 0;
          player.cash += 500;
          state.wanted = 3;
          state.lastCrime = state.elapsed;
          m.marker = missionMarkerFor(4, 1);
          m.text = missionTextFor(4, 1);
        }
      } else {
        m.progress = Math.max(0, m.progress - dt * 2);
      }
      if (m.stage === 1 && m.marker && near(m.marker.x, m.marker.y, 80)) events |= completeMission();
    } else if (m.index === 5) {
      if (m.marker && near(m.marker.x, m.marker.y, 80)) {
        if (m.stage >= 2) events |= completeMission();
        else {
          m.stage += 1;
          m.marker = missionMarkerFor(5, m.stage);
          m.text = missionTextFor(5, m.stage);
        }
      }
    }
    return events;
  }

  /**
   * One fixed step. `input` carries held keys, edge actions and the aim point
   * (world coordinates). Returns the events that happened, as bit flags.
   */
  function step(dt, input) {
    let events = 0;
    state.elapsed += dt;
    state.clock = (state.clock + CLOCK.minutesPerSecond * dt) % (24 * 60);
    if (state.elapsed - state.lastCrime > 4 && state.wanted > 0) {
      state.wanted = Math.max(0, state.wanted - WANTED.decay * dt);
    }
    events |= stepPlayer(dt, input);
    stepTraffic(dt);
    stepPeds(dt);
    events |= stepPolice(dt);
    events |= stepBullets(dt);
    stepGang(dt);
    events |= stepPickups(dt);
    events |= stepMissions(dt);
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (player.health <= 0) events |= EVENT_WASTED;
    // Camera follows the player, clamped to the world; shake decays.
    const tx = Math.max(0, Math.min(WORLD.width - 1280, player.x - 640));
    const ty = Math.max(0, Math.min(WORLD.height - 720, player.y - 360));
    camera.x += (tx - camera.x) * Math.min(1, 8 * dt);
    camera.y += (ty - camera.y) * Math.min(1, 8 * dt);
    camera.shake = Math.max(0, camera.shake - 26 * dt);
    return events;
  }

  reset();
  return { state, reset, step, startMission, completeMission };
}

export { STEP };
