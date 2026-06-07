import { todayISO } from './recordSchema.js';

const POMO_KEY = 'recoveryActivePomo';
const BREATH_KEY = 'recoveryActiveBreath';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.date !== todayISO()) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function write(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, date: todayISO() }));
  } catch {
    /* ignore */
  }
}

export function loadActivePomo() {
  return read(POMO_KEY);
}

export function saveActivePomo(state) {
  write(POMO_KEY, state);
}

export function clearActivePomo() {
  try {
    localStorage.removeItem(POMO_KEY);
  } catch {
    /* ignore */
  }
}

export function loadActiveBreath() {
  return read(BREATH_KEY);
}

export function saveActiveBreath(state) {
  write(BREATH_KEY, state);
}

export function clearActiveBreath() {
  try {
    localStorage.removeItem(BREATH_KEY);
  } catch {
    /* ignore */
  }
}

export function secondsUntil(endAt) {
  return Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
}