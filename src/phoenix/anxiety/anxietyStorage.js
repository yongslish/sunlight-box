/**
 * 焦虑记录 localStorage（仅本地，不上传）
 */

const RECORDS_KEY = 'sunbox_anxiety_records';
const DRAFT_KEY = 'sunbox_anxiety_draft';
const GATE_CLOSED_PREFIX = 'sunbox_anxiety_gate_closed_';

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isGateClosedToday(date = new Date()) {
  try {
    return localStorage.getItem(`${GATE_CLOSED_PREFIX}${todayKey(date)}`) === '1';
  } catch {
    return false;
  }
}

export function closeGateForToday(date = new Date()) {
  try {
    localStorage.setItem(`${GATE_CLOSED_PREFIX}${todayKey(date)}`, '1');
  } catch {
    /* ignore */
  }
}

/** 重新开放今日 21 点入口（测试或误触移交后使用） */
export function clearGateClosedForToday(date = new Date()) {
  try {
    localStorage.removeItem(`${GATE_CLOSED_PREFIX}${todayKey(date)}`);
  } catch {
    /* ignore */
  }
}

/** @returns {Array<{ id: string, date: string, content: string, submittedAt: number }>} */
export function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveRecords(list) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(list));
}

export function addRecord(content, date = new Date()) {
  const records = loadRecords();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: todayKey(date),
    content: content || '',
    submittedAt: Date.now(),
  };
  records.unshift(entry);
  saveRecords(records);
  return entry;
}

export function deleteAllRecords() {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch {
    /* ignore */
  }
}

export function loadDraft() {
  try {
    return localStorage.getItem(DRAFT_KEY) || '';
  } catch {
    return '';
  }
}

export function saveDraft(text) {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
