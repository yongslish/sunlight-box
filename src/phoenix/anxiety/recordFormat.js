/**
 * 焦虑记录展示用时间格式
 */

/** @param {number} submittedAt */
export function formatRecordDateTime(submittedAt) {
  const d = new Date(submittedAt);
  return {
    date: d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    time: d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
  };
}
