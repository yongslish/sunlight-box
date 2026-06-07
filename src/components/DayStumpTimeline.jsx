import { useState } from 'react';
import { buildDayMarkers, hourLabel } from '../utils/dayTimeline.js';

export function DayStumpTimeline({ record }) {
  const markers = buildDayMarkers(record);
  const [showAll, setShowAll] = useState(false);
  const currentHour = new Date().getHours();

  // 按小时分组
  const byHour = {};
  markers.forEach((m) => {
    if (!byHour[m.hour]) byHour[m.hour] = [];
    byHour[m.hour].push(m);
  });

  const activeHours = Object.keys(byHour)
    .map(Number)
    .sort((a, b) => a - b);

  const allHours = Array.from({ length: 24 }, (_, h) => h);
  const displayHours = showAll ? allHours : activeHours;

  if (!markers.length) {
    return (
      <div className="stump-card stump-card--empty">
        <p className="stump-title">今日树桩</p>
        <div className="stump-empty-body">
          <span className="stump-empty-icon" aria-hidden>🌱</span>
          <p className="stump-empty-text">完成一次专注番茄后，这里会长出小树</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stump-card">
      <div className="stump-header">
        <p className="stump-title">
          今日树桩 · <span className="stump-count">{markers.length}</span> 棵
        </p>
        <button
          type="button"
          className="stump-toggle"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? '收起空时段' : `展开全部 (${24 - activeHours.length} 空)`}
        </button>
      </div>

      <div className="stump-grid">
        {displayHours.map((hour) => {
          const trees = byHour[hour] || [];
          const isCurrent = hour === currentHour;
          const hasTrees = trees.length > 0;

          // 合并同类型标签
          const tomatoCount = trees.filter((t) => t.kind === 'tomato').length;
          const breathCount = trees.filter((t) => t.kind === 'breath').length;

          return (
            <div
              key={hour}
              className={`stump-row ${isCurrent ? 'stump-row--now' : ''} ${hasTrees ? 'stump-row--active' : 'stump-row--empty'}`}
            >
              <span className="stump-hour">
                {hourLabel(hour)}
                {isCurrent && <span className="stump-now-dot" />}
              </span>

              {hasTrees ? (
                <div className="stump-slot">
                  {tomatoCount > 0 && (
                    <span className="stump-chip stump-chip--tomato" title={`${tomatoCount} 个番茄`}>
                      🍅 {tomatoCount}
                    </span>
                  )}
                  {breathCount > 0 && (
                    <span className="stump-chip stump-chip--breath" title={`${breathCount} 次呼吸`}>
                      🌊 {breathCount}
                    </span>
                  )}
                  {/* 备注预览 */}
                  {trees.slice(0, 2).map((m) =>
                    m.remark ? (
                      <span key={m.id} className="stump-remark">
                        {m.remark.length > 12 ? m.remark.slice(0, 12) + '…' : m.remark}
                      </span>
                    ) : null
                  )}
                </div>
              ) : (
                <span className="stump-placeholder">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
