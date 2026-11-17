// The city of Vice Shores: a road grid over a 2560x1920 island, blocks of buildings,
// a park, and a beach with water on the south edge. Everything is generated from the
// seeded random, so the same seed always builds the same city. This module owns the
// geometry and the collision questions; world.js owns what moves on it.
import { WORLD } from './config.js';
import { pick, range } from './random.js';

export const ROAD_W = 96;
export const ROADS_V = [320, 800, 1280, 1760, 2240];
export const ROADS_H = [320, 720, 1120, 1520];
const BEACH_TOP = 1700;
const WATER_TOP = 1820;

const ROOF_COLORS = ['#4b3a6e', '#5d3a4a', '#3a4a6e', '#6e4a2a', '#2f4a3a', '#5a3a5e', '#40355e'];
const WALL_COLORS = ['#7a5a8a', '#8a6a5a', '#5a7a8a', '#9a7a4a', '#6a8a6a', '#8a5a6a'];

function blockRanges(centers, limit) {
  const ranges = [];
  let prev = 0;
  for (const c of centers) {
    ranges.push([prev, c - ROAD_W / 2]);
    prev = c + ROAD_W / 2;
  }
  ranges.push([prev, limit]);
  return ranges;
}

export function buildCity(random) {
  const city = {
    roadsV: ROADS_V.slice(),
    roadsH: ROADS_H.slice(),
    roadW: ROAD_W,
    buildings: [],
    park: { x: 848, y: 768, w: 384, h: 304 },
    beach: { x: 0, y: BEACH_TOP, w: WORLD.width, h: WORLD.height - BEACH_TOP },
    waterTop: WATER_TOP,
    palms: [],
    props: [],
    bank: { x: 1520, y: 520 },
    safehouse: { x: 560, y: 1320 },
    packageSpot: { x: 1280, y: 320 },
  };

  // Buildings fill every block except the park block and the beach strip.
  const xs = blockRanges(ROADS_V, WORLD.width);
  const ys = blockRanges(ROADS_H, WORLD.height);
  for (let ix = 0; ix < xs.length; ix += 1) {
    for (let iy = 0; iy < ys.length; iy += 1) {
      const [x0, x1] = xs[ix];
      const [y0, y1] = ys[iy];
      if (y0 >= BEACH_TOP) continue;
      const isPark = x0 === 848 && y0 === 768;
      if (isPark) continue;
      const bw = x1 - x0;
      const bh = Math.min(y1, BEACH_TOP) - y0;
      if (bw < 90 || bh < 90) continue;
      // One or two buildings per block, with a sidewalk margin around them.
      const splits = bw > 300 && random() < 0.5 ? 2 : 1;
      for (let s = 0; s < splits; s += 1) {
        const sx0 = x0 + 14 + (s * bw) / splits;
        const sx1 = x0 + ((s + 1) * bw) / splits - 14;
        const w = Math.max(70, (sx1 - sx0) * range(random, 0.55, 0.8));
        const h = Math.max(70, bh * range(random, 0.55, 0.82));
        const x = sx0 + (sx1 - sx0 - w) / 2;
        const y = y0 + 14 + (bh - h) * random() * 0.6;
        city.buildings.push({
          x, y, w, h,
          roof: pick(random, ROOF_COLORS),
          wall: pick(random, WALL_COLORS),
          floors: 2 + Math.floor(random() * 5),
          seed: random(),
        });
      }
    }
  }

  // Palms: along the beach and inside the park.
  for (let x = 90; x < WORLD.width; x += 130) {
    city.palms.push({ x: x + range(random, -30, 30), y: BEACH_TOP + 60 + range(random, 0, 60) });
  }
  for (let i = 0; i < 14; i += 1) {
    city.palms.push({
      x: city.park.x + 30 + random() * (city.park.w - 60),
      y: city.park.y + 30 + random() * (city.park.h - 60),
    });
  }

  // Props: lamps and hydrants along the sidewalk edges of the roads.
  for (const vx of ROADS_V) {
    for (let y = 120; y < WORLD.height - 120; y += 260) {
      city.props.push({ kind: random() < 0.7 ? 'lamp' : 'hydrant', x: vx + ROAD_W / 2 + 12, y });
    }
  }
  for (const hy of ROADS_H) {
    for (let x = 140; x < WORLD.width - 120; x += 300) {
      city.props.push({ kind: random() < 0.7 ? 'lamp' : 'hydrant', x, y: hy + ROAD_W / 2 + 12 });
    }
  }
  return city;
}

/** True when the point is on asphalt (a road), including intersections. */
export function onRoad(city, x, y) {
  if (y >= BEACH_TOP) return false;
  for (const vx of city.roadsV) if (Math.abs(x - vx) <= city.roadW / 2) return true;
  for (const hy of city.roadsH) if (Math.abs(y - hy) <= city.roadW / 2) return true;
  return false;
}

/** The road the point is on, or null: { axis: 'v'|'h', center, along }. */
export function roadAt(city, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const vx of city.roadsV) {
    const d = Math.abs(x - vx);
    if (d <= city.roadW / 2 && d < bestDist) {
      best = { axis: 'v', center: vx, along: y };
      bestDist = d;
    }
  }
  for (const hy of city.roadsH) {
    const d = Math.abs(y - hy);
    if (d <= city.roadW / 2 && d < bestDist) {
      best = { axis: 'h', center: hy, along: x };
      bestDist = d;
    }
  }
  return best;
}

/** True when the point is inside an intersection (both a vertical and a horizontal road). */
export function inIntersection(city, x, y) {
  const onV = city.roadsV.some((vx) => Math.abs(x - vx) <= city.roadW / 2);
  const onH = city.roadsH.some((hy) => Math.abs(y - hy) <= city.roadW / 2);
  return onV && onH;
}

/** The building whose footprint (grown by r) contains the point, or null. */
export function buildingAt(city, x, y, r = 0) {
  for (const b of city.buildings) {
    if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return b;
  }
  return null;
}

/** True when the point is blocked for walking/driving: a building, the water, or off-map. */
export function isBlocked(city, x, y, r = 0) {
  if (x < 20 + r || x > WORLD.width - 20 - r || y < 20 + r || y > WORLD.height - 20 - r) return true;
  if (y >= city.waterTop) return true;
  return buildingAt(city, x, y, r) !== null;
}

export function inPark(city, x, y) {
  const p = city.park;
  return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
}

export function inBeach(city, x, y) {
  return y >= city.beach.y && y < city.waterTop;
}

/** A random point on a road, for spawning traffic and pedestrians. */
export function randomRoadPoint(random, city) {
  if (random() < 0.5) {
    const vx = pick(random, city.roadsV);
    return { x: vx + range(random, -28, 28), y: range(random, 80, BEACH_TOP - 80) };
  }
  const hy = pick(random, city.roadsH);
  return { x: range(random, 80, WORLD.width - 80), y: hy + range(random, -28, 28) };
}

/** The nearest intersection centre to a point (used by the driving autopilot). */
export function nearestIntersection(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const vx of city.roadsV) {
    for (const hy of city.roadsH) {
      const d = (vx - x) * (vx - x) + (hy - y) * (hy - y);
      if (d < bestD) {
        bestD = d;
        best = { x: vx, y: hy };
      }
    }
  }
  return best;
}

/** A random point on a sidewalk next to a road (pedestrian spawn). */
export function randomSidewalkPoint(random, city) {
  if (random() < 0.5) {
    const vx = pick(random, city.roadsV);
    return { x: vx + (random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 14), y: range(random, 80, BEACH_TOP - 80) };
  }
  const hy = pick(random, city.roadsH);
  return { x: range(random, 80, WORLD.width - 80), y: hy + (random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 14) };
}
