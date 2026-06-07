/**
 * 21:00–21:59 隐藏入口时间窗
 */

import { isGateClosedToday } from './anxietyStorage.js';

/** 当前是否在 21:00:00 – 21:59:59 */
export function isNinePmWindow(now = new Date()) {
  return now.getHours() === 21;
}

/** 入口是否应激活（时间窗内且当日未移交关闭） */
export function isAnxietyGateActive(now = new Date(), force = false) {
  if (force) return true;
  return isNinePmWindow(now) && !isGateClosedToday(now);
}

/** 调试用：返回入口未激活的原因 */
export function getGateInactiveReason(now = new Date(), force = false) {
  if (force) return null;
  if (!isNinePmWindow(now)) {
    return `当前时间 ${now.toLocaleTimeString()}，入口仅在 21:00–21:59 出现`;
  }
  if (isGateClosedToday(now)) {
    return '今日已移交过，入口已关闭（可在控制台执行 clearGateClosedForToday 重新开放）';
  }
  return null;
}

/** 距离 22:00 的毫秒数（用于定时关闭光晕） */
export function msUntilTenPm(now = new Date()) {
  const end = new Date(now);
  end.setHours(22, 0, 0, 0);
  return Math.max(0, end.getTime() - now.getTime());
}
