import { useEffect, useRef, useState } from 'react';
import { DayStumpTimeline } from './DayStumpTimeline.jsx';
import { genId } from '../utils/recordSchema.js';

const FOCUS_LABELS = { 0: '', 1: '松散', 2: '放松', 3: '专注' };

export function HourlyTodoSection({ record, onPatch }) {
  const [newTodo, setNewTodo] = useState('');
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const [hourEndNotice, setHourEndNotice] = useState('');
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const recordRef = useRef(record);
  const hourRef = useRef(currentHour);
  const noticeTimerRef = useRef(null);

  useEffect(() => {
    recordRef.current = record;
  }, [record]);

  useEffect(() => {
    hourRef.current = currentHour;
  }, [currentHour]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const ticker = window.setInterval(() => {
      const nowHour = new Date().getHours();
      if (nowHour === hourRef.current) return;

      const endedHour = hourRef.current;
      const endedSlot = recordRef.current.hourlyLog?.find((slot) => slot.hour === endedHour);
      const summary = endedSlot?.content?.trim() ? '内容已记录' : '建议补一条简记';
      const message = `${String(endedHour).padStart(2, '0')}:00 已结束，${summary}`;

      setCurrentHour(nowHour);
      setHourEndNotice(message);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => setHourEndNotice(''), 4200);

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        document.visibilityState !== 'visible' &&
        Notification.permission === 'granted'
      ) {
        new Notification('小时记录提醒', {
          body: `${message}，点击回到页面继续记录`,
          tag: 'hourly-log-reminder',
        });
      }
    }, 15_000);

    return () => clearInterval(ticker);
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    } catch {
      setNotificationPermission('denied');
    }
  };

  const addTodo = () => {
    const text = newTodo.trim();
    if (!text) return;
    const todo = {
      id: genId(),
      content: text,
      done: false,
      priority: 2,
      timePlan: '',
      pomodoroDone: 0,
    };
    onPatch({ todoList: [...(record.todoList || []), todo] });
    setNewTodo('');
  };

  const updateHour = (h, field, value) => {
    const hourlyLog = record.hourlyLog.map((slot) =>
      slot.hour === h ? { ...slot, [field]: value } : slot
    );
    onPatch({ hourlyLog });
  };

  return (
    <section className="recovery-card recovery-card-enter mt-4">
      <h2 className="recovery-section-title">今日时序｜拒绝空转</h2>
      <p className="mt-1 text-xs text-[#fff8e7]/35">按小时记录状态，番茄/呼吸会自动标记专注与放松</p>

      <DayStumpTimeline record={record} />

      <p className="mt-5 text-xs text-[#fff8e7]/40">近几小时简记</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        {hourEndNotice ? (
          <p className="text-[11px] text-[#c9a962]/80">{hourEndNotice}</p>
        ) : (
          <span />
        )}
        {notificationPermission !== 'unsupported' && notificationPermission !== 'granted' && (
          <button
            type="button"
            className="recovery-btn-ghost shrink-0 text-[11px]"
            onClick={requestNotificationPermission}
          >
            开启离开页提醒
          </button>
        )}
      </div>
      <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
        {record.hourlyLog?.slice(Math.max(0, currentHour - 2), currentHour + 4).map((slot) => (
          <div
            key={slot.hour}
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${
              slot.hour === currentHour
                ? 'border-[#7eb8d4]/35 bg-[#7eb8d4]/08'
                : 'border-[#fff8e7]/06 bg-black/15'
            }`}
          >
            <span className="w-8 shrink-0 tabular-nums text-[#fff8e7]/45">
              {String(slot.hour).padStart(2, '0')}:00
            </span>
            <input
              className="recovery-input min-h-0 flex-1 border-0 bg-transparent py-1 text-xs"
              placeholder="这一小时做了什么…"
              value={slot.content}
              onChange={(e) => updateHour(slot.hour, 'content', e.target.value)}
            />
            {slot.focusScore > 0 && (
              <span className="shrink-0 text-[10px] text-[#c9a962]/70">
                {FOCUS_LABELS[slot.focusScore]}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-[#fff8e7]/08 pt-4">
        <p className="mb-2 text-xs text-[#fff8e7]/40">待办清单</p>
        <ul className="space-y-2">
          {(record.todoList || []).map((t) => (
            <li
              key={t.id}
              className="flex items-start gap-2 rounded-lg border border-[#fff8e7]/08 bg-black/20 px-2 py-2"
            >
              <input
                type="checkbox"
                checked={!!t.done}
                onChange={(e) => {
                  const todoList = record.todoList.map((x) =>
                    x.id === t.id ? { ...x, done: e.target.checked } : x
                  );
                  onPatch({ todoList });
                }}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${t.done ? 'text-[#fff8e7]/35 line-through' : 'text-[#fff8e7]/80'}`}>
                  {t.content}
                </p>
                {(t.pomodoroDone || 0) > 0 && (
                  <p className="text-[10px] text-[#7eb8d4]/60">🍅 已完成 {t.pomodoroDone} 个番茄</p>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            className="recovery-input flex-1 text-sm"
            placeholder="添加待办…"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
          />
          <button type="button" className="recovery-btn-outline shrink-0" onClick={addTodo}>
            添加
          </button>
        </div>
      </div>
    </section>
  );
}
