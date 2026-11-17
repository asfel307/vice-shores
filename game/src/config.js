// Every tuning number and colour in one place. The world is a fixed 2560x1920 open city;
// the renderer shows a 1280x720 window of it and follows the player, so no rule below
// depends on the screen size. Sunset/neon palette: Vice City by the shore.
export const WORLD = { width: 2560, height: 1920 };
export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  sprintSpeed: 265,
  hp: 100,
  punchDamage: 34,
  punchRange: 34,
  punchCooldown: 0.45,
};

export const CAR = {
  width: 46,
  length: 78,
  /** Engine force; top speed is capped below so a fast autopilot cannot overshoot a corner. */
  accel: 340,
  brake: 620,
  reverseAccel: 220,
  maxSpeed: 280,
  maxReverse: 130,
  /** Steering rate at full lock; it falls as speed rises so fast cars stay controllable. */
  turnRate: 2.7,
  drag: 0.55,
  handbrakeDrag: 2.4,
};

export const TRAFFIC = {
  count: 16,
  cruiseSpeed: 150,
  cruiseJitter: 45,
  /** Slow to this near an intersection so turns stay on the road. */
  cornerSpeed: 85,
  cornerDistance: 130,
};

export const PED = { count: 26, speed: 55, fleeSpeed: 150, radius: 11 };

export const POLICE = {
  footSpeed: 205,
  carSpeed: 295,
  /** How close a foot cop must get to bust a slow on-foot player. */
  bustDistance: 26,
  shootRange: 420,
  shootCooldown: 0.9,
  /** Seconds unseen before the heat starts to cool. */
  unseenGrace: 6,
};

export const WANTED = {
  max: 5,
  stealSeen: 1,
  hitPed: 1,
  shootSeen: 1,
  kill: 2,
  decayDelay: 8,
  decayInterval: 5,
};

export const PISTOL = { damage: 34, ammoStart: 24, maxAmmo: 120, range: 460, cooldown: 0.28 };

/** Pickups scattered around the city: health kits and ammo boxes. */
export const PICKUP = { health: 40, ammo: 24, radius: 16, count: 10 };

export const MISSIONS = [
  { id: 1, name: 'First Wheels', pay: 150, text: 'Steal a car and drive to the marker' },
  { id: 2, name: 'Package Run', pay: 300, text: 'Grab the package, deliver it before the timer runs out', timer: 90 },
  { id: 3, name: 'Getaway', pay: 400, text: 'Lose the cops — drop your wanted level to zero' },
  { id: 4, name: 'Payback', pay: 600, text: 'Take out 3 rival gang members' },
  { id: 5, name: 'The Big Score', pay: 1200, text: 'Rob the bank, then reach the safehouse with the heat on' },
  { id: 6, name: 'King of Vice Shores', pay: 2000, text: 'Final run: deliver the goods through the chase' },
];

export const PALETTE = {
  backdrop: '#1a1030',
  grass: '#1f6b4a',
  park: '#2a8a5c',
  sand: '#e8c98a',
  water: '#1e7fa8',
  waterDeep: '#14607f',
  road: '#2b2b3a',
  roadEdge: '#3d3d52',
  lane: '#f2d06b',
  sidewalk: '#4a4a5e',
  buildingRoof: '#3a2b4d',
  text: '#f5eefc',
  muted: '#b9a8d6',
  panel: 'rgba(16, 10, 32, 0.82)',
  cash: '#7dff9e',
  danger: '#ff5d6c',
  star: '#ffd94d',
  marker: '#ff4fd8',
  police: '#4fa8ff',
  player: '#ffcf3f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (cash, missions done, best) is kept between visits (this browser only). */
export const SAVE_KEY = 'vice-shores.save.v1';
