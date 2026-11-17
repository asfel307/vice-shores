// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play, paused,
// wasted and busted. Sounds follow the world's events; the save follows the cash.
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|chase|mission (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED, EVENT_CRASH, EVENT_GANG_DOWN, EVENT_HIT, EVENT_MISSION, EVENT_PICKUP,
  EVENT_PUNCH, EVENT_SHOT, EVENT_STEAL, EVENT_WASTED, createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { loadSave, readBest, writeBest, writeSave } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const saved = loadSave();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let muted = saved?.muted ?? false;
  if (muted) audio.setMuted(true);
  if (saved && saved.cash > 0) world.state.player.cash = saved.cash;
  let accumulator = 0;
  let last = performance.now();
  // Edge actions (E to steal, F to punch) are taken once per frame here and
  // handed to the first fixed step, so handleActions() never eats them.
  let edgeActions = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function bankCash() {
    const cash = world.state.player.cash;
    if (cash > best) {
      best = cash;
      writeBest(best);
    }
    writeSave({ cash, missionsDone: world.state.mission.done, muted });
  }

  function startGame() {
    world.reset();
    if (saved && saved.cash > 0) world.state.player.cash = saved.cash;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Steal a car and drive to the marker.');
  }

  function endGame(kind) {
    bankCash();
    screen = kind;
    audio.stopEngine();
    audio.siren(false);
    audio.wasted();
    announce(kind === SCREEN_WASTED ? `Wasted. Cash kept ${world.state.player.cash}.` : `Busted. Cash kept ${world.state.player.cash}.`);
  }

  function respawnAtSafehouse() {
    const house = world.state.city.safehouse;
    const p = world.state.player;
    p.x = house.x + house.w / 2;
    p.y = house.y + house.h + 40;
    p.health = 100;
    p.inCar = false;
    p.car = null;
    p.ammo = Math.max(p.ammo, 12);
    world.state.wanted = 0;
    world.state.cops.length = 0;
    for (const car of world.state.cars) if (car.police) car.police = false;
    world.state.camera.x = Math.max(0, Math.min(2560 - 1280, p.x - 640));
    world.state.camera.y = Math.max(0, Math.min(1920 - 720, p.y - 360));
  }

  function handleActions() {
    const actions = input.takeActions();
    edgeActions = actions;
    if (actions & ACTION_MUTE) {
      muted = !muted;
      audio.setMuted(muted);
      writeSave({ cash: world.state.player.cash, missionsDone: world.state.mission.done, muted });
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_WASTED || screen === SCREEN_BUSTED)) {
      if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED) {
        if (screen === SCREEN_BUSTED) world.state.player.cash = Math.max(0, world.state.player.cash - 200);
        startGame();
        respawnAtSafehouse();
      } else {
        startGame();
      }
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.stopEngine();
      audio.siren(false);
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function readStepInput() {
    const h = input.held;
    const aim = screenToWorld(input.mouse.x, input.mouse.y);
    return {
      up: h.up, down: h.down, left: h.left, right: h.right,
      sprint: h.sprint, handbrake: h.handbrake,
      enter: false, punch: false, shoot: input.mouse.down,
      aimX: aim.x, aimY: aim.y,
    };
  }

  function screenToWorld(sx, sy) {
    const scale = renderer.view.scale;
    const wx = (sx * (window.devicePixelRatio || 1) - renderer.view.x) / scale + world.state.camera.x;
    const wy = (sy * (window.devicePixelRatio || 1) - renderer.view.y) / scale + world.state.camera.y;
    return { x: wx, y: wy };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // Attract mode: the city lives behind the title panel.
      world.step(STEP, { up: false, down: false, left: false, right: false, sprint: false, handbrake: false, enter: false, punch: false, shoot: false });
      return;
    }
    const edge = edgeActions;
    edgeActions = 0;
    const stepInput = readStepInput();
    stepInput.enter = !!(edge & ACTION_ENTER);
    stepInput.punch = !!(edge & ACTION_PUNCH);
    const events = world.step(STEP, stepInput);
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_STEAL) audio.steal();
    if (events & EVENT_MISSION) {
      audio.jingle();
      bankCash();
      announce(`Mission complete. ${world.state.mission.text}`);
    }
    if (events & EVENT_GANG_DOWN) announce('Rival down.');
    if (events & EVENT_HIT) announce(`Hit. Health ${Math.max(0, Math.round(world.state.player.health))}.`);
    if (events & EVENT_WASTED) endGame(SCREEN_WASTED);
    else if (events & EVENT_BUSTED) endGame(SCREEN_BUSTED);
    // Engine hum and siren follow the live state.
    const p = world.state.player;
    audio.engine(p.inCar && p.car ? Math.abs(p.car.speed) / 540 : 0);
    audio.siren(world.state.wanted >= 2 && screen === SCREEN_PLAY);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.stopEngine();
      audio.siren(false);
      announce('Paused.');
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  announce('Vice Shores. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
