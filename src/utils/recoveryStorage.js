import {
  consecutiveDaysWith,
  effectiveMood,
  formatBreathDuration,
  totalCompletedTomatoesAllTime,
} from './focusBreathStorage.js';
import { emptyRecordFull, normalizeRecord } from './recordSchema.js';

const KEYS = {
  RECORDS: 'recoveryRecord',
  STREAK: 'streakData',
  ACHIEVEMENTS: 'achievementList',
};

const MOOD_SCORES = { 1: 5, 2: 10, 3: 15, 4: 18, 5: 20 };

export const MOOD_LABELS = {
  1: '很差',
  2: '一般',
  3: '还好',
  4: '不错',
  5: '很好',
};

export function formatCheckInStatus(record) {
  const r = record ?? emptyRecord();
  return r.checkedIn ? '已打卡' : '未打卡';
}

/** 成就分组 */
export const ACHIEVEMENT_GROUPS = [
  { key: 'streak', label: '坚持打卡' },
  { key: 'mood', label: '情绪管理' },
  { key: 'exercise', label: '运动健康' },
  { key: 'focus', label: '专注力' },
];

const EXERCISE_HOURS = (h) => h * 60;

export const ACHIEVEMENTS = [
  // 坚持打卡
  { id: 'streak_7', group: 'streak', title: '初出茅庐', desc: '连续打卡 7 天', check: (c) => c.streak.current >= 7 },
  { id: 'streak_14', group: 'streak', title: '渐入佳境', desc: '连续打卡 14 天', check: (c) => c.streak.current >= 14 },
  { id: 'streak_30', group: 'streak', title: '月有所成', desc: '连续打卡 30 天', check: (c) => c.streak.current >= 30 },
  { id: 'streak_60', group: 'streak', title: '双月坚持', desc: '连续打卡 60 天', check: (c) => c.streak.current >= 60 },
  { id: 'streak_100', group: 'streak', title: '百日之功', desc: '连续打卡 100 天', check: (c) => c.streak.current >= 100 },
  { id: 'streak_180', group: 'streak', title: '半年有成', desc: '连续打卡 180 天', check: (c) => c.streak.current >= 180 },
  { id: 'streak_365', group: 'streak', title: '一年之约', desc: '连续打卡 365 天', check: (c) => c.streak.current >= 365 },
  // 情绪管理
  { id: 'mood_7', group: 'mood', title: '心情平和', desc: '连续 7 天情绪 ≥ 4', check: (c) => c.moodStreak >= 7 },
  { id: 'mood_30', group: 'mood', title: '情绪稳定', desc: '连续 30 天情绪 ≥ 4', check: (c) => c.moodStreak >= 30 },
  { id: 'mood_100', group: 'mood', title: '内在平静', desc: '连续 100 天情绪 ≥ 4', check: (c) => c.moodStreak >= 100 },
  // 运动健康
  { id: 'exercise_10h', group: 'exercise', title: '运动起步', desc: '累计运动 10 小时', check: (c) => c.totalExerciseMin >= EXERCISE_HOURS(10) },
  { id: 'exercise_50h', group: 'exercise', title: '体能提升', desc: '累计运动 50 小时', check: (c) => c.totalExerciseMin >= EXERCISE_HOURS(50) },
  { id: 'exercise_200h', group: 'exercise', title: '运动达人', desc: '累计运动 200 小时', check: (c) => c.totalExerciseMin >= EXERCISE_HOURS(200) },
  // 专注力
  { id: 'breath_calm_7', group: 'focus', title: '呼吸入门', desc: '连续 7 天每日呼吸 ≥ 10 轮', check: (c) => c.breathDays7 >= 7 },
  { id: 'breath_steady_30', group: 'focus', title: '气息沉稳', desc: '连续 30 天每日呼吸 ≥ 20 轮', check: (c) => c.breathDays30 >= 30 },
  { id: 'tomato_first_25', group: 'focus', title: '专注初成', desc: '累计完成 25 个有效番茄', check: (c) => c.totalTomatoes >= 25 },
  { id: 'tomato_steady_30', group: 'focus', title: '高效专注', desc: '连续 30 天每日 ≥ 4 个番茄', check: (c) => c.tomatoDays30 >= 30 },
];

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso, delta) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return todayISOFromDate(d);
}

function todayISOFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function emptyRecord(date = todayISO()) {
  return emptyRecordFull(date);
}

export function calcScore(record) {
  const r = normalizeRecord(record);
  if (!r) return 0;
  let score = 0;
  if (r.checkedIn) score += 30;     // 打卡基础分
  const em = effectiveMood(r);
  if (em >= 1 && em <= 5) score += MOOD_SCORES[em] ?? 0;
  score += Math.min(20, Math.floor((r.exerciseMin || 0) / 3));
  if (r.sleepEarly) score += 5;
  if (r.eatRegular) score += 5;
  if (r.drinkWater) score += 5;
  if (r.walk) score += 5;
  if (r.read) score += 5;
  if (r.meditate) score += 5;
  score += (r.focusTimer?.todayTomatoCount || 0) * 3;
  if ((r.breathTrain?.todayBreathRound || 0) >= 20) score += 3;
  return Math.min(100, score);
}

export function loadRecords() {
  return readJSON(KEYS.RECORDS, []);
}

export function saveRecords(records) {
  writeJSON(KEYS.RECORDS, records);
}

export function loadStreak() {
  return readJSON(KEYS.STREAK, { current: 0, max: 0, lastResetDate: '' });
}

export function saveStreak(streak) {
  writeJSON(KEYS.STREAK, streak);
}

const ACHIEVEMENT_ID_ALIASES = { calm_7: 'mood_7' };

export function loadAchievements() {
  const raw = readJSON(KEYS.ACHIEVEMENTS, []);
  const mapped = raw.map((id) => ACHIEVEMENT_ID_ALIASES[id] ?? id);
  return [...new Set(mapped)];
}

export function saveAchievements(list) {
  writeJSON(KEYS.ACHIEVEMENTS, list);
}

function upsertRecord(records, record) {
  const idx = records.findIndex((r) => r.date === record.date);
  const normalized = normalizeRecord(record);
  const full = { ...normalized, score: calcScore(normalized) };
  if (idx >= 0) {
    const copy = [...records];
    copy[idx] = full;
    return copy;
  }
  return [...records, full].sort((a, b) => a.date.localeCompare(b.date));
}

/** 计算连续打卡天数 */
export function computeStreakFromRecords(records) {
  const today = todayISO();
  let current = 0;
  let d = today;
  const byDate = Object.fromEntries(records.map((r) => [r.date, r]));

  while (byDate[d]?.checkedIn) {
    current += 1;
    d = addDays(d, -1);
  }

  let max = 0;
  let run = 0;
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of sorted) {
    if (r.checkedIn) {
      run += 1;
      max = Math.max(max, run);
    } else {
      run = 0;
    }
  }

  let lastResetDate = '';
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i];
    if (!r.checkedIn) {
      lastResetDate = r.date;
      break;
    }
  }

  return { current, max, lastResetDate };
}

function moodStreakConsecutive(records, minMood = 4) {
  const today = todayISO();
  let count = 0;
  let d = today;
  const byDate = Object.fromEntries(records.map((r) => [r.date, r]));
  while (true) {
    const r = byDate[d];
    if (!r || r.mood < minMood) break;
    count += 1;
    d = addDays(d, -1);
  }
  return count;
}

function totalExerciseMinutes(records) {
  return records.reduce((s, r) => s + (r.exerciseMin || 0), 0);
}

export function buildAchievementContext(records, streak) {
  const norm = records.map((r) => normalizeRecord(r));
  return {
    streak,
    moodStreak: moodStreakConsecutive(norm, 4),
    totalExerciseMin: totalExerciseMinutes(norm),
    totalTomatoes: totalCompletedTomatoesAllTime(norm),
    breathDays7: consecutiveDaysWith(norm, (r) => (r.breathTrain?.todayBreathRound || 0) >= 10),
    breathDays30: consecutiveDaysWith(norm, (r) => (r.breathTrain?.todayBreathRound || 0) >= 20),
    tomatoDays30: consecutiveDaysWith(norm, (r) => (r.focusTimer?.todayTomatoCount || 0) >= 4),
  };
}

export function checkNewAchievements(records, streak, unlocked) {
  const ctx = buildAchievementContext(records, streak);
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (!unlocked.includes(a.id) && a.check(ctx)) {
      newly.push(a);
    }
  }
  return newly;
}

export function ensureTodayRecord() {
  const today = todayISO();
  let records = loadRecords();
  if (!records.find((r) => r.date === today)) {
    records = upsertRecord(records, emptyRecord(today));
    saveRecords(records);
  }
  return records;
}

export function getRecordByDate(date) {
  const records = loadRecords();
  return records.find((r) => r.date === date) ?? null;
}

export function getTodayRecord() {
  ensureTodayRecord();
  const today = todayISO();
  return normalizeRecord(getRecordByDate(today) ?? emptyRecord(today));
}

export function updateTodayRecord(partial) {
  const today = todayISO();
  let records = ensureTodayRecord();
  const existing = records.find((r) => r.date === today) ?? emptyRecord(today);
  const merged = normalizeRecord({ ...existing, ...partial, date: today });
  merged.score = calcScore(merged);
  records = upsertRecord(records, merged);

  let streak = computeStreakFromRecords(records);
  saveRecords(records);
  saveStreak(streak);

  const unlocked = loadAchievements();
  const newly = checkNewAchievements(records, streak, unlocked);
  if (newly.length) {
    saveAchievements([...unlocked, ...newly.map((a) => a.id)]);
  }

  return { record: merged, streak, newly };
}

export function markCheckedInToday() {
  return updateTodayRecord({ checkedIn: true });
}

/** 标记今日未打卡（用于重置），同时清除照片 */
export function markSkippedToday() {
  const today = todayISO();
  let records = ensureTodayRecord();
  const existing = records.find((r) => r.date === today) ?? emptyRecord(today);
  const merged = normalizeRecord({
    ...existing,
    date: today,
    checkedIn: false,
    photo: null,
    photoDate: null,
    photoTime: null,
    photoGeo: null,
  });
  merged.score = calcScore(merged);
  records = upsertRecord(records, merged);

  const streak = computeStreakFromRecords(records);
  streak.current = 0;
  streak.lastResetDate = today;
  saveRecords(records);
  saveStreak(streak);

  return { record: merged, streak, newly: [] };
}

export function formatReportDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${y}年${m}月${d}日`;
}

export function habitList(record) {
  if (!record) return [];
  const items = [];
  if (record.sleepEarly) items.push('早睡早起');
  if (record.eatRegular) items.push('三餐规律');
  if (record.drinkWater) items.push('多喝水');
  if (record.walk) items.push('散步');
  if (record.read) items.push('阅读');
  if (record.meditate) items.push('冥想');
  return items;
}

export function buildDailyReport(record, streak, date = record?.date ?? todayISO()) {
  const r = record ?? emptyRecord(date);
  const s = streak ?? loadStreak();
  const habits = habitList(r);
  const moodText =
    r.mood >= 1 && r.mood <= 5 ? MOOD_LABELS[r.mood] : '未记录';

  return `【${formatReportDate(r.date)} | 今日综合评分：${r.score ?? calcScore(r)}分】
✅ 打卡：${r.checkedIn ? '已完成' : '未打卡'}
😊 情绪：${moodText}
🏃 运动：${r.exerciseMin || 0} 分钟
📌 习惯：${habits.length ? habits.join('、') : '暂无完成项'}
💭 今日感悟：${r.dailyNote?.trim() || '（无）'}
📈 连续打卡：${s.current} 天 | 历史最高 ${s.max} 天
🍅 番茄专注：今日 ${r.focusTimer?.todayTomatoCount || 0} 个 | 累计 ${r.focusTimer?.todayFocusMin || 0} 分钟
🌊 呼吸训练：今日 ${r.breathTrain?.todayBreathRound || 0} 轮 | ${formatBreathDuration(r.breathTrain?.todayBreathSec)}
🌿 明日建议：${tomorrowSuggestion(r)}`;
}

export function tomorrowSuggestion(record) {
  const r = record ?? emptyRecord();
  if (!r.checkedIn) {
    return '今天还没打卡哦，明天记得来记录一下～';
  }
  if (!r.mood || r.mood <= 2) {
    return '明天留一刻安静，做几轮深呼吸，让情绪慢慢归位。';
  }
  if ((r.exerciseMin || 0) < 15) {
    return '明天动起来！散个步或做 15 分钟运动，身体会感谢你。';
  }
  const habits = habitList(r);
  if (habits.length < 3) {
    return '明天选一两件小事坚持：喝水、散步或早睡，胜过一次完美计划。';
  }
  if (r.score >= 80) {
    return '今天很棒！明天保持节奏即可，不必再加负担。';
  }
  return '明天延续今日的好习惯，静默积累，即是前行。';
}

export function exportMarkdown(record, streak) {
  return buildDailyReport(record, streak);
}

export function initRecoveryMidnightCheck() {
  ensureTodayRecord();
  const check = () => ensureTodayRecord();
  const onVis = () => {
    if (document.visibilityState === 'visible') check();
  };
  document.addEventListener('visibilitychange', onVis);
  const interval = window.setInterval(check, 60_000);
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    clearInterval(interval);
  };
}

export function getChartStreakSeries(records, days = 60) {
  const end = todayISO();
  const start = addDays(end, -(days - 1));
  const byDate = Object.fromEntries(records.map((r) => [r.date, r]));
  const labels = [];
  const streakLine = [];
  const resetPoints = [];

  let d = start;
  while (d <= end) {
    labels.push(d.slice(5));
    const r = byDate[d];
    if (r && !r.checkedIn) {
      resetPoints.push({ date: d, reason: '中断打卡', index: labels.length - 1 });
    }
    d = addDays(d, 1);
  }

  d = start;
  while (d <= end) {
    let run = 0;
    let check = d;
    while (byDate[check]?.checkedIn) {
      run += 1;
      check = addDays(check, -1);
    }
    streakLine.push(run);
    d = addDays(d, 1);
  }

  return { labels, streakLine, resetPoints };
}

export function getMoodSeries(records, days = 30) {
  const end = todayISO();
  const start = addDays(end, -(days - 1));
  const byDate = Object.fromEntries(records.map((r) => [r.date, r]));
  const labels = [];
  const data = [];
  let d = start;
  while (d <= end) {
    labels.push(d.slice(5));
    const r = byDate[d];
    data.push(r?.mood >= 1 ? r.mood : null);
    d = addDays(d, 1);
  }
  return { labels, data };
}

export function getWushuBars(records, mode = 'week') {
  const end = todayISO();
  const span = mode === 'month' ? 30 : 7;
  const start = addDays(end, -(span - 1));
  const byDate = Object.fromEntries(records.map((r) => [r.date, r]));
  const labels = [];
  const data = [];
  let d = start;
  while (d <= end) {
    labels.push(d.slice(5));
    data.push(byDate[d]?.exerciseMin || 0);
    d = addDays(d, 1);
  }
  return { labels, data };
}

export function getBreathSeries(records, days = 30) {
  const end = todayISO();
  const start = addDays(end, -(days - 1));
  const byDate = Object.fromEntries(records.map((r) => [r.date, r]));
  const labels = [];
  const data = [];
  let d = start;
  while (d <= end) {
    labels.push(d.slice(5));
    data.push(byDate[d]?.breathTrain?.todayBreathRound || 0);
    d = addDays(d, 1);
  }
  return { labels, data };
}

export function getTomatoSeries(records, days = 30) {
  const end = todayISO();
  const start = addDays(end, -(days - 1));
  const byDate = Object.fromEntries(records.map((r) => [r.date, r]));
  const labels = [];
  const data = [];
  let d = start;
  while (d <= end) {
    labels.push(d.slice(5));
    data.push(byDate[d]?.focusTimer?.todayTomatoCount || 0);
    d = addDays(d, 1);
  }
  return { labels, data };
}
