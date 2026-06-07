/** 从 HH:mm 或 HH:mm:ss 解析小时 */
export function parseHourFromTime(timeStr) {
  if (!timeStr) return new Date().getHours();
  const h = parseInt(timeStr.split(':')[0], 10);
  return Number.isNaN(h) ? new Date().getHours() : h;
}

/** 汇总今日番茄、呼吸标记，供树桩时间轴使用 */
export function buildDayMarkers(record) {
  const markers = [];
  const ft = record?.focusTimer;
  const bt = record?.breathTrain;

  for (const t of ft?.tomatoHistory || []) {
    if (t.type !== 'focus') continue;
    const hour = t.hour ?? parseHourFromTime(t.startTime);
    markers.push({
      id: t.tomatoId,
      hour,
      minute: parseMinute(t.startTime),
      kind: 'tomato',
      icon: '🍅',
      label: t.remark?.trim() || '专注',
      status: t.finishStatus,
      durationMin: t.durationMin,
    });
  }

  for (const b of bt?.breathHistory || []) {
    if (!b.rounds) continue;
    const hour = parseHourFromTime(b.startTime);
    markers.push({
      id: `breath-${b.startTime}`,
      hour,
      minute: parseMinute(b.startTime),
      kind: 'breath',
      icon: '🌊',
      label: `呼吸 ${b.rounds} 轮`,
      status: 'completed',
    });
  }

  return markers.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

function parseMinute(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[1], 10) || 0;
}

export function hourLabel(h) {
  return `${String(h).padStart(2, '0')}:00`;
}
