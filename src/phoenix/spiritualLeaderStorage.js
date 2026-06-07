/**
 * 静态精神领袖模块本地存储层。
 * 核心定位：该模块不是 AI 聊天，而是用户与未来自己的单向私密倾诉通道。
 * 所有数据仅写入本地 localStorage，不上传服务器。
 *
 * 存储格式：
 * - sunbox_spiritual_leader_messages_v1: Base64(JSON Array)
 * - sunbox_spiritual_leader_settings_v1: Base64(JSON Object)
 * - sunbox_happy_bank_cards: Base64(JSON Array)（复用入口，占位兼容）
 */

const MESSAGES_KEY = 'sunbox_spiritual_leader_messages_v1';
const SETTINGS_KEY = 'sunbox_spiritual_leader_settings_v1';
const HAPPY_BANK_KEY = 'sunbox_happy_bank_cards';
const ANXIETY_RECORDS_KEY = 'sunbox_anxiety_records';

const DEFAULT_SETTINGS = {
  enabled: true,
  replySpeed: 'medium', // fast | medium | slow
  breathingEnabled: true,
  anxietySyncEnabled: true,
  bellEnabled: true,
  allDayTestMode: true,
};

const POSITIVE_KEYWORDS = ['开心', '轻松', '治愈', '变好', '希望'];

function encodeBase64Utf8(input) {
  try {
    return btoa(unescape(encodeURIComponent(input)));
  } catch {
    return '';
  }
}

function decodeBase64Utf8(input) {
  try {
    return decodeURIComponent(escape(atob(input)));
  } catch {
    return '';
  }
}

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadEncoded(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const decoded = decodeBase64Utf8(raw);
    if (!decoded) return fallback;
    return safeParse(decoded, fallback);
  } catch {
    return fallback;
  }
}

function saveEncoded(key, value) {
  try {
    const raw = JSON.stringify(value);
    const encoded = encodeBase64Utf8(raw);
    if (!encoded) return false;
    localStorage.setItem(key, encoded);
    return true;
  } catch {
    return false;
  }
}

export function getTodayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateZh(dateKey) {
  const [y = '', m = '', d = ''] = String(dateKey).split('-');
  return `${y}年${m}月${d}日`;
}

export function loadLeaderSettings() {
  const saved = loadEncoded(SETTINGS_KEY, null);
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function saveLeaderSettings(next) {
  return saveEncoded(SETTINGS_KEY, { ...loadLeaderSettings(), ...next });
}

export function loadLeaderMessages() {
  const list = loadEncoded(MESSAGES_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function addLeaderMessage({ text, mode = 'normal', date = new Date() }) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const list = loadLeaderMessages();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: getTodayKey(date),
    text: clean,
    mode,
    createdAt: Date.now(),
  };
  list.push(entry);
  saveEncoded(MESSAGES_KEY, list);
  tryGenerateHappyCard(clean, entry.date);
  return entry;
}

export function getMessagesByDate(dateKey) {
  return loadLeaderMessages().filter((item) => item.date === dateKey);
}

export function getGroupedHistory() {
  const list = loadLeaderMessages();
  const map = new Map();
  for (const item of list) {
    if (!map.has(item.date)) map.set(item.date, []);
    map.get(item.date).push(item);
  }
  const grouped = Array.from(map.entries())
    .map(([date, messages]) => {
      const sorted = messages.slice().sort((a, b) => a.createdAt - b.createdAt);
      const first = sorted[0]?.text || '';
      const preview = first.length > 15 ? `${first.slice(0, 15)}...` : first;
      return { date, preview, messages: sorted };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return grouped;
}

export function clearAllLeaderData() {
  try {
    localStorage.removeItem(MESSAGES_KEY);
    return true;
  } catch {
    return false;
  }
}

function loadAnxietyRecords() {
  // 复用现有焦虑记录存储接口底层 key（仅本地读取）
  const raw = localStorage.getItem(ANXIETY_RECORDS_KEY);
  const list = raw ? safeParse(raw, []) : [];
  return Array.isArray(list) ? list : [];
}

export function getAnxietyFirstLineByDate(dateKey) {
  const list = loadAnxietyRecords()
    .filter((item) => item.date === dateKey)
    .sort((a, b) => a.submittedAt - b.submittedAt);
  const first = list[0]?.content || '';
  return first.trim();
}

function loadHappyCards() {
  const list = loadEncoded(HAPPY_BANK_KEY, []);
  return Array.isArray(list) ? list : [];
}

function saveHappyCards(cards) {
  saveEncoded(HAPPY_BANK_KEY, cards);
}

function tryGenerateHappyCard(text, dateKey) {
  if (!POSITIVE_KEYWORDS.some((keyword) => text.includes(keyword))) return;
  const cards = loadHappyCards();
  cards.unshift({
    id: `leader-happy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: dateKey,
    title: '今日微光',
    content: text.slice(0, 48),
    source: 'spiritual-leader',
    createdAt: Date.now(),
  });
  saveHappyCards(cards);
}

export function resolveSilentSeconds(text, speed) {
  if (speed === 'fast') return 3;
  if (speed === 'medium') return 5;
  if (speed === 'slow') return 10;
  if (speed === 'auto') {
    const len = String(text || '').trim().length;
    if (len <= 50) return 3;
    if (len <= 100) return 5;
    return 10;
  }
  return 5;
}
