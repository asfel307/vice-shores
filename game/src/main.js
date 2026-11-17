// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, wasted and busted.
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_HIT, EVENT_JINGLE, EVENT_MISSION,
  EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT, EVENT_WASTED,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { loadSave, mergeProgress, storeSave } from './save.js';
import {
  createRenderer, SCREEN_BUSTED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
} from './render.js';
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
const save = loadSave();

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, save);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  audio.setMuted(save.muted);

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    world.state.cash = save.cash;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Steal a car and drive to the marker.');
  }

  function endGame(kind) {
    screen = kind === 'busted' ? SCREEN_BUSTED : SCREEN_OVER;
    mergeProgress(save, world.state.cash, world.state.missionIndex);
    if (kind === 'busted') audio.busted();
    announce(kind === 'busted' ? `Busted. Cash kept $${world.state.cash}.` : `Wasted. Cash kept $${world.state.cash}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & (EVENT_MISSION | EVENT_JINGLE)) audio.jingle();
    if (events & EVENT_WASTED) endGame('wasted');
    else if (events & EVENT_BUSTED) endGame('busted');
  }

  // One-shot presses are taken exactly once per frame, in frame(), and handed to both
  // the screen handler and the world step — taking them twice would eat E and F presses.
  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      save.muted = !save.muted;
      audio.setMuted(save.muted);
      storeSave(save);
      announce(save.muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_BUSTED)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  /** Build one world input from the keyboard and mouse for this frame. */
  function readInput(actions) {
    const move = input.move();
    const mouse = input.mouse();
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 720 / rect.height;
    // The mouse aims in screen space; the world needs the world point under the cursor.
    const camX = Math.max(0, Math.min(2560 - 1280, world.state.player.x - 640));
    const camY = Math.max(0, Math.min(1920 - 720, world.state.player.y - 360));
    return {
      move,
      enter: Boolean(actions & ACTION_ENTER),
      punch: Boolean(actions & ACTION_PUNCH),
      shoot: mouse.down,
      aim: { wx: camX + mouse.x * scaleX, wy: camY + mouse.y * scaleY },
    };
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, null, true);
      return;
    }
    const events = world.step(STEP, readInput(actions), false);
    handleEvents(events);
    // Engine hum and siren follow the live state.
    const p = world.state.player;
    audio.engine(p.onFoot ? 0 : Math.abs(p.car ? p.car.speed : 0) / 280);
    audio.siren(world.state.cops.length > 0);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      audio.engine(0);
    }
    renderer.draw(world.state, screen, save);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Vice Shores. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
