// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 viewport is scaled to fit the window and centred; the camera follows
// the player through the city. Flat shapes, canvas text for the HUD and panels,
// a warm sunset tint over everything.
import { BEACH, FIELD, FONT, PALETTE, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';

const MINIMAP = { x: FIELD.width - 216, y: 56, w: 200, h: 150 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const cashLabel = cachedLabel('$');
  const ammoLabel = cachedLabel('');
  const clockLabel = cachedLabel('');
  const speedLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = baseline ?? 'alphabetic';
    context.fillText(value, x, y);
  }

  function plainText(value, x, y, size, color, align, baseline) {
    if (!fonts.has(`p${size}`)) fonts.set(`p${size}`, `${size}px ${FONT}`);
    context.font = fonts.get(`p${size}`);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = baseline ?? 'alphabetic';
    context.fillText(value, x, y);
  }

  function drawGround(state) {
    const city = state.city;
    const cam = state.camera;
    const x0 = Math.max(0, cam.x - 40);
    const y0 = Math.max(0, cam.y - 40);
    const x1 = Math.min(WORLD.width, cam.x + FIELD.width + 40);
    const y1 = Math.min(WORLD.height, cam.y + FIELD.height + 40);
    context.fillStyle = PALETTE.grass;
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Beach sand, then water, along the south edge.
    context.fillStyle = PALETTE.sand;
    context.fillRect(x0, BEACH.sandY, x1 - x0, BEACH.waterY - BEACH.sandY);
    context.fillStyle = PALETTE.water;
    context.fillRect(x0, BEACH.waterY, x1 - x0, WORLD.height - BEACH.waterY);
    context.fillStyle = PALETTE.waterDeep;
    for (let wy = BEACH.waterY + 26; wy < WORLD.height; wy += 52) {
      for (let wx = x0; wx < x1; wx += 90) {
        context.fillRect(wx + ((wy / 52) % 2) * 40, wy, 46, 4);
      }
    }
    // The park: brighter grass with a pond and paths.
    const park = city.park;
    context.fillStyle = PALETTE.parkGrass;
    context.fillRect(park.x0, park.y0, park.x1 - park.x0, park.y1 - park.y0);
    context.fillStyle = PALETTE.water;
    context.beginPath();
    context.arc((park.x0 + park.x1) / 2, (park.y0 + park.y1) / 2, 52, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.sidewalk;
    context.fillRect((park.x0 + park.x1) / 2 - 8, park.y0, 16, park.y1 - park.y0);
    context.fillRect(park.x0, (park.y0 + park.y1) / 2 - 8, park.x1 - park.x0, 16);
  }

  function drawRoads(state) {
    const city = state.city;
    const cam = state.camera;
    const x0 = Math.max(0, cam.x - 40);
    const y0 = Math.max(0, cam.y - 40);
    const x1 = Math.min(WORLD.width, cam.x + FIELD.width + 40);
    const y1 = Math.min(WORLD.height, cam.y + FIELD.height + 40);
    context.fillStyle = PALETTE.road;
    for (const rx of city.roads.vertical) context.fillRect(rx - city.roads.width / 2, y0, city.roads.width, y1 - y0);
    for (const ry of city.roads.horizontal) context.fillRect(x0, ry - city.roads.width / 2, x1 - x0, city.roads.width);
    // Sidewalk edges.
    context.fillStyle = PALETTE.sidewalk;
    for (const rx of city.roads.vertical) {
      context.fillRect(rx - city.roads.width / 2 - 14, y0, 14, y1 - y0);
      context.fillRect(rx + city.roads.width / 2, y0, 14, y1 - y0);
    }
    for (const ry of city.roads.horizontal) {
      context.fillRect(x0, ry - city.roads.width / 2 - 14, x1 - x0, 14);
      context.fillRect(x0, ry + city.roads.width / 2, x1 - x0, 14);
    }
    // Lane dashes.
    context.fillStyle = PALETTE.lane;
    for (const rx of city.roads.vertical) {
      for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) context.fillRect(rx - 2, y, 4, 22);
    }
    for (const ry of city.roads.horizontal) {
      for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) context.fillRect(x, ry - 2, 22, 4);
    }
  }

  function drawBuildings(state) {
    const city = state.city;
    const cam = state.camera;
    for (const b of city.buildings) {
      if (b.x + b.w < cam.x - 60 || b.x > cam.x + FIELD.width + 60 || b.y + b.h < cam.y - 60 || b.y > cam.y + FIELD.height + 60) continue;
      // Shadow offset to the south-east, then the roof face.
      context.fillStyle = 'rgba(0, 0, 0, 0.28)';
      context.fillRect(b.x + 8, b.y + 10, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255, 255, 255, 0.16)';
      context.fillRect(b.x, b.y, b.w, 10);
      context.fillStyle = 'rgba(0, 0, 0, 0.18)';
      context.fillRect(b.x, b.y + b.h - 12, b.w, 12);
      // Windows.
      context.fillStyle = 'rgba(20, 24, 48, 0.75)';
      const gx = b.w / b.windowsX;
      const gy = b.h / b.windowsY;
      for (let ix = 0; ix < b.windowsX; ix += 1) {
        for (let iy = 0; iy < b.windowsY; iy += 1) {
          if ((ix * 7 + iy * 3) % 5 === 0) context.fillStyle = 'rgba(255, 214, 120, 0.9)';
          else context.fillStyle = 'rgba(20, 24, 48, 0.75)';
          context.fillRect(b.x + ix * gx + 8, b.y + iy * gy + 9, gx - 16, gy - 18);
        }
      }
      if (b.kind === 'bank') text('$', b.x + b.w / 2, b.y + b.h / 2 + 8, 34, '#fff7e8', 'center', 'middle');
      if (b.kind === 'safehouse') text('H', b.x + b.w / 2, b.y + b.h / 2 + 8, 30, '#fff7e8', 'center', 'middle');
    }
    // Palms: trunk line and a star of fronds.
    for (const palm of city.palms) {
      if (palm.x < cam.x - 40 || palm.x > cam.x + FIELD.width + 40 || palm.y < cam.y - 40 || palm.y > cam.y + FIELD.height + 40) continue;
      context.strokeStyle = '#7a5230';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(palm.x, palm.y);
      context.lineTo(palm.x + palm.lean * 22, palm.y - 26);
      context.stroke();
      context.fillStyle = '#2f9e5f';
      const tx = palm.x + palm.lean * 22;
      const ty = palm.y - 26;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        context.beginPath();
        context.ellipse(tx + Math.cos(a) * 12, ty + Math.sin(a) * 7, 14, 5, a, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Props: lamps and hydrants.
    for (const prop of city.props) {
      if (prop.x < cam.x - 20 || prop.x > cam.x + FIELD.width + 20 || prop.y < cam.y - 20 || prop.y > cam.y + FIELD.height + 20) continue;
      if (prop.kind === 'lamp') {
        context.fillStyle = '#3a3b4a';
        context.fillRect(prop.x - 2, prop.y - 2, 4, 4);
        context.fillStyle = '#ffd76a';
        context.beginPath();
        context.arc(prop.x, prop.y, 3, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillStyle = '#e5534b';
        context.fillRect(prop.x - 4, prop.y - 5, 8, 10);
      }
    }
  }

  function drawCar(car) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    context.fillRect(-22, -9, 46, 22);
    context.fillStyle = car.color;
    context.beginPath();
    context.roundRect(-23, -11, 46, 22, 7);
    context.fill();
    context.fillStyle = 'rgba(20, 24, 48, 0.85)';
    context.beginPath();
    context.roundRect(-4, -9, 14, 18, 3);
    context.fill();
    context.fillStyle = '#ffe9a8';
    context.fillRect(21, -8, 3, 5);
    context.fillRect(21, 3, 3, 5);
    context.fillStyle = '#e5534b';
    context.fillRect(-24, -8, 3, 5);
    context.fillRect(-24, 3, 3, 5);
    if (car.police) {
      const phase = Math.floor(car.sirenPhase) % 2 === 0;
      context.fillStyle = phase ? '#ff3b30' : '#4f8ef7';
      context.fillRect(-2, -11, 8, 5);
      context.fillStyle = phase ? '#4f8ef7' : '#ff3b30';
      context.fillRect(-2, 6, 8, 5);
    }
    context.restore();
  }

  function drawPerson(x, y, angle, color, down) {
    context.save();
    context.translate(x, y);
    if (down > 0) {
      context.rotate(Math.PI / 2);
      context.fillStyle = color;
      context.beginPath();
      context.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    context.rotate(angle);
    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    context.beginPath();
    context.ellipse(2, 3, 11, 9, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = color;
    context.beginPath();
    context.arc(0, 0, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2b2118';
    context.beginPath();
    context.arc(6, 0, 5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawEntities(state) {
    const player = state.player;
    for (const p of state.pickups) {
      const bob = Math.sin(state.elapsed * 4 + p.x) * 3;
      if (p.kind === 'health') {
        context.fillStyle = '#e8fff0';
        context.fillRect(p.x - 10, p.y - 10 + bob, 20, 20);
        context.fillStyle = '#2f9e5f';
        context.fillRect(p.x - 3, p.y - 8 + bob, 6, 16);
        context.fillRect(p.x - 8, p.y - 3 + bob, 16, 6);
      } else {
        context.fillStyle = '#f2c94c';
        context.fillRect(p.x - 10, p.y - 8 + bob, 20, 16);
        context.fillStyle = '#2b2118';
        context.fillRect(p.x - 6, p.y - 4 + bob, 4, 8);
        context.fillRect(p.x, p.y - 4 + bob, 4, 8);
        context.fillRect(p.x + 6, p.y - 4 + bob, 3, 8);
      }
    }
    // Mission marker: a pulsing beacon and a ground ring.
    const marker = state.mission.marker;
    if (marker) {
      const pulse = 1 + Math.sin(state.elapsed * 5) * 0.12;
      context.strokeStyle = '#f2c94c';
      context.lineWidth = 4;
      context.beginPath();
      context.arc(marker.x, marker.y, 30 * pulse, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = 'rgba(242, 201, 76, 0.25)';
      context.beginPath();
      context.arc(marker.x, marker.y, 30 * pulse, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#f2c94c';
      context.beginPath();
      context.moveTo(marker.x, marker.y - 52);
      context.lineTo(marker.x - 12, marker.y - 26);
      context.lineTo(marker.x + 12, marker.y - 26);
      context.closePath();
      context.fill();
    }
    for (const car of state.cars) drawCar(car);
    for (const ped of state.peds) drawPerson(ped.x, ped.y, ped.angle, ped.color, ped.down);
    for (const cop of state.cops) {
      drawPerson(cop.x, cop.y, cop.angle, '#2b3a6e', 0);
      context.fillStyle = '#4f8ef7';
      context.beginPath();
      context.arc(cop.x, cop.y - 12, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const g of state.gang) {
      if (!g.alive) continue;
      drawPerson(g.x, g.y, g.angle, '#8f2f2f', 0);
      context.fillStyle = '#e5534b';
      context.fillRect(g.x - 12, g.y - 24, 24, 4);
      context.fillStyle = '#7dd8a0';
      context.fillRect(g.x - 12, g.y - 24, 24 * Math.max(0, g.health / 60), 4);
    }
    if (!player.inCar) {
      drawPerson(player.x, player.y, player.angle, '#ff8a3d', 0);
      // Pistol in hand when aiming.
      context.save();
      context.translate(player.x, player.y);
      context.rotate(player.angle);
      context.fillStyle = '#2b2118';
      context.fillRect(8, -2, 12, 4);
      context.restore();
    }
    for (const b of state.bullets) {
      context.strokeStyle = '#ffd76a';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, screen) {
    const player = state.player;
    const wanted = Math.floor(state.wanted);
    context.textBaseline = 'top';
    // Cash and health, top-left, with a dark chip behind them.
    context.fillStyle = PALETTE.hudShadow;
    context.fillRect(12, 12, 250, 64);
    text(cashLabel(player.cash), 24, 20, 28, PALETTE.gold, 'left', 'top');
    context.fillStyle = '#3a0d0d';
    context.fillRect(24, 52, 150, 12);
    context.fillStyle = player.health > 30 ? '#7dd8a0' : '#e5534b';
    context.fillRect(24, 52, 150 * Math.max(0, player.health / 100), 12);
    plainText('HP', 180, 50, 16, PALETTE.text, 'left', 'top');
    // Wanted stars, top-right above the minimap.
    for (let i = 0; i < 5; i += 1) {
      text(i < wanted ? '★' : '☆', FIELD.width - 24 - (5 - i) * 30, 16, 30, i < wanted ? '#ffd76a' : 'rgba(255,255,255,0.4)', 'left', 'top');
    }
    // Objective banner, top-centre.
    const objective = state.mission.text;
    context.font = `18px ${FONT}`;
    const w = context.measureText(`MISSION ${Math.min(state.mission.index + 1, 6)}/6 — ${objective}`).width;
    context.fillStyle = PALETTE.hudShadow;
    context.fillRect(FIELD.width / 2 - w / 2 - 60, 12, w + 120, 34);
    plainText(`MISSION ${Math.min(state.mission.index + 1, 6)}/6 — ${objective}`, FIELD.width / 2, 20, 18, PALETTE.text, 'center', 'top');
    // Clock, under the objective.
    const hh = Math.floor(state.clock / 60);
    const mm = Math.floor(state.clock % 60);
    plainText(clockLabel(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`), FIELD.width / 2, 58, 16, PALETTE.muted, 'center', 'top');
    // Ammo, bottom-left; speed, bottom-right while driving.
    text(`AMMO ${player.ammo}`, 24, FIELD.height - 44, 22, PALETTE.text, 'left', 'top');
    if (player.inCar && player.car) {
      const kmh = Math.round(Math.abs(player.car.speed) * 0.36);
      text(speedLabel(`${kmh} km/h`), FIELD.width - 24, FIELD.height - 48, 30, PALETTE.text, 'right', 'top');
    }
    // Robbery progress bar.
    if (state.mission.index === 4 && state.mission.stage === 0 && state.mission.progress > 0) {
      context.fillStyle = PALETTE.hudShadow;
      context.fillRect(FIELD.width / 2 - 110, FIELD.height - 90, 220, 20);
      context.fillStyle = PALETTE.gold;
      context.fillRect(FIELD.width / 2 - 106, FIELD.height - 86, 212 * (state.mission.progress / 3), 12);
      plainText('CRACKING THE VAULT…', FIELD.width / 2, FIELD.height - 116, 16, PALETTE.gold, 'center', 'top');
    }
    // Package timer.
    if (state.mission.index === 1 && state.mission.stage === 1) {
      text(`${Math.ceil(state.mission.timer)}s`, FIELD.width / 2, 84, 26, state.mission.timer < 20 ? '#e5534b' : PALETTE.gold, 'center', 'top');
    }
  }

  function drawMinimap(state) {
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    context.fillStyle = 'rgba(16, 10, 32, 0.85)';
    context.fillRect(MINIMAP.x - 4, MINIMAP.y - 4, MINIMAP.w + 8, MINIMAP.h + 8);
    context.save();
    context.beginPath();
    context.rect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    context.clip();
    context.fillStyle = '#2c4a38';
    context.fillRect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    context.fillStyle = '#1f8fb0';
    context.fillRect(MINIMAP.x, MINIMAP.y + BEACH.waterY * sy, MINIMAP.w, MINIMAP.h - BEACH.waterY * sy);
    context.strokeStyle = '#8d8578';
    context.lineWidth = 3;
    for (const rx of state.city.roads.vertical) {
      context.beginPath();
      context.moveTo(MINIMAP.x + rx * sx, MINIMAP.y);
      context.lineTo(MINIMAP.x + rx * sx, MINIMAP.y + MINIMAP.h);
      context.stroke();
    }
    for (const ry of state.city.roads.horizontal) {
      context.beginPath();
      context.moveTo(MINIMAP.x, MINIMAP.y + ry * sy);
      context.lineTo(MINIMAP.x + MINIMAP.w, MINIMAP.y + ry * sy);
      context.stroke();
    }
    const marker = state.mission.marker;
    if (marker) {
      context.fillStyle = '#f2c94c';
      context.beginPath();
      context.arc(MINIMAP.x + marker.x * sx, MINIMAP.y + marker.y * sy, 4 + Math.sin(state.elapsed * 5), 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) {
      if (!car.police) continue;
      context.fillStyle = '#ff3b30';
      context.fillRect(MINIMAP.x + car.x * sx - 2, MINIMAP.y + car.y * sy - 2, 4, 4);
    }
    for (const cop of state.cops) {
      context.fillStyle = '#ff3b30';
      context.fillRect(MINIMAP.x + cop.x * sx - 2, MINIMAP.y + cop.y * sy - 2, 4, 4);
    }
    // Player arrow.
    const px = MINIMAP.x + state.player.x * sx;
    const py = MINIMAP.y + state.player.y * sy;
    context.save();
    context.translate(px, py);
    context.rotate(state.player.angle);
    context.fillStyle = '#fff7e8';
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const height = 150 + lines.length * 34 + 70;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.pink;
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    text(title, FIELD.width / 2, y + 72, 52, PALETTE.text, 'center', 'alphabetic');
    for (let index = 0; index < lines.length; index += 1) {
      plainText(lines[index], FIELD.width / 2, y + 118 + index * 34, 20, PALETTE.muted, 'center', 'alphabetic');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 22, PALETTE.gold, 'center', 'alphabetic');
  }

  const TITLE_LINES = [
    'Six missions. One city. No rules but yours.',
    'WASD walk / drive · E steal a car · Mouse aim, click shoot',
    'F punch · Space handbrake · Shift sprint · P pause · M mute',
    '',
  ];
  const PAUSED_LINES = ['The city waits for no one. Well — right now it does.'];
  const WASTED_LINES = ['', 'The paramedics found you on the boardwalk.'];
  const BUSTED_LINES = ['', 'The Vice Shores PD has questions for you.'];

  /** Paint one frame: the city through the camera, then the HUD or a panel. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const shakeX = state.camera.shake > 0 ? (Math.random() - 0.5) * state.camera.shake : 0;
    const shakeY = state.camera.shake > 0 ? (Math.random() - 0.5) * state.camera.shake : 0;
    context.save();
    context.translate(-state.camera.x + shakeX, -state.camera.y + shakeY);
    drawGround(state);
    drawRoads(state);
    drawBuildings(state);
    drawEntities(state);
    context.restore();
    // Warm sunset tint over the world.
    const tint = context.createLinearGradient(0, 0, 0, FIELD.height);
    tint.addColorStop(0, 'rgba(255, 122, 89, 0.05)');
    tint.addColorStop(1, 'rgba(255, 94, 150, 0.10)');
    context.fillStyle = tint;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[3] = best > 0 ? `Best cash banked: $${best}` : 'A brand-new save — make it count.';
      drawPanel('VICE SHORES', TITLE_LINES, 'Press Enter or click to start');
      return;
    }
    drawHud(state, screen);
    drawMinimap(state);
    if (screen === SCREEN_PAUSED) drawPanel('PAUSED', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_WASTED) {
      WASTED_LINES[0] = `Cash kept: $${state.player.cash}`;
      drawPanel('WASTED', WASTED_LINES, 'Press Enter to wake up at the safehouse');
    } else if (screen === SCREEN_BUSTED) {
      BUSTED_LINES[0] = `Bail paid: $200 — cash now $${state.player.cash}`;
      drawPanel('BUSTED', BUSTED_LINES, 'Press Enter to walk free at the safehouse');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}

export { FIELD };
