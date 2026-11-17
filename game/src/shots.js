// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot, so the frame is what a short game really looks like and the same seed
// always gives the same frame.
//
// The driving autopilot steers by road, not by compass: it follows the road it is on
// toward the target, turns at intersections onto the road that closes the distance,
// and slows right down for the turn — a fast car that aims straight at a point
// overshoots every corner (the bug that cost the first attempt its drive shot).
import { STEP } from './config.js';
import { roadAt, inIntersection, nearestIntersection } from './city.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const DRIVE_SECONDS = 10;
const CHASE_SECONDS = 11;
const MISSION_SECONDS = 5;

/** An empty input frame: the autopilot fills in what it needs each step. */
function blankInput() {
  return {
    move: { x: 0, y: 0, sprint: false, brake: false, up: false, down: false, left: false, right: false },
    enter: false,
    punch: false,
    shoot: false,
    aim: null,
  };
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Drive the player's car toward a world point along the roads. Returns the input for
 * this step. `memory` keeps the stuck-recovery state between calls.
 */
function driveToward(state, target, memory) {
  const input = blankInput();
  const p = state.player;
  const car = p.car;
  if (!car) return input;
  const city = state.city;

  // Stuck recovery, measured over a one-second window: a per-step check fires
  // spuriously while the car is just turning slowly. If the car has barely moved
  // in a full second, reverse out, then retry.
  memory.checkTimer = (memory.checkTimer || 0) + 1;
  if (memory.checkTimer >= 60) {
    memory.checkTimer = 0;
    const moved = Math.hypot(p.x - memory.lastX, p.y - memory.lastY);
    memory.lastX = p.x;
    memory.lastY = p.y;
    if (moved < 40) {
      memory.reversing = 50;
      memory.reverseSteer = Math.random() < 0.5;
      return input;
    }
  }
  if (memory.reversing > 0) {
    memory.reversing -= 1;
    input.move.down = true;
    input.move.left = memory.reverseSteer;
    return input;
  }

  // Off the road (a police ram can shove the car off it): head for the nearest
  // intersection first, then resume following the roads from there.
  const road = roadAt(city, p.x, p.y);
  if (!road) {
    const ix = nearestIntersection(city, p.x, p.y);
    const wantAngle = Math.atan2(ix.y - p.y, ix.x - p.x);
    const err = angleDiff(car.angle, wantAngle);
    const speed = Math.abs(car.speed);
    if (Math.abs(err) > 0.9 && speed > 90) input.move.brake = true;
    else input.move.up = true;
    if (err > 0.12) input.move.right = true;
    else if (err < -0.12) input.move.left = true;
    return input;
  }
  // Which way along the roads? At an intersection, take the road that closes the
  // bigger gap to the target; between intersections, stay on the current road.
  let wantAngle = car.angle;
  if (inIntersection(city, p.x, p.y)) {
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      wantAngle = dx > 0 ? 0 : Math.PI;
    } else if (Math.abs(dy) > 60) {
      wantAngle = dy > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    memory.wantAngle = wantAngle;
  } else if (road) {
    // Between intersections: keep the recorded direction of the current road.
    wantAngle = memory.wantAngle ?? car.angle;
    if (road.axis === 'v') wantAngle = Math.sin(car.angle) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    else wantAngle = Math.cos(car.angle) >= 0 ? 0 : Math.PI;
    memory.wantAngle = wantAngle;
  }

  const err = angleDiff(car.angle, wantAngle);
  const speed = Math.abs(car.speed);
  const distToTarget = Math.hypot(target.x - p.x, target.y - p.y);
  // Arriving: brake instead of driving through the target and off the road past it.
  if (distToTarget < 130) {
    if (speed > 40) input.move.brake = true;
  } else if (Math.abs(err) > 0.9 && speed > 90) {
    // Slow for the turn: full throttle only when nearly lined up, brake into a hard turn.
    input.move.brake = true;
  } else if (Math.abs(err) < 0.5 || speed < 60) {
    input.move.up = true;
  }
  if (err > 0.12) input.move.right = true;
  else if (err < -0.12) input.move.left = true;
  // Aim the camera's attention at the road ahead (unused by the world, kept for parity).
  input.aim = { wx: p.x + Math.cos(wantAngle) * 200, wy: p.y + Math.sin(wantAngle) * 200 };
  return input;
}

function stageStart(world) {
  world.reset();
  for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, null, true);
  return { screen: SCREEN_TITLE, best: 0 };
}

function stageDrive(world) {
  world.reset();
  // Start on the road at the centre junction, in a car, heading for the mission marker.
  const { state } = world;
  state.player.x = 1280;
  state.player.y = 720;
  const car = world.nearestCar(1280, 720, 500);
  if (car) world.enterCar(car);
  const memory = { lastX: state.player.x, lastY: state.player.y, still: 0, reversing: 0, reverseSteer: false, wantAngle: 0 };
  for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) {
    const target = state.marker || { x: 1760, y: 720 };
    world.step(STEP, driveToward(state, target, memory), false);
    if (state.over) break;
  }
  return { screen: SCREEN_PLAY, best: state.cash };
}

function stageChase(world) {
  world.reset();
  const { state } = world;
  // Mission 2 in its deliver phase: an objective, a live timer and a marker on screen.
  world.setMission(1);
  state.mission.phase = 'deliver';
  state.mission.timer = 90;
  state.mission.target = { ...state.city.safehouse };
  state.marker = { ...state.city.safehouse };
  state.player.x = 1280;
  state.player.y = 720;
  const car = world.nearestCar(1280, 720, 500);
  if (car) world.enterCar(car);
  world.addWanted(3);
  world.spawnCopCar();
  world.spawnCopCar();
  world.spawnFootCop();
  const memory = { lastX: state.player.x, lastY: state.player.y, still: 0, reversing: 0, reverseSteer: false, wantAngle: 0 };
  // Waypoints around the road network: when the car reaches one, it heads for the
  // next, so the chase keeps circling the city instead of running off the map edge.
  const waypoints = [
    { x: 2240, y: 1520 }, { x: 320, y: 320 }, { x: 800, y: 1520 }, { x: 1760, y: 320 },
  ];
  let waypoint = 0;
  for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
    const target = waypoints[waypoint];
    if (Math.hypot(state.player.x - target.x, state.player.y - target.y) < 160) {
      waypoint = (waypoint + 1) % waypoints.length;
    }
    world.step(STEP, driveToward(state, waypoints[waypoint], memory), false);
    if (state.over) break;
    // Keep the heat on: the chase must still be a 3-star chase in the final frame.
    if (state.wanted < 3) world.addWanted(3 - state.wanted);
  }
  return { screen: SCREEN_PLAY, best: state.cash };
}

function stageMission(world) {
  world.reset();
  const { state } = world;
  world.setMission(3);
  const alive = state.gang.filter((g) => g.hp > 0);
  const first = alive[0];
  if (first) {
    // On foot, close enough to fight, with the rival in view.
    state.player.x = first.x - 150;
    state.player.y = first.y + 40;
  }
  for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
    const input = blankInput();
    const target = state.gang.find((g) => g.hp > 0);
    if (target) {
      input.aim = { wx: target.x, wy: target.y };
      // Strafe a little so the frame reads as a firefight, not a still life.
      input.move.x = Math.sin(state.elapsed * 2) > 0 ? 0.6 : -0.6;
      input.shoot = true;
    }
    world.step(STEP, input, false);
    if (state.over) break;
  }
  return { screen: SCREEN_PLAY, best: state.cash };
}

/**
 * Set `world` to the named scene (start, drive, chase or mission; any other name is
 * start) and return the screen to draw over it and the best cash to show.
 */
export function stageShot(name, world) {
  if (name === 'drive') return stageDrive(world);
  if (name === 'chase') return stageChase(world);
  if (name === 'mission') return stageMission(world);
  return stageStart(world);
}
