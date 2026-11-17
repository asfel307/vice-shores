// Vice Shores, the city itself: a road grid, blocks of pastel buildings, a park,
// a beach with palms along the south edge, and the props that dress it. buildCity
// is seeded, so the same seed always builds the same city. The world answers
// collision questions (buildings and water are solid) and road questions (where
// traffic drives and where the sidewalks run).
import { BEACH, BUILDING_COLORS, ROADS, WORLD } from './config.js';

const PARK = { x0: 1016, y0: 376, x1: 1544, y1: 904 };
const SAFEHOUSE_BLOCK = { x0: 376, y0: 1016, x1: 904, y1: 1384 };
const BANK_BLOCK = { x0: 1656, y0: 376, x1: 2184, y1: 904 };

function blockRanges() {
  const xs = [[16, 264], [376, 904], [1016, 1544], [1656, 2184], [2296, 2544]];
  const ys = [[16, 264], [376, 904], [1016, 1384], [1496, 1664]];
  const blocks = [];
  for (const [x0, x1] of xs) for (const [y0, y1] of ys) blocks.push({ x0, y0, x1, y1 });
  return blocks;
}

function makeBuilding(random, x0, y0, x1, y1, kind) {
  const w = x1 - x0;
  const h = y1 - y0;
  return {
    x: x0, y: y0, w, h,
    color: BUILDING_COLORS[Math.floor(random() * BUILDING_COLORS.length)],
    kind: kind ?? 'block',
    windowsX: Math.max(2, Math.floor(w / 46)),
    windowsY: Math.max(2, Math.floor(h / 46)),
    shade: 0.82 + random() * 0.18,
  };
}

export function buildCity(random) {
  const buildings = [];
  let safehouse = null;
  let bank = null;
  for (const block of blockRanges()) {
    const isPark = block.x0 === PARK.x0 && block.y0 === PARK.y0;
    const isSafe = block.x0 === SAFEHOUSE_BLOCK.x0 && block.y0 === SAFEHOUSE_BLOCK.y0;
    const isBank = block.x0 === BANK_BLOCK.x0 && block.y0 === BANK_BLOCK.y0;
    if (isPark) continue;
    const bw = block.x1 - block.x0;
    const bh = block.y1 - block.y0;
    const cols = bw > 420 ? 2 : 1;
    const rows = bh > 300 ? 2 : 1;
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        const pad = 26;
        const x0 = block.x0 + c * (bw / cols) + pad;
        const x1 = block.x0 + (c + 1) * (bw / cols) - pad;
        const y0 = block.y0 + r * (bh / rows) + pad;
        const y1 = block.y0 + (r + 1) * (bh / rows) - pad;
        const kind = isBank && c === 0 && r === 0 ? 'bank' : isSafe && c === 0 && r === 0 ? 'safehouse' : 'block';
        const b = makeBuilding(random, x0, y0, x1, y1, kind);
        buildings.push(b);
        if (kind === 'bank') bank = b;
        if (kind === 'safehouse') safehouse = b;
      }
    }
  }

  // Palms line the beach boardwalk; a few more shade the park.
  const palms = [];
  for (let x = 120; x < WORLD.width; x += 130) {
    palms.push({ x: x + random() * 40 - 20, y: BEACH.sandY + 26 + random() * 60, lean: random() * 0.6 - 0.3 });
  }
  for (let i = 0; i < 14; i += 1) {
    palms.push({ x: PARK.x0 + 40 + random() * (PARK.x1 - PARK.x0 - 80), y: PARK.y0 + 40 + random() * (PARK.y1 - PARK.y0 - 80), lean: random() * 0.6 - 0.3 });
  }

  // Lamps on every road corner, hydrants here and there on the sidewalks.
  const props = [];
  for (const x of ROADS.vertical) {
    for (const y of ROADS.horizontal) {
      props.push({ kind: 'lamp', x: x + ROADS.width / 2 + 8, y: y + ROADS.width / 2 + 8 });
      props.push({ kind: 'lamp', x: x - ROADS.width / 2 - 8, y: y - ROADS.width / 2 - 8 });
    }
  }
  for (let i = 0; i < 18; i += 1) {
    props.push({ kind: 'hydrant', x: 60 + random() * (WORLD.width - 120), y: 60 + random() * (BEACH.sandY - 120) });
  }

  return {
    roads: ROADS,
    buildings,
    park: PARK,
    palms,
    props,
    safehouse: safehouse ?? buildings[0],
    bank: bank ?? buildings[1],
    beach: BEACH,
  };
}

/** True when the point is on a road (within half the road width of a centre line). */
export function onRoad(city, x, y) {
  for (const rx of city.roads.vertical) if (Math.abs(x - rx) <= city.roads.width / 2) return true;
  for (const ry of city.roads.horizontal) if (Math.abs(y - ry) <= city.roads.width / 2) return true;
  return false;
}

/** True when the point is in the water (south of the water line). */
export function inWater(city, x, y) {
  return y >= city.beach.waterY;
}

/** True when the point is on the sand. */
export function onSand(city, x, y) {
  return y >= city.beach.sandY && y < city.beach.waterY;
}

/** Push a circle out of every building it overlaps; returns true when it hit one. */
export function collideBuildings(city, circle) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(circle.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(circle.y, b.y + b.h));
    const dx = circle.x - cx;
    const dy = circle.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= circle.r * circle.r) continue;
    hit = true;
    if (d2 === 0) {
      circle.y = b.y - circle.r;
      continue;
    }
    const d = Math.sqrt(d2);
    circle.x = cx + (dx / d) * circle.r;
    circle.y = cy + (dy / d) * circle.r;
  }
  return hit;
}

/** Clamp a circle inside the world and out of the water; returns true on a hit. */
export function collideBounds(city, circle) {
  let hit = false;
  if (circle.x < circle.r) { circle.x = circle.r; hit = true; }
  if (circle.x > WORLD.width - circle.r) { circle.x = WORLD.width - circle.r; hit = true; }
  if (circle.y < circle.r) { circle.y = circle.r; hit = true; }
  if (circle.y > city.beach.waterY - circle.r) { circle.y = city.beach.waterY - circle.r; hit = true; }
  return hit;
}

/** A random point on a road, for spawning traffic and parked cars. `road` is the centre line. */
export function randomRoadPoint(random, city) {
  if (random() < 0.5) {
    const rx = city.roads.vertical[Math.floor(random() * city.roads.vertical.length)];
    return { x: rx + (random() < 0.5 ? -28 : 28), y: 40 + random() * (city.beach.sandY - 80), vertical: true, road: rx };
  }
  const ry = city.roads.horizontal[Math.floor(random() * city.roads.horizontal.length)];
  return { x: 40 + random() * (WORLD.width - 80), y: ry + (random() < 0.5 ? -28 : 28), vertical: false, road: ry };
}

/** A random point on a sidewalk (just off a road), for pedestrians. */
export function randomSidewalkPoint(random, city) {
  const p = randomRoadPoint(random, city);
  if (p.vertical) p.x += p.x % 2 === 0 ? 72 : -72;
  else p.y += 72;
  p.x = Math.max(20, Math.min(WORLD.width - 20, p.x));
  p.y = Math.max(20, Math.min(city.beach.sandY - 20, p.y));
  return p;
}
