import {
  addDays,
  currentHour,
  emptyBreathTrain,
  emptyFocusTimer,
  genId,
  normalizeRecord,
  nowHM,
  nowHMS,
  todayISO,
} from './recordSchema.js';

export function effectiveMood(record) {
  const r = normalizeRecord(record);
  let m = r.mood || 0;
  if (m < 1) return m;
  if ((r.breathTrain?.todayBreathRound || 0) >= 10) {
    return Math.min(5, m + 1);
  }
  return m;
}

export function setHourlyFocusScore(record, hour, focusScore) {
  const r = normalizeRecord(record);
  const hourlyLog = r.hourlyLog.map((h) =>
    h.hour === hour ? { ...h, focusScore: Math.max(h.focusScore || 0, focusScore) } : h
  );
  return { ...r, hourlyLog };
}

export function appendTomatoHistory(record, entry) {
  const r = normalizeRecord(record);
  const ft = { ...emptyFocusTimer(), ...r.focusTimer };
  ft.tomatoHistory = [...(ft.tomatoHistory || []), entry];
  return { ...r, focusTimer: ft };
}

function appendHourlyTomatoNote(record, hour, remark) {
  const r = normalizeRecord(record);
  const tag = remark?.trim() ? `🍅 ${remark.trim()}` : '🍅 专注';
  const hourlyLog = r.hourlyLog.map((h) => {
    if (h.hour !== hour) return h;
    const prev = h.content?.trim();
    return {
      ...h,
      content: prev ? `${prev}；${tag}` : tag,
      focusScore: Math.max(h.focusScore || 0, 3),
    };
  });
  return { ...r, hourlyLog };
}

export function completeTomatoSession(record, {
  durationMin,
  durationSec,
  type,
  remark,
  todoId,
  interrupted,
  interruptReason,
  startTime,
  endTime,
  hour,
}) {
  let r = normalizeRecord(record);
  const ft = { ...emptyFocusTimer(), ...r.focusTimer };
  const sec = durationSec ?? durationMin * 60;
  const mins = Math.max(0, Math.round(sec / 60)) || durationMin || 0;
  const hourSlot = hour ?? currentHour();
  const entry = {
    tomatoId: genId(),
    startTime: startTime || nowHMS(),
    endTime: endTime || nowHMS(),
    hour: hourSlot,
    type,
    durationMin: mins,
    durationSec: sec,
    finishStatus: interrupted ? 'interrupted' : 'completed',
    remark: remark || interruptReason || '',
  };
  ft.tomatoHistory = [...(ft.tomatoHistory || []), entry];

  if (!interrupted && type === 'focus') {
    ft.todayTomatoCount = (ft.todayTomatoCount || 0) + 1;
    ft.todayFocusMin = (ft.todayFocusMin || 0) + mins;
    ft.totalFocusSec = (ft.totalFocusSec || 0) + sec;
    r = setHourlyFocusScore(r, hourSlot, 3);
    if (remark?.trim()) {
      r = appendHourlyTomatoNote(r, hourSlot, remark);
    }
    if (todoId) {
      r = {
        ...r,
        todoList: r.todoList.map((t) =>
          t.id === todoId
            ? { ...t, pomodoroDone: (t.pomodoroDone || 0) + 1 }
            : t
        ),
      };
    }
  } else if (!interrupted && type === 'rest') {
    ft.todayRestMin = (ft.todayRestMin || 0) + durationMin;
  }

  return { ...r, focusTimer: ft };
}

/** 将累计秒数格式化为可读时长（与轮次独立） */
export function formatBreathDuration(totalSec) {
  const sec = Math.max(0, Math.round(totalSec || 0));
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (s === 0) return `${m} 分钟`;
  return `${m} 分 ${s} 秒`;
}

export function completeBreathRound(record, { breathSpeed, roundDurationSec }) {
  let r = normalizeRecord(record);
  const bt = { ...emptyBreathTrain(), ...r.breathTrain };
  const sec = Math.max(0, roundDurationSec || 0);
  bt.todayBreathRound = (bt.todayBreathRound || 0) + 1;
  bt.todayBreathSec = (bt.todayBreathSec || 0) + sec;
  bt.todayBreathMin = Math.floor(bt.todayBreathSec / 60);
  const last = bt.breathHistory[bt.breathHistory.length - 1];
  const session = last && !last.endTime
    ? { ...last, rounds: (last.rounds || 0) + 1, endTime: nowHM() }
    : {
        startTime: nowHM(),
        endTime: nowHM(),
        rounds: 1,
        breathSpeed,
      };
  if (last && !last.endTime) {
    bt.breathHistory = [...bt.breathHistory.slice(0, -1), session];
  } else {
    bt.breathHistory = [...bt.breathHistory, session];
  }
  r = setHourlyFocusScore(r, currentHour(), 2);
  return { ...r, breathTrain: bt };
}

export function startBreathSession(record, breathSpeed) {
  const r = normalizeRecord(record);
  const bt = { ...emptyBreathTrain(), ...r.breathTrain };
  const last = bt.breathHistory[bt.breathHistory.length - 1];
  if (last && !last.endTime && last.rounds === 0) {
    return r;
  }
  bt.breathHistory = [
    ...bt.breathHistory,
    { startTime: nowHM(), endTime: '', rounds: 0, breathSpeed },
  ];
  return { ...r, breathTrain: bt };
}

export function resetTodayBreathStats(record) {
  const r = normalizeRecord(record);
  return {
    ...r,
    breathTrain: emptyBreathTrain(),
  };
}

function parseHourFromTime(timeStr) {
  if (!timeStr) return currentHour();
  const h = parseInt(String(timeStr).split(':')[0], 10);
  return Number.isNaN(h) ? currentHour() : h;
}

/** 今日已完成专注番茄，供树桩时间轴展示 */
export function getCompletedTomatoMarkers(record) {
  const hist = record?.focusTimer?.tomatoHistory || [];
  return hist
    .filter((t) => t.type === 'focus' && t.finishStatus === 'completed')
    .map((t) => ({
      id: t.tomatoId,
      hour: t.hour ?? parseHourFromTime(t.startTime),
      minute: parseMinuteFromTime(t.startTime),
      remark: (t.remark || '').trim(),
      startTime: t.startTime,
      endTime: t.endTime,
      durationMin: t.durationMin,
    }))
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

function parseMinuteFromTime(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':');
  return parseInt(parts[1], 10) || 0;
}

export function countInterruptedTomatoes(record) {
  const ft = record?.focusTimer;
  if (!ft?.tomatoHistory) return 0;
  return ft.tomatoHistory.filter(
    (t) => t.type === 'focus' && t.finishStatus === 'interrupted'
  ).length;
}

export function tomatoCompletionRate(record) {
  const ft = record?.focusTimer;
  if (!ft?.tomatoHistory?.length) return 0;
  const focus = ft.tomatoHistory.filter((t) => t.type === 'focus');
  if (!focus.length) return 0;
  const done = focus.filter((t) => t.finishStatus === 'completed').length;
  return Math.round((done / focus.length) * 100);
}

export function totalCompletedTomatoesAllTime(records) {
  return records.reduce((sum, r) => {
    const hist = r.focusTimer?.tomatoHistory || [];
    return (
      sum +
      hist.filter((t) => t.type === 'focus' && t.finishStatus === 'completed').length
    );
  }, 0);
}

export function consecutiveDaysWith(records, predicate) {
  let count = 0;
  let d = todayISO();
  const byDate = Object.fromEntries(records.map((r) => [r.date, normalizeRecord(r)]));
  while (byDate[d] && predicate(byDate[d])) {
    count += 1;
    d = addDays(d, -1);
  }
  return count;
}
