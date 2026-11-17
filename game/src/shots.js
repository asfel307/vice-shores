// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot (a waypoint loop around one city block for the driving
// scenes, aim-at-the-nearest-rival for the mission scene), so the frame is what
// a short game really looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const DRIVE_SECONDS = 12;
const CHASE_SECONDS = 10;
const MISSION_SECONDS = 4.5;

/** A loop around one city block, on road centres, for the driving autopilot. */
const WAYPOINTS = [
  { x: 960, y: 320 },
  { x: 1600, y: 320 },
  { x: 1600, y: 960 },
  { x: 960, y: 960 },
];

const EMPTY = {
  up: false, down: false, left: false, right: false, sprint: false,
  handbrake: false, enter: false, punch: false, shoot: false,
};

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Put the player in a car parked on the road by the spawn point. */
function putPlayerInCar(state) {
  const car = state.cars.find((c) => c.parked) ?? state.cars[0];
  car.parked = false;
  car.driver = false;
  car.x = 960;
  car.y = 640;
  car.angle = -Math.PI / 2;
  car.speed = 0;
  state.player.inCar = true;
  state.player.car = car;
  state.player.x = car.x;
  state.player.y = car.y;
  return car;
}

/** Drive toward the next waypoint; brake when another car is right ahead, ease
 * off before corners (a 540 px/s car cannot turn on a 112-wide road), and
 * reverse out when stuck against a building. `cap` is the cruise speed. */
function driveAutopilot(state, waypoint, brake, cap, stuck) {
  const car = state.player.car;
  const wp = WAYPOINTS[waypoint % WAYPOINTS.length];
  const desired = Math.atan2(wp.y - car.y, wp.x - car.x);
  const diff = angleDiff(car.angle, desired);
  const nearCorner = Math.hypot(wp.x - car.x, wp.y - car.y) < 200;
  let blocked = false;
  if (brake) {
    for (const other of state.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 90 && side < 30) blocked = true;
    }
  }
  if (stuck > 0) {
    return { ...EMPTY, down: true, left: diff > 0, right: diff < 0 };
  }
  const slowDown = nearCorner && Math.abs(car.speed) > 200;
  return {
    ...EMPTY,
    up: !blocked && !slowDown && Math.abs(car.speed) < cap,
    down: blocked || slowDown,
    left: diff < -0.06,
    right: diff > 0.06,
  };
}

/** Step the world with the driving autopilot for `seconds` at cruise speed `cap`. */
function driveFor(state, world, seconds, brake, cap) {
  let waypoint = 0;
  let slow = 0;
  let stuck = 0;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const car = state.player.car;
    const wp = WAYPOINTS[waypoint % WAYPOINTS.length];
    if (Math.hypot(wp.x - car.x, wp.y - car.y) < 160) waypoint += 1;
    if (stuck > 0) stuck -= 1;
    else if (Math.abs(car.speed) < 40) {
      slow += 1;
      if (slow > 60) { stuck = 45; slow = 0; }
    } else slow = 0;
    world.step(STEP, driveAutopilot(state, waypoint, brake, cap, stuck));
  }
}

/** A police patrol car right behind the player, lights flashing. */
function addChaser(state, x, y, angle) {
  state.cars.push({
    x, y, angle, speed: 420, color: '#4f8ef7', police: true, parked: false,
    driver: true, axis: 'v', dir: 1, road: x, lane: 0, stopTimer: 0,
    sirenPhase: 0, shootCd: 2,
  });
}

/**
 * Set `world` to the named scene (start, drive, chase or mission; any other
 * name is start) and return the screen to draw over it and the best cash to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'drive') {
    putPlayerInCar(state);
    driveFor(state, world, DRIVE_SECONDS, true, 280);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'chase') {
    putPlayerInCar(state);
    state.wanted = 3;
    state.lastCrime = state.elapsed;
    // Let the police spawn and close in before the chase proper.
    for (let i = 0; i < 4 / STEP; i += 1) world.step(STEP, driveAutopilot(state, 0, false, 420, 0));
    driveFor(state, world, CHASE_SECONDS, false, 420);
    // The wanted level decays while quiet, so re-light it for the money shot,
    // and put one more patrol car right on the player's tail.
    state.wanted = 3;
    state.lastCrime = state.elapsed;
    const car = state.player.car;
    addChaser(state, car.x - Math.cos(car.angle) * 130, car.y - Math.sin(car.angle) * 130, car.angle);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'mission') {
    world.startMission(3);
    const target = state.gang[0];
    state.player.x = target.x - 110;
    state.player.y = target.y + 80;
    state.player.ammo = 60;
    state.player.health = 100;
    const steps = Math.floor(MISSION_SECONDS / STEP);
    for (let i = 0; i < steps; i += 1) {
      const alive = state.gang.find((g) => g.alive);
      const aim = alive ?? target;
      world.step(STEP, {
        ...EMPTY,
        shoot: true,
        aimX: aim.x,
        aimY: aim.y,
        up: Math.hypot(aim.x - state.player.x, aim.y - state.player.y) > 220,
      });
    }
    // Stage the heat at 2 stars: the firefight drew the police, but the shot
    // is about the mission, not a five-star siege.
    state.wanted = 2;
    state.lastCrime = state.elapsed;
    return { screen: SCREEN_PLAY, best: 1500 };
  }
  for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, EMPTY);
  return { screen: SCREEN_TITLE, best: 0 };
}
