// Save and load through localStorage: cash, missions finished, best cash banked
// and the mute setting. Everything is guarded, so a browser with storage off
// simply plays without a save.
import { BEST_KEY, SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Number(data.cash) || 0,
      missionsDone: Number(data.missionsDone) || 0,
      muted: !!data.muted,
    };
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: save.cash ?? 0,
      missionsDone: save.missionsDone ?? 0,
      muted: !!save.muted,
    }));
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}

export function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function writeBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best cash then lasts this visit only.
  }
}
