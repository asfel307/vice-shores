// Vice Shores — every tuning number and colour in one place. The game draws a
// 1280x720 logical viewport over a 2560x1920 open world; the renderer scales it
// to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The open world: a grid city with a beach and water along the south edge. */
export const WORLD = { width: 2560, height: 1920 };

/** Roads: vertical centres, horizontal centres, width. Blocks sit between them. */
export const ROADS = {
  vertical: [320, 960, 1600, 2240],
  horizontal: [320, 960, 1440],
  width: 112,
};

/** Beach strip (sand then water) along the south edge of the world. */
export const BEACH = { sandY: 1680, waterY: 1800 };

export const PLAYER = {
  radius: 14,
  walkSpeed: 170,
  sprintSpeed: 260,
  health: 100,
  punchRange: 34,
  punchDamage: 25,
  punchCooldown: 0.45,
  shootCooldown: 0.22,
  invulnerable: 0.6,
};

export const CAR = {
  accel: 460,
  brake: 700,
  reverseMax: 170,
  maxSpeed: 540,
  steer: 2.6,
  grip: 6.0,
  handbrakeGrip: 1.6,
  length: 46,
  width: 22,
};

export const TRAFFIC = { count: 14, speed: 150, speedJitter: 45, parked: 8 };
export const PEDS = { count: 22, walkSpeed: 55, fleeSpeed: 150 };

export const POLICE = {
  footSpeed: 205,
  carSpeed: 560,
  bustDistance: 26,
  shootRange: 340,
  shootCooldown: 0.9,
  spawnDistance: 420,
};

/** Wanted stars 0-5: decay per second while unseen and quiet; crimes add stars. */
export const WANTED = {
  max: 5,
  decay: 0.12,
  stealSeen: 1,
  hitPed: 1,
  shootSeen: 1,
  killCop: 2,
  loseSightTime: 6,
};

export const PISTOL = { ammo: 24, maxAmmo: 120, damage: 34, range: 520, bulletSpeed: 900 };

export const MISSIONS = [
  { name: 'First Wheels', reward: 500 },
  { name: 'Package Run', reward: 800 },
  { name: 'Getaway', reward: 1000 },
  { name: 'Payback', reward: 1500 },
  { name: 'The Big Score', reward: 3000 },
  { name: 'King of Vice Shores', reward: 5000 },
];

export const CLOCK = { startMinutes: 17 * 60 + 40, minutesPerSecond: 0.5 };

export const PALETTE = {
  backdrop: '#1a1030',
  grass: '#3f7d54',
  parkGrass: '#57a05e',
  sand: '#e8c98f',
  water: '#1f8fb0',
  waterDeep: '#146a86',
  road: '#2c2d3a',
  roadEdge: '#3a3b4a',
  lane: '#f2c94c',
  sidewalk: '#8d8578',
  curb: '#6f6a5e',
  buildingRoof: '#f2a65a',
  text: '#fff7e8',
  muted: '#c9b8a8',
  gold: '#f2c94c',
  pink: '#ff5d8f',
  teal: '#37c8c3',
  orange: '#ff8a3d',
  red: '#e5534b',
  police: '#4f8ef7',
  panel: 'rgba(20, 12, 40, 0.88)',
  hudShadow: 'rgba(0, 0, 0, 0.45)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Pastel sunset building faces and traffic-car paint, picked by seeded index. */
export const BUILDING_COLORS = ['#f2a65a', '#e76f88', '#6fc3c9', '#f7d774', '#9b8cf2', '#ff8a5c', '#7dd8a0'];
export const CAR_COLORS = ['#e5534b', '#f2c94c', '#37c8c3', '#ff8a3d', '#9b8cf2', '#e8e8e8', '#5b8def', '#ff5d8f'];
export const PED_COLORS = ['#f2e6c9', '#c96f4a', '#7dd8a0', '#e5534b', '#6fc3c9', '#f7d774'];

/** Where the save (cash, missions done, best) is kept between visits. */
export const SAVE_KEY = 'vice-shores.save.v1';
export const BEST_KEY = 'vice-shores.best.v1';
