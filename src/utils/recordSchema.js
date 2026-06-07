export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso, delta) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return todayISOFromDate(d);
}

function todayISOFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function emptyHourlyLog() {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    content: '',
    moodNote: '',
    focusScore: 0,
  }));
}

export function emptyFocusTimer() {
  return {
    todayTomatoCount: 0,
    todayFocusMin: 0,
    todayRestMin: 0,
    totalFocusSec: 0,
    tomatoHistory: [],
  };
}

export function emptyBreathTrain() {
  return {
    todayBreathRound: 0,
    todayBreathSec: 0,
    todayBreathMin: 0,
    breathHistory: [],
  };
}

function syncBreathDuration(bt) {
  const out = { ...emptyBreathTrain(), ...bt };
  if ((out.todayBreathSec || 0) > 0) {
    out.todayBreathMin = Math.floor(out.todayBreathSec / 60);
    return out;
  }
  if (out.todayBreathRound > 0 && out.todayBreathMin === out.todayBreathRound) {
    out.todayBreathSec = out.todayBreathRound * 14;
  } else if (out.todayBreathMin > 0) {
    out.todayBreathSec = out.todayBreathMin * 60;
  }
  out.todayBreathMin = Math.floor((out.todayBreathSec || 0) / 60);
  return out;
}

export function emptyRecordFull(date = todayISO()) {
  return {
    date,
    noNightEmission: false,
    emissionReason: '',
    mood: 0,
    wushuMin: 0,
    sleepEarly: false,
    eatRegular: false,
    drinkWater: false,
    walk: false,
    read: false,
    meditate: false,
    dailyNote: '',
    score: 0,
    photo: null,
    photoDate: null,
    photoTime: null,
    photoGeo: null,
    hourlyLog: emptyHourlyLog(),
    todoList: [],
    focusTimer: emptyFocusTimer(),
    breathTrain: emptyBreathTrain(),
  };
}

export function normalizeRecord(raw) {
  if (!raw) return emptyRecordFull();
  const base = emptyRecordFull(raw.date || todayISO());
  const hourly =
    Array.isArray(raw.hourlyLog) && raw.hourlyLog.length === 24
      ? raw.hourlyLog.map((h, i) => ({
          hour: h.hour ?? i,
          content: h.content ?? '',
          moodNote: h.moodNote ?? '',
          focusScore: h.focusScore ?? 0,
        }))
      : emptyHourlyLog();

  return {
    ...base,
    ...raw,
    hourlyLog: hourly,
    todoList: Array.isArray(raw.todoList) ? raw.todoList : [],
    focusTimer: {
      ...emptyFocusTimer(),
      ...(raw.focusTimer || {}),
      tomatoHistory: raw.focusTimer?.tomatoHistory ?? [],
    },
    breathTrain: syncBreathDuration({
      ...emptyBreathTrain(),
      ...(raw.breathTrain || {}),
      breathHistory: raw.breathTrain?.breathHistory ?? [],
    }),
  };
}

export function nowHMS() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

export function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function currentHour() {
  return new Date().getHours();
}

export function genId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
