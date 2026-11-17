// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// viewport is scaled to fit the window and centred, the margin filled with the backdrop
// colour. A camera follows the player over the 2560x1920 city; the HUD, the minimap and
// the title/pause/end screens are drawn in screen space on top.
import { CAR, FONT, MISSIONS, PALETTE, PICKUP, PLAYER, VIEW, WORLD } from './config.js';
import { inBeach, inPark } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';

const MINIMAP = { x: 1044, y: 16, w: 220, h: 168 };

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function clockText(seconds) {
  const total = Math.floor(seconds) % 86400;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let camX = 0;
  let camY = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(VIEW.width * dpr);
    canvas.height = Math.floor(VIEW.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function drawCar(x, y, angle, color, isPolice, isPlayer) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-CAR.length / 2 + 4, -CAR.width / 2 + 4, CAR.length, CAR.width);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 10);
    ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = isPolice ? '#1c2f4a' : 'rgba(20,24,40,0.85)';
    ctx.beginPath();
    ctx.roundRect(-12, -CAR.width / 2 + 7, 26, CAR.width - 14, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.75)';
    ctx.fillRect(CAR.length / 2 - 16, -CAR.width / 2 + 8, 5, CAR.width - 16);
    if (isPolice) {
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(-6, -CAR.width / 2 + 2, 12, 7);
      ctx.fillStyle = '#2f7bff';
      ctx.fillRect(-6, CAR.width / 2 - 9, 12, 7);
      ctx.fillStyle = '#0e1420';
      ctx.font = 'bold 9px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 2);
    }
    if (isPlayer) {
      ctx.strokeStyle = '#ffd94d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-CAR.length / 2 - 2, -CAR.width / 2 - 2, CAR.length + 4, CAR.width + 4, 12);
      ctx.stroke();
    }
    // Headlights.
    ctx.fillStyle = 'rgba(255,244,180,0.9)';
    ctx.fillRect(CAR.length / 2 - 2, -CAR.width / 2 + 5, 3, 6);
    ctx.fillRect(CAR.length / 2 - 2, CAR.width / 2 - 11, 3, 6);
    ctx.restore();
  }

  function drawPerson(x, y, angle, color, isCop, isPlayer) {
    ctx.save();
    ctx.translate(x, y);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER.radius - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(Math.cos(0) * 0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    // Facing tick.
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(15, 0);
    ctx.stroke();
    ctx.restore();
    if (isCop) {
      ctx.fillStyle = '#0e2a4a';
      ctx.font = 'bold 9px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', x, y - 18);
    }
    if (isPlayer) {
      ctx.strokeStyle = '#ffd94d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, PLAYER.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawCity(state) {
    const city = state.city;
    const x0 = Math.max(0, camX - 60);
    const y0 = Math.max(0, camY - 60);
    const x1 = Math.min(WORLD.width, camX + VIEW.width + 60);
    const y1 = Math.min(WORLD.height, camY + VIEW.height + 60);
    // Ground: grass everywhere, then the beach and water at the south edge.
    ctx.fillStyle = '#2c7a4e';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (y1 > city.beach.y) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(x0, Math.max(y0, city.beach.y), x1 - x0, Math.min(y1, city.waterTop) - Math.max(y0, city.beach.y));
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(x0, Math.max(y0, city.waterTop), x1 - x0, y1 - Math.max(y0, city.waterTop));
      ctx.fillStyle = PALETTE.waterDeep;
      for (let wx = Math.floor(x0 / 90) * 90; wx < x1; wx += 90) {
        ctx.fillRect(wx, city.waterTop + 40, 46, 4);
        ctx.fillRect(wx + 30, city.waterTop + 110, 52, 4);
      }
    }
    // Park.
    const pk = city.park;
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    ctx.strokeStyle = '#1d5c39';
    ctx.lineWidth = 3;
    ctx.strokeRect(pk.x, pk.y, pk.w, pk.h);
    // Roads: asphalt, edge lines, dashed centre line. The vertical roads end at the
    // beach — they do not paint across the sand into the water.
    const roadBottom = Math.min(y1, city.beach.y);
    for (const vx of city.roadsV) {
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(vx - city.roadW / 2, y0, city.roadW, roadBottom - y0);
      ctx.fillStyle = PALETTE.roadEdge;
      ctx.fillRect(vx - city.roadW / 2, y0, 3, roadBottom - y0);
      ctx.fillRect(vx + city.roadW / 2 - 3, y0, 3, roadBottom - y0);
    }
    for (const hy of city.roadsH) {
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(x0, hy - city.roadW / 2, x1 - x0, city.roadW);
      ctx.fillStyle = PALETTE.roadEdge;
      ctx.fillRect(x0, hy - city.roadW / 2, x1 - x0, 3);
      ctx.fillRect(x0, hy + city.roadW / 2 - 3, x1 - x0, 3);
    }
    ctx.fillStyle = PALETTE.lane;
    for (const vx of city.roadsV) {
      for (let y = Math.floor(y0 / 48) * 48; y < roadBottom; y += 48) {
        if (city.roadsH.some((hy) => Math.abs(y - hy) < 60)) continue;
        ctx.fillRect(vx - 2, y, 4, 22);
      }
    }
    for (const hy of city.roadsH) {
      for (let x = Math.floor(x0 / 48) * 48; x < x1; x += 48) {
        if (city.roadsV.some((vx) => Math.abs(x - vx) < 60)) continue;
        ctx.fillRect(x, hy - 2, 22, 4);
      }
    }
    // Buildings: wall, roof, lit windows.
    for (const b of city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      ctx.fillStyle = 'rgba(255,214,120,0.85)';
      const cols = Math.max(2, Math.floor(b.w / 26));
      const rows = Math.max(2, Math.floor(b.h / 26));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if (((r * 7 + c * 3 + Math.floor(b.seed * 90)) % 5) < 2) {
            ctx.fillRect(b.x + 9 + c * ((b.w - 18) / cols), b.y + 9 + r * ((b.h - 18) / rows), 8, 10);
          }
        }
      }
    }
    // Palms and props.
    for (const palm of city.palms) {
      if (palm.x < x0 || palm.x > x1 || palm.y < y0 || palm.y > y1) continue;
      ctx.strokeStyle = '#7a5230';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.lineTo(palm.x + 3, palm.y - 14);
      ctx.stroke();
      ctx.fillStyle = '#2fae5f';
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(palm.x + 3 + Math.cos(a) * 9, palm.y - 16 + Math.sin(a) * 5, 10, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const prop of city.props) {
      if (prop.x < x0 || prop.x > x1 || prop.y < y0 || prop.y > y1) continue;
      if (prop.kind === 'lamp') {
        ctx.strokeStyle = '#20242e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(prop.x, prop.y);
        ctx.lineTo(prop.x, prop.y - 22);
        ctx.stroke();
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y - 24, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#d83a3a';
        ctx.fillRect(prop.x - 4, prop.y - 8, 8, 10);
      }
    }
    // Sunset tint over everything: warm, low, readable.
    ctx.fillStyle = 'rgba(255,120,60,0.06)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  function drawMarker(state) {
    const m = state.marker;
    if (!m) return;
    const bob = Math.sin(state.elapsed * 4) * 6;
    ctx.save();
    ctx.translate(m.x, m.y + bob);
    ctx.fillStyle = PALETTE.marker;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(-14, -14);
    ctx.lineTo(14, -14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, -14, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,79,216,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26 + Math.sin(state.elapsed * 3) * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // A light pillar so the marker is visible from across the block.
    const grad = ctx.createLinearGradient(m.x, m.y - 190, m.x, m.y);
    grad.addColorStop(0, 'rgba(255,79,216,0)');
    grad.addColorStop(1, 'rgba(255,79,216,0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(m.x - 8, m.y - 190, 16, 190);
  }

  function drawEntities(state) {
    // Pickups.
    for (const pk of state.pickups) {
      ctx.fillStyle = pk.kind === 'health' ? '#ff5d6c' : '#ffd94d';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, PICKUP.radius - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pk.kind === 'health' ? '+' : 'A', pk.x, pk.y + 1);
      ctx.textBaseline = 'alphabetic';
    }
    // Gang members: red rings.
    for (const g of state.gang) {
      if (g.hp <= 0) continue;
      drawPerson(g.x, g.y, g.angle, '#c0392b', false, false);
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(g.x, g.y, PLAYER.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(g.x - 14, g.y - 26, 28 * Math.max(0, g.hp / 60), 4);
    }
    // Pedestrians.
    for (const ped of state.peds) drawPerson(ped.x, ped.y, ped.angle, ped.color, false, false);
    // Cars.
    for (const car of state.cars) {
      drawCar(car.x, car.y, car.angle, car.color, car.kind === 'police', car.kind === 'player');
    }
    // Foot cops.
    for (const cop of state.cops) {
      if (cop.kind === 'foot') drawPerson(cop.x, cop.y, cop.angle, '#2f6fd8', true, false);
    }
    // Bullets: tracers.
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(b.angle) * 14, b.y - Math.sin(b.angle) * 14);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Particles.
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life * 2);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    // Player.
    const p = state.player;
    if (p.onFoot) drawPerson(p.x, p.y, p.angle, PALETTE.player, false, true);
  }

  function drawMinimap(state) {
    const { x, y, w, h } = MINIMAP;
    const sx = w / WORLD.width;
    const sy = h / WORLD.height;
    ctx.save();
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
    ctx.fillStyle = '#1d3a2a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#5a5a6e';
    ctx.lineWidth = 1;
    for (const vx of state.city.roadsV) {
      ctx.beginPath();
      ctx.moveTo(x + vx * sx, y);
      ctx.lineTo(x + vx * sx, y + h);
      ctx.stroke();
    }
    for (const hy of state.city.roadsH) {
      ctx.beginPath();
      ctx.moveTo(x, y + hy * sy);
      ctx.lineTo(x + w, y + hy * sy);
      ctx.stroke();
    }
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x, y + state.city.waterTop * sy, w, h - state.city.waterTop * sy);
    if (state.marker) {
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.arc(x + state.marker.x * sx, y + state.marker.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const cop of state.cops) {
      ctx.fillStyle = '#4fa8ff';
      ctx.beginPath();
      ctx.arc(x + cop.x * sx, y + cop.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = state.player;
    ctx.save();
    ctx.translate(x + p.x * sx, y + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawHud(state, save, screen) {
    const p = state.player;
    ctx.save();
    // Top-left: cash, health, wanted stars.
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(14, 12, 300, 96);
    ctx.fillStyle = PALETTE.cash;
    ctx.font = 'bold 26px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(`$${state.cash.toLocaleString('en-US')}`, 26, 44);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '13px ' + FONT;
    ctx.fillText(`BEST $${(save ? save.bestCash : 0).toLocaleString('en-US')}`, 200, 40);
    // Health bar.
    ctx.fillStyle = '#3a2b3a';
    ctx.fillRect(26, 56, 170, 14);
    ctx.fillStyle = p.hp > 30 ? '#7dff9e' : '#ff5d6c';
    ctx.fillRect(26, 56, 170 * Math.max(0, p.hp / PLAYER.hp), 14);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText(`HP ${Math.ceil(p.hp)}`, 204, 68);
    // Wanted stars.
    ctx.font = '22px ' + FONT;
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < state.wanted ? PALETTE.star : 'rgba(255,255,255,0.22)';
      ctx.fillText('★', 26 + i * 26, 96);
    }
    // Top-centre: mission objective.
    const mission = MISSIONS[state.missionIndex];
    const objText = mission ? `${mission.id}. ${mission.name} — ${mission.text}` : 'Free roam — Vice Shores is yours';
    ctx.font = 'bold 15px ' + FONT;
    const tw = ctx.measureText(objText).width;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect((VIEW.width - tw) / 2 - 14, 12, tw + 28, 34);
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.fillText(objText, VIEW.width / 2, 35);
    // Mission timer.
    if (mission && state.mission.phase === 'deliver' && state.mission.timer > 0) {
      ctx.fillStyle = state.mission.timer < 20 ? '#ff5d6c' : PALETTE.star;
      ctx.font = 'bold 20px ' + FONT;
      ctx.fillText(`⏱ ${Math.ceil(state.mission.timer)}s`, VIEW.width / 2, 68);
    }
    if (mission && state.mission.phase === 'rob') {
      ctx.fillStyle = PALETTE.marker;
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillText(`CRACKING THE VAULT ${Math.floor(state.mission.progress * 33)}%`, VIEW.width / 2, 68);
    }
    if (mission && state.missionIndex === 3) {
      ctx.fillStyle = '#ff8a7a';
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillText(`RIVALS DOWN ${state.mission.count}/3`, VIEW.width / 2, 68);
    }
    // Bottom-right: speed + ammo while driving / on foot.
    ctx.textAlign = 'right';
    if (!p.onFoot && p.car) {
      const kmh = Math.round(Math.abs(p.car.speed) * 0.36);
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect(VIEW.width - 190, VIEW.height - 92, 176, 78);
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 34px ' + FONT;
      ctx.fillText(`${kmh}`, VIEW.width - 60, VIEW.height - 40);
      ctx.font = '14px ' + FONT;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('km/h', VIEW.width - 26, VIEW.height - 40);
    } else {
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect(VIEW.width - 190, VIEW.height - 92, 176, 78);
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 22px ' + FONT;
      ctx.fillText(`AMMO ${state.ammo}`, VIEW.width - 26, VIEW.height - 52);
      ctx.font = '13px ' + FONT;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('F punch · click shoot · E car', VIEW.width - 26, VIEW.height - 28);
    }
    // Bottom-left: clock + place.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(14, VIEW.height - 52, 220, 38);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 16px ' + FONT;
    const place = inBeach(state.city, p.x, p.y) ? 'Vice Beach' : inPark(state.city, p.x, p.y) ? 'Shores Park' : 'Vice Shores';
    ctx.fillText(`${clockText(state.clock)}  ·  ${place}`, 26, VIEW.height - 27);
    // Message line.
    if (state.messageTimer > 0 && state.message) {
      ctx.font = '15px ' + FONT;
      const mw = ctx.measureText(state.message).width;
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect((VIEW.width - mw) / 2 - 12, VIEW.height - 108, mw + 24, 30);
      ctx.fillStyle = PALETTE.text;
      ctx.textAlign = 'center';
      ctx.fillText(state.message, VIEW.width / 2, VIEW.height - 87);
    }
    // Banner (mission title / mission complete): on the play screens only — the
    // title screen has its own panel and the banner would sit behind it, dimmed.
    if (screen !== SCREEN_TITLE && state.bannerTimer > 0 && state.banner) {
      ctx.font = 'bold 30px ' + FONT;
      const bw = ctx.measureText(state.banner).width;
      ctx.fillStyle = 'rgba(16,10,32,0.88)';
      ctx.fillRect((VIEW.width - bw) / 2 - 20, 130, bw + 40, 52);
      ctx.fillStyle = PALETTE.star;
      ctx.textAlign = 'center';
      ctx.fillText(state.banner, VIEW.width / 2, 166);
    }
    ctx.restore();
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt, accent) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,6,24,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const width = 640;
    const height = 150 + lines.length * 30 + 74;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    ctx.fillStyle = '#17102a';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = accent;
    ctx.font = 'bold 44px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(title, VIEW.width / 2, y + 72);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '17px ' + FONT;
    lines.forEach((line, i) => {
      ctx.fillText(line, VIEW.width / 2, y + 118 + i * 30);
    });
    ctx.fillStyle = PALETTE.star;
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillText(prompt, VIEW.width / 2, y + height - 26);
    ctx.restore();
  }

  function drawTitle(state, save) {
    drawPanel('VICE SHORES', [
      'A top-down open-world crime game on the neon coast.',
      'WASD walk / drive · E steal & enter cars · Shift sprint',
      'Click shoot · F punch · Space handbrake · P pause · M mute',
      `Missions done: ${save ? save.missionsDone : 0} of 6 · Best cash: $${save ? save.bestCash.toLocaleString('en-US') : 0}`,
    ], 'Press Enter or click to start', '#ff4fd8');
  }

  function drawPaused() {
    drawPanel('PAUSED', ['The city waits. Your heat does not cool while paused.'], 'Press P or Enter to keep playing', '#4fa8ff');
  }

  function drawOver(state, save, busted) {
    const title = busted ? 'BUSTED' : 'WASTED';
    const accent = busted ? '#4fa8ff' : '#ff5d6c';
    drawPanel(title, [
      busted ? 'The Vice Shores PD caught you. The heat wins this round.' : 'You ran out of health on the streets of Vice Shores.',
      `Cash kept: $${state.cash.toLocaleString('en-US')} · Missions done: ${state.missionIndex} of 6`,
      `Best cash: $${save ? save.bestCash.toLocaleString('en-US') : 0}`,
    ], 'Press Enter or click to try again', accent);
  }

  function draw(state, screen, save) {
    const p = state.player;
    camX = clamp(p.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    camY = clamp(p.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
    const shX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    ctx.save();
    ctx.translate(-camX + shX, -camY + shY);
    drawCity(state);
    drawMarker(state);
    drawEntities(state);
    ctx.restore();
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state, save, screen);
    if (screen === SCREEN_TITLE) {
      drawHud(state, save, screen);
      drawTitle(state, save);
    } else if (screen === SCREEN_PAUSED) {
      drawPaused();
    } else if (screen === SCREEN_OVER) {
      drawOver(state, save, false);
    } else if (screen === SCREEN_BUSTED) {
      drawOver(state, save, true);
    }
  }

  return { draw };
}
