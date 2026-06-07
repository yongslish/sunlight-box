/**
 * Sun Whisper 语料 — 数据来自 whisper-quotes.json
 * 手动增删请编辑：src/data/whisper-quotes.json
 * 说明文档：src/data/WHISPER_QUOTES.md
 */
import quotes from './whisper-quotes.json';

export const WHISPER_QUOTES = quotes;

const RECENT_KEY = 'sunbox_whisper_recent_quotes';
const RECENT_MAX = 8;

function loadRecentIds() {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentId(id) {
  const recent = loadRecentIds().filter((x) => x !== id);
  recent.unshift(id);
  sessionStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, RECENT_MAX)));
}

export function pickRandomQuote(previousId) {
  const recent = loadRecentIds();
  const blocked = new Set([previousId, ...recent].filter(Boolean));
  let pool = WHISPER_QUOTES.filter((q) => !blocked.has(q.id));
  if (pool.length === 0) {
    pool = WHISPER_QUOTES.filter((q) => q.id !== previousId);
  }
  if (pool.length === 0) pool = WHISPER_QUOTES;

  const picked = pool[Math.floor(Math.random() * pool.length)];
  saveRecentId(picked.id);
  return picked;
}
