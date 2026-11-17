// Save/load through localStorage: cash earned, missions finished, and the best cash
// haul. Nothing else is persisted — the city itself is rebuilt from the seed every
// visit. Storage can be off (private windows); then the save lasts this visit only
// and every call fails soft instead of throwing.
import { SAVE_KEY } from './config.js';

export function defaultSave() {
  return { cash: 0, missionsDone: 0, bestCash: 0, muted: false };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    const save = defaultSave();
    if (Number.isFinite(parsed.cash)) save.cash = Math.max(0, parsed.cash);
    if (Number.isInteger(parsed.missionsDone)) save.missionsDone = Math.max(0, parsed.missionsDone);
    if (Number.isFinite(parsed.bestCash)) save.bestCash = Math.max(0, parsed.bestCash);
    if (typeof parsed.muted === 'boolean') save.muted = parsed.muted;
    return save;
  } catch {
    return defaultSave();
  }
}

export function storeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // See the header: a save that cannot be stored is simply not stored.
  }
}

/** Merge a finished run back into the save: cash and mission progress only grow. */
export function mergeProgress(save, cash, missionsDone) {
  save.cash = Math.max(save.cash, cash);
  save.missionsDone = Math.max(save.missionsDone, missionsDone);
  save.bestCash = Math.max(save.bestCash, cash);
  storeSave(save);
  return save;
}
