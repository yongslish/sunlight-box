import { useCallback, useEffect, useRef, useState } from 'react';
import {
  completeTomatoSession,
  countInterruptedTomatoes,
  tomatoCompletionRate,
} from '../utils/focusBreathStorage.js';
import { nowHMS } from '../utils/recordSchema.js';

const MODES = [
  { id: 'deep', label: '深度专注', sub: '25+5', focus: 25, rest: 5 },
  { id: 'long', label: '长时专注', sub: '45+10', focus: 45, rest: 10 },
  { id: 'sprint', label: '短时冲刺', sub: '15+3', focus: 15, rest: 3 },
  { id: 'custom', label: '自定义时长', sub: '自定', focus: 25, rest: 5, custom: true },
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatMMSS(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${pad(m)}:${pad(s)}`;
}

export function PomodoroSection({ record, onSave }) {
  const ft = record.focusTimer || {};
  const [modeId, setModeId] = useState('deep');
  const [customFocus, setCustomFocus] = useState(25);
  const [customRest, setCustomRest] = useState(5);
  const [phase, setPhase] = useState('focus');
  const [status, setStatus] = useState('idle');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [remark, setRemark] = useState('');
  const [boundTodoId, setBoundTodoId] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [interruptOpen, setInterruptOpen] = useState(false);
  const [interruptReason, setInterruptReason] = useState('');
  const sessionStartRef = useRef(null);
  const tickRef = useRef(null);
  const handledZeroRef = useRef(false);

  const mode = MODES.find((m) => m.id === modeId) || MODES[0];
  const focusMin = mode.custom ? customFocus : mode.focus;
  const restMin = mode.custom ? customRest : mode.rest;

  const applyMode = useCallback(
    (nextPhase = 'focus') => {
      const min = nextPhase === 'focus' ? focusMin : restMin;
      setSecondsLeft(min * 60);
      setPhase(nextPhase);
    },
    [focusMin, restMin]
  );

  useEffect(() => {
    if (status !== 'running') return undefined;
    tickRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(tickRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(tickRef.current);
  }, [status]);

  useEffect(() => {
    if (status !== 'running') {
      if (secondsLeft > 0) handledZeroRef.current = false;
      return;
    }
    if (secondsLeft > 0) {
      handledZeroRef.current = false;
      return;
    }
    if (handledZeroRef.current) return;
    handledZeroRef.current = true;

    const durationMin = phase === 'focus' ? focusMin : restMin;
    const next = completeTomatoSession(record, {
      durationMin,
      type: phase,
      remark,
      todoId: boundTodoId || undefined,
      interrupted: false,
    });
    onSave(next);
    if (phase === 'focus') {
      setPhase('rest');
      setSecondsLeft(restMin * 60);
      setStatus('running');
      handledZeroRef.current = false;
    } else {
      setPhase('focus');
      setSecondsLeft(focusMin * 60);
      setStatus('idle');
      handledZeroRef.current = false;
    }
  }, [secondsLeft, status, phase, focusMin, restMin, record, remark, boundTodoId, onSave, restMin]);

  const start = () => {
    applyMode('focus');
    setStatus('running');
    sessionStartRef.current = nowHMS();
  };

  const pause = () => setStatus('paused');

  const resume = () => setStatus('running');

  const resetTimer = () => {
    setStatus('idle');
    applyMode('focus');
    setResetOpen(false);
  };

  const confirmInterrupt = () => {
    const elapsed = focusMin * 60 - secondsLeft;
    const durationMin = Math.max(1, Math.round(elapsed / 60));
    const next = completeTomatoSession(record, {
      durationMin,
      type: 'focus',
      remark,
      todoId: boundTodoId || undefined,
      interrupted: true,
      interruptReason,
    });
    onSave(next);
    setInterruptOpen(false);
    setInterruptReason('');
    setStatus('idle');
    applyMode('focus');
  };

  const statusText =
    status === 'paused'
      ? '已暂停，随时继续'
      : phase === 'focus'
        ? '保持专注，拒绝空转胡思乱想'
        : '放松身心，平稳呼吸，恢复精气神';

  const interrupted = countInterruptedTomatoes(record);

  return (
    <div className="pomodoro-section">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-[#fff8e7]/85">🍅 番茄专注｜锚定当下，止念防内耗</h3>
        <p className="text-[10px] tabular-nums text-[#7eb8d4]/75">
          今日番茄×{ft.todayTomatoCount || 0} | 专注{ft.todayFocusMin || 0}min | 休息
          {ft.todayRestMin || 0}min
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`pomo-mode-card ${modeId === m.id ? 'pomo-mode-card--active' : ''}`}
            onClick={() => {
              setModeId(m.id);
              if (status === 'idle') applyMode('focus');
            }}
          >
            <span className="block text-xs font-medium">{m.label}</span>
            <span className="block text-[10px] opacity-60">{m.sub}</span>
          </button>
        ))}
      </div>

      {mode.custom && (
        <div className="mt-3 flex gap-2">
          <label className="flex flex-1 items-center gap-1 text-xs text-[#fff8e7]/50">
            专注
            <input
              type="number"
              min={1}
              max={120}
              className="recovery-input w-16 py-1 text-center text-sm"
              value={customFocus}
              onChange={(e) => setCustomFocus(Number(e.target.value) || 1)}
            />
            分
          </label>
          <label className="flex flex-1 items-center gap-1 text-xs text-[#fff8e7]/50">
            休息
            <input
              type="number"
              min={1}
              max={120}
              className="recovery-input w-16 py-1 text-center text-sm"
              value={customRest}
              onChange={(e) => setCustomRest(Number(e.target.value) || 1)}
            />
            分
          </label>
        </div>
      )}

      <div className="pomo-timer-visual mt-5">
        <p className="pomo-timer-display tabular-nums">{formatMMSS(secondsLeft)}</p>
        <p className="mt-2 text-center text-xs text-[#fff8e7]/45">{statusText}</p>
        <p className="mt-1 text-center text-[10px] text-[#7eb8d4]/50">
          {phase === 'focus' ? '专注阶段' : '休息阶段'}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {status === 'idle' || status === 'paused' ? (
          <button
            type="button"
            className="recovery-btn-success min-w-[5rem]"
            onClick={status === 'paused' ? resume : start}
          >
            {status === 'paused' ? '继续' : '开始'}
          </button>
        ) : (
          <button type="button" className="recovery-btn-ghost min-w-[5rem]" onClick={pause}>
            暂停
          </button>
        )}
        {status === 'running' && phase === 'focus' && (
          <button
            type="button"
            className="recovery-btn-danger-outline min-w-[5rem]"
            onClick={() => setInterruptOpen(true)}
          >
            中断
          </button>
        )}
        <button type="button" className="recovery-btn-danger-outline min-w-[5rem]" onClick={() => setResetOpen(true)}>
          重置
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-[#fff8e7]/40">本次专注内容</p>
          <input
            className="recovery-input text-sm"
            placeholder="记录本次专注…"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-[#fff8e7]/40">绑定待办</p>
          <select
            className="recovery-input text-sm"
            value={boundTodoId}
            onChange={(e) => setBoundTodoId(e.target.value)}
          >
            <option value="">不绑定</option>
            {(record.todoList || [])
              .filter((t) => !t.done)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.content}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-[#fff8e7]/06 bg-black/25 p-3 text-center sm:grid-cols-5">
        <div>
          <p className="text-lg font-medium tabular-nums text-[#c9a962]">{ft.todayTomatoCount || 0}</p>
          <p className="text-[10px] text-[#fff8e7]/40">有效番茄</p>
        </div>
        <div>
          <p className="text-lg font-medium tabular-nums">{ft.todayFocusMin || 0}</p>
          <p className="text-[10px] text-[#fff8e7]/40">专注分钟</p>
        </div>
        <div>
          <p className="text-lg font-medium tabular-nums">{ft.todayRestMin || 0}</p>
          <p className="text-[10px] text-[#fff8e7]/40">休息分钟</p>
        </div>
        <div>
          <p className="text-lg font-medium tabular-nums text-[#b48a8a]">{interrupted}</p>
          <p className="text-[10px] text-[#fff8e7]/40">中断</p>
        </div>
        <div>
          <p className="text-lg font-medium tabular-nums">{tomatoCompletionRate(record)}%</p>
          <p className="text-[10px] text-[#fff8e7]/40">完成率</p>
        </div>
      </div>

      {resetOpen && (
        <div className="recovery-modal-backdrop" onClick={() => setResetOpen(false)}>
          <div className="recovery-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="recovery-modal-title">重置当前计时？</h3>
            <p className="mt-2 text-sm text-[#fff8e7]/55">仅清空当前倒计时，不影响历史番茄记录。</p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="recovery-btn-ghost" onClick={() => setResetOpen(false)}>
                取消
              </button>
              <button type="button" className="recovery-btn-danger" onClick={resetTimer}>
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}

      {interruptOpen && (
        <div className="recovery-modal-backdrop" onClick={() => setInterruptOpen(false)}>
          <div className="recovery-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="recovery-modal-title">中断本次番茄</h3>
            <p className="mt-2 text-sm text-[#fff8e7]/55">中断不计入有效番茄数，可填写原因。</p>
            <textarea
              className="recovery-textarea mt-3"
              rows={2}
              placeholder="中断原因（可选）"
              value={interruptReason}
              onChange={(e) => setInterruptReason(e.target.value)}
            />
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="recovery-btn-ghost" onClick={() => setInterruptOpen(false)}>
                取消
              </button>
              <button type="button" className="recovery-btn-danger" onClick={confirmInterrupt}>
                确认中断
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
