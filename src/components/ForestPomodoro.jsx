import { useCallback, useEffect, useRef, useState } from 'react';
import { completeTomatoSession } from '../utils/focusBreathStorage.js';
import {
  clearActivePomo,
  saveActivePomo,
  secondsUntil,
} from '../utils/timerStorage.js';

// ====== 白噪音：真实音频文件 ======
const WHITE_NOISES = [
  { id: 'rain', label: '龙猫森林雨', emoji: '🌧️', src: '/media/totoro-rain.mp3' },
  { id: 'none', label: '关闭', emoji: '🔇', src: null },
];

const MODES = [
  { id: 'deep',   label: '深度专注', sub: '25+5',  focus: 25, rest: 5 },
  { id: 'long',   label: '长时专注', sub: '45+10', focus: 45, rest: 10 },
  { id: 'sprint', label: '短时冲刺', sub: '15+3',  focus: 15, rest: 3 },
  { id: 'custom', label: '自定义',   sub: '自定',  focus: 25, rest: 5, custom: true },
];

// ====== 提示音：Web Audio 和弦 ======
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * 0.12 + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.12 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.65);
    });
  } catch { /* 静默 */ }
}

// ====== 工具函数 ======
function pad(n) { return String(n).padStart(2, '0'); }
function formatMMSS(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${pad(m)}:${pad(s)}`;
}
function getModeConfig(modeId, customFocus, customRest) {
  const m = MODES.find((x) => x.id === modeId) || MODES[0];
  return {
    ...m,
    focusMin: m.custom ? customFocus : m.focus,
    restMin: m.custom ? customRest : m.rest,
  };
}

// ====== 绿树颜色表 ======
const GP = {
  soil: '#7B5B3A', soilH: '#9B7B5A', seedCoat: '#5D4037',
  sprout: '#6ee7b7', sapling: '#4ade80', growing: '#22c55e',
  mature: '#16a34a', deep: '#15803d',
  trunkY: '#C4A87C', trunkM: '#A0865A', trunkO: '#6B5035',
  hi: '#a3e635', shadow: '#065f46',
};

const LEAF_OFFSETS = Array.from({ length: 36 }, (_, i) => ({
  angle: (i * 137.5) * Math.PI / 180,
  dist: 0.55 + (i % 5) * 0.11,
  rx: 3.5 + (i % 3) * 1.5,
  ry: 6 + (i % 4) * 2,
  rot: (i * 27) % 360,
}));

// 果实位置预设
const FRUIT_POSITIONS = [
  { x: 38, y: 60 }, { x: 78, y: 58 }, { x: 52, y: 45 },
  { x: 70, y: 48 }, { x: 44, y: 72 }, { x: 80, y: 70 },
];

// ====== SVG 树图 ======
function TreeSVG({ progress, phase, isDone }) {
  const p = Math.max(0, Math.min(1, progress));
  const showFruits = phase === 'rest' || isDone;

  const trunkH = Math.max(0, (p - 0.04) / 0.96) * 70;
  const trunkW = 3 + p * 9;
  const canopyR = p < 0.06 ? 2 : 4 + p * 38;
  const canopyLayers = p < 0.2 ? 1 : p < 0.42 ? 2 : p < 0.7 ? 3 : 4;
  const leafCount = p < 0.2 ? 0 : p < 0.42 ? 4 : p < 0.7 ? 12 : p < 0.95 ? 24 : 36;

  const trunkColor = p < 0.3 ? GP.trunkY : p < 0.7 ? GP.trunkM : GP.trunkO;
  const baseGreen = p < 0.2 ? GP.sprout : p < 0.42 ? GP.sapling : p < 0.7 ? GP.growing : GP.mature;

  const isSeed = p < 0.06;
  const isSprout = p >= 0.06 && p < 0.2;
  const stageLabel = isSeed ? '种子' : isSprout ? '发芽🌱' :
    p < 0.42 ? '幼苗' : p < 0.7 ? '小树茁壮' : p < 0.95 ? '枝繁叶茂' :
    (showFruits ? '硕果累累🍎' : '完成！🌳');

  return (
    <div className="forest-tree-wrap">
      <svg viewBox="0 0 120 160" className="forest-tree-svg" style={{ filter: 'drop-shadow(0 0 8px rgba(34,197,94,0.15))' }}>
        <ellipse cx={60} cy={148} rx={52} ry={6} fill={GP.soil} opacity={0.5} />
        <ellipse cx={60} cy={147} rx={44} ry={4} fill={GP.soilH} opacity={0.3} />

        {isSeed && (
          <>
            <ellipse cx={60} cy={148} rx={14} ry={5} fill={GP.soil} opacity={0.7} style={{ transition: 'all 1s ease' }} />
            <ellipse cx={60} cy={143} rx={4} ry={5.5} fill={GP.seedCoat} style={{ transition: 'all 1s ease' }} />
            <circle cx={60} cy={139} r={1.5} fill="#a7f3d0">
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="3s" repeatCount="indefinite" />
            </circle>
          </>
        )}

        {isSprout && (
          <>
            <path d={`M60,148 Q60,130 58,${148 - trunkH}`} stroke={GP.sprout} strokeWidth={2.5}
              fill="none" strokeLinecap="round"
              style={{ transition: 'all 1.2s ease', filter: 'drop-shadow(0 0 3px rgba(110,231,183,0.4))' }} />
            <ellipse cx={57} cy={148 - trunkH - 3} rx={3.5} ry={5} fill={GP.sprout}
              transform={`rotate(-15, 57, ${148 - trunkH - 3})`} style={{ transition: 'all 1.2s ease' }} />
            <ellipse cx={62} cy={148 - trunkH - 5} rx={3} ry={4.5} fill={GP.sapling}
              transform={`rotate(10, 62, ${148 - trunkH - 5})`} style={{ transition: 'all 1.2s ease' }} />
          </>
        )}

        {trunkH > 8 && (
          <rect x={60 - trunkW / 2} y={148 - trunkH} width={trunkW} height={trunkH}
            rx={trunkW / 2} fill={trunkColor} style={{ transition: 'all 1.5s ease' }} />
        )}

        {/* 树冠 */}
        {canopyLayers >= 1 && Array.from({ length: canopyLayers }, (_, i) => {
          const cx = 60 + (i % 2 === 0 ? -4 : 4) * (1 + i * 0.3);
          const cy = 148 - trunkH - canopyR * 0.2 - i * canopyR * 0.35;
          const r = canopyR * (1 - i * 0.18);
          const isShadow = i === canopyLayers - 1;
          const color = isShadow ? GP.shadow : i === 0 ? GP.hi : i % 2 === 0 ? baseGreen : GP.deep;
          return (
            <circle key={`c-${i}`} cx={cx} cy={cy} r={r}
              fill={color} opacity={isShadow ? 0.3 : 0.75 - i * 0.15}
              style={{ transition: 'all 1.5s ease' }} />
          );
        })}

        {/* 叶子 */}
        {Array.from({ length: leafCount }, (_, i) => {
          const off = LEAF_OFFSETS[i];
          const cx = 60 + Math.cos(off.angle) * canopyR * off.dist;
          const cy = (148 - trunkH - canopyR * 0.35) + Math.sin(off.angle) * canopyR * off.dist;
          const isHi = i < leafCount / 3;
          const color = isHi ? GP.hi : i % 3 === 0 ? GP.mature : i % 3 === 1 ? GP.growing : baseGreen;
          return (
            <ellipse key={`l-${i}`} cx={cx} cy={cy} rx={off.rx} ry={off.ry}
              fill={color} opacity={isHi ? 0.8 : 0.55}
              transform={`rotate(${off.rot}, ${cx}, ${cy})`}
              style={{ transition: 'all 2s ease' }} />
          );
        })}

        {/* 果实 — 休息阶段或完成时显示 */}
        {showFruits && FRUIT_POSITIONS.map((f, i) => (
          <g key={`fruit-${i}`}>
            <circle cx={f.x} cy={f.y} r={5} fill="#ef4444" opacity={0.85}
              style={{ transition: 'all 1s ease' }}>
              <animate attributeName="opacity" values="0.7;1;0.7" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
            </circle>
            <circle cx={f.x - 1.5} cy={f.y - 1.5} r={1.5} fill="#fca5a5" opacity={0.6}>
              <animate attributeName="opacity" values="0.4;0.8;0.4" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
            </circle>
          </g>
        ))}
      </svg>
      <p className="forest-tree-label">{stageLabel}</p>
    </div>
  );
}

// ====== 白噪音选择器 ======
function WhiteNoiseSelector({ active, onChange }) {
  return (
    <div className="forest-noise-bar">
      {WHITE_NOISES.map(n => (
        <button key={n.id} type="button"
          className={`forest-noise-btn ${active === n.id ? 'forest-noise-btn--active' : ''}`}
          onClick={() => onChange(n.id)} title={n.label}>{n.emoji}</button>
      ))}
    </div>
  );
}

// ====== 主组件 ======
export function ForestPomodoro({ record, onSave }) {
  const ft = record.focusTimer || {};
  const [modeId, setModeId] = useState('deep');
  const [customFocus, setCustomFocus] = useState(25);
  const [customRest, setCustomRest] = useState(5);
  const [phase, setPhase] = useState('focus');
  const [status, setStatus] = useState('idle');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [remark, setRemark] = useState(ft.pendingRemark || '');
  const [noiseId, setNoiseId] = useState('none');
  const [isDone, setIsDone] = useState(false); // 本轮专注已完成

  const recordRef = useRef(record);
  const onSaveRef = useRef(onSave);
  const endAtRef = useRef(null);
  const statusRef = useRef('idle');
  const phaseRef = useRef('focus');
  const modeIdRef = useRef('deep');
  const customFocusRef = useRef(25);
  const customRestRef = useRef(5);
  const remarkRef = useRef('');
  const audioRef = useRef(null);

  recordRef.current = record;
  onSaveRef.current = onSave;
  statusRef.current = status;
  phaseRef.current = phase;
  modeIdRef.current = modeId;
  customFocusRef.current = customFocus;
  customRestRef.current = customRest;
  remarkRef.current = remark;

  const mode = getModeConfig(modeId, customFocus, customRest);
  const totalPhaseSec = phase === 'focus' ? mode.focusMin * 60 : mode.restMin * 60;
  // 休息阶段显示完成态，专注阶段随进度成长
  const displayProgress = phase === 'rest' ? 1 : (totalPhaseSec > 0 ? 1 - secondsLeft / totalPhaseSec : 0);

  useEffect(() => {
    setRemark(record.focusTimer?.pendingRemark || '');
  }, [record.date]);

  // 防抖保存 remark
  useEffect(() => {
    const t = window.setTimeout(() => {
      const current = recordRef.current.focusTimer?.pendingRemark ?? '';
      if (remark === current) return;
      onSaveRef.current({
        ...recordRef.current,
        focusTimer: { ...recordRef.current.focusTimer, pendingRemark: remark },
      });
    }, 500);
    return () => clearTimeout(t);
  }, [remark]);

  // ====== 白噪音 ======
  const playNoise = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    const noise = WHITE_NOISES.find(n => n.id === 'rain');
    if (!noise?.src) return;
    const audio = new Audio(noise.src);
    audio.loop = true;
    audio.volume = 0.45;
    audioRef.current = audio;
    audio.play().catch(() => {});
  }, []);

  const stopNoise = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopNoise();
  }, [stopNoise]);

  // ====== 番茄倒计时 ======
  const tick = useCallback(() => {
    if (statusRef.current !== 'running' || !endAtRef.current) return;
    const left = secondsUntil(endAtRef.current);
    setSecondsLeft(left);
    if (left <= 0) {
      const endedPhase = phaseRef.current;
      const mc = getModeConfig(modeIdRef.current, customFocusRef.current, customRestRef.current);

      // 提示音
      playNotificationSound();

      if (endedPhase === 'focus') {
        // 专注结束 → 保存记录 → 进入休息
        const next = completeTomatoSession(recordRef.current, {
          durationMin: mc.focusMin,
          durationSec: mc.focusMin * 60,
          type: 'focus',
          remark: remarkRef.current,
          startTime: new Date(Date.now() - mc.focusMin * 60000).toTimeString().slice(0, 8),
          endTime: new Date().toTimeString().slice(0, 8),
        });
        onSaveRef.current(next);
        recordRef.current = next;

        setPhase('rest');
        phaseRef.current = 'rest';
        const restSec = mc.restMin * 60;
        setSecondsLeft(restSec);
        endAtRef.current = Date.now() + restSec * 1000;
        saveActivePomo({ modeId: modeIdRef.current, phase: 'rest', endAt: endAtRef.current });
      } else {
        // 休息结束 → 停止计时，等待用户手动开启下一轮
        setIsDone(true);
        setStatus('idle');
        statusRef.current = 'idle';
        setNoiseId('none');
        clearActivePomo();
      }
    }
  }, []);

  useEffect(() => {
    if (status !== 'running') return undefined;
    tick();
    const id = setInterval(tick, 500);
    const onVis = () => tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [status, tick]);

  const start = () => {
    const sec = phase === 'focus' ? mode.focusMin * 60 : mode.restMin * 60;
    setSecondsLeft(sec);
    endAtRef.current = Date.now() + sec * 1000;
    statusRef.current = 'running';
    setStatus('running');
    setIsDone(false);
    setNoiseId('rain'); // 标记 UI 状态
    playNoise(); // 在点击事件中直接播放，避免浏览器拦截
    saveActivePomo({ modeId, phase, endAt: endAtRef.current });
  };

  const pause = () => {
    statusRef.current = 'idle';
    setStatus('idle');
    setNoiseId('none');
    stopNoise();
    clearActivePomo();
  };

  const reset = () => {
    pause();
    setPhase('focus');
    phaseRef.current = 'focus';
    setSecondsLeft(mode.focusMin * 60);
    setIsDone(false);
  };

  // 本轮专注已完成，用户可点击开始下一轮（从种子重新开始）
  const startNext = () => {
    reset();
    const sec = mode.focusMin * 60;
    setSecondsLeft(sec);
    endAtRef.current = Date.now() + sec * 1000;
    statusRef.current = 'running';
    setStatus('running');
    setNoiseId('rain');
    playNoise();
    saveActivePomo({ modeId, phase: 'focus', endAt: endAtRef.current });
  };

  // 树木棵树 = 累计专注分钟 / 25
  const treeCount = (ft.todayFocusMin || 0) / 25;
  const treeDisplay = treeCount >= 0.1 ? treeCount.toFixed(1) : '0';

  return (
    <div className="forest-pomodoro">
      {/* 模式选择 */}
      <div className="forest-mode-tabs">
        {MODES.map(m => (
          <button key={m.id} type="button"
            className={`forest-mode-tab ${modeId === m.id ? 'forest-mode-tab--active' : ''}`}
            onClick={() => { setModeId(m.id); reset(); }}
            disabled={status === 'running'}>
            <span className="forest-mode-label">{m.label}</span>
            <span className="forest-mode-sub">{m.sub}</span>
          </button>
        ))}
      </div>

      {mode.custom && (
        <div className="forest-custom-inputs">
          <label>专注 <input type="number" min={1} max={120} value={customFocus}
            onChange={e => setCustomFocus(Number(e.target.value))} disabled={status === 'running'} /> 分钟</label>
          <label>休息 <input type="number" min={1} max={30} value={customRest}
            onChange={e => setCustomRest(Number(e.target.value))} disabled={status === 'running'} /> 分钟</label>
        </div>
      )}

      {/* 树木 */}
      <div className="forest-tree-area">
        <TreeSVG progress={displayProgress} phase={phase} isDone={isDone} />
      </div>

      {/* 倒计时 */}
      <div className="forest-timer-display">
        <span className={`forest-phase-badge forest-phase-badge--${phase}`}>
          {isDone ? '已完成' : phase === 'focus' ? '专注' : '休息'}
        </span>
        <span className="forest-timer-text">{formatMMSS(secondsLeft)}</span>
      </div>

      {/* 控制 */}
      <div className="forest-controls">
        {isDone ? (
          <button type="button" className="forest-ctrl-btn forest-ctrl-btn--primary"
            onClick={startNext}>
            🌱 再来一棵
          </button>
        ) : (
          <button type="button"
            className={`forest-ctrl-btn forest-ctrl-btn--primary ${status === 'running' ? 'forest-ctrl-btn--pause' : ''}`}
            onClick={() => status === 'running' ? pause() : start()}>
            {status === 'running' ? '⏸ 暂停' : '▶ 开始'}
          </button>
        )}
        <button type="button" className="forest-ctrl-btn forest-ctrl-btn--ghost"
          onClick={reset} disabled={status === 'running'}>
          ↺ 重置
        </button>
      </div>

      {/* 备注 */}
      <input className="forest-remark-input" placeholder="在专注什么？记录一下…"
        value={remark} onChange={e => setRemark(e.target.value)} />

      {/* 白噪音 — 运行时自动播放，暂停/复位/完成后自动静音 */}
      <div className="forest-noise-section">
        <p className="forest-noise-label">
          {noiseId !== 'none' ? '🔊 白噪音播放中' : '🔇 白噪音已暂停'}
        </p>
      </div>

      {/* 统计 — 🌳 树 而非 🍅 */}
      <div className="forest-stats">
        <span>🌳 今日 {treeDisplay} 棵</span>
        <span>⏱ 累计 {(ft.todayFocusMin || 0)} 分钟</span>
      </div>
    </div>
  );
}
