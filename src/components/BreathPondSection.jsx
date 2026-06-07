import { useEffect, useRef, useState } from 'react';
import {
  completeBreathRound,
  formatBreathDuration,
  startBreathSession,
} from '../utils/focusBreathStorage.js';

const SPEEDS = {
  slow: { inhale: 6, hold: 3, exhale: 8, label: '慢' },
  normal: { inhale: 4, hold: 2, exhale: 6, label: '标准' },
  fast: { inhale: 3, hold: 1, exhale: 4, label: '快' },
};

const PHASE_TEXT = {
  inhale: '跟着圆圈深呼吸',
  hold: '稳住气息，感受平静',
  exhale: '继续深~呼吸，放空大脑',
  holdEmpty: '自然停顿，准备下次吸气',
};

/** 呼气末 1，吸气/屏息末 2（约 2 倍半径） */
const SCALE_MIN = 1;
const SCALE_MAX = 2;

export function BreathPondSection({ record, onSave }) {
  const bt = record.breathTrain || {};
  const [speed, setSpeed] = useState('normal');
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('inhale');
  const [displayRound, setDisplayRound] = useState(1);
  const recordRef = useRef(record);
  const onSaveRef = useRef(onSave);
  const sessionOkRef = useRef(false);
  const runningRef = useRef(false);

  recordRef.current = record;
  onSaveRef.current = onSave;
  runningRef.current = running;

  const cfg = SPEEDS[speed];
  const phaseDur =
    phase === 'inhale'
      ? cfg.inhale
      : phase === 'hold' || phase === 'holdEmpty'
        ? cfg.hold
        : cfg.exhale;

  const circleScale = !running
    ? SCALE_MIN
    : phase === 'inhale' || phase === 'hold'
      ? SCALE_MAX
      : SCALE_MIN;

  useEffect(() => {
    if (!running) return undefined;

    if (!sessionOkRef.current) {
      sessionOkRef.current = true;
      onSaveRef.current(startBreathSession(recordRef.current, speed));
    }

    const timer = window.setTimeout(() => {
      if (!runningRef.current) return;
      if (phase === 'inhale') {
        setPhase('hold');
      } else if (phase === 'hold') {
        setPhase('exhale');
      } else if (phase === 'exhale') {
        setPhase('holdEmpty');
      } else if (phase === 'holdEmpty') {
        const cycleSec = cfg.inhale + cfg.hold + cfg.exhale + cfg.hold;
        const next = completeBreathRound(recordRef.current, {
          breathSpeed: speed,
          roundDurationSec: cycleSec,
        });
        onSaveRef.current(next);
        recordRef.current = next;
        setDisplayRound((r) => r + 1);
        setPhase('inhale');
      }
    }, phaseDur * 1000);

    return () => clearTimeout(timer);
  }, [running, phase, speed, cfg, phaseDur]);

  const reset = () => {
    setRunning(false);
    setDisplayRound(1);
    setPhase('inhale');
    sessionOkRef.current = false;
  };

  return (
    <section className="breath-pond">
      <div className="breath-pond-content">
        <p className="breath-guide-text">
          {running ? PHASE_TEXT[phase] : PHASE_TEXT.inhale}
        </p>

        <div className="breath-circle-wrap">
          <span
            className="breath-ripple"
            style={{
              '--breath-scale': circleScale * 1.1,
              '--breath-dur': `${phaseDur}s`,
            }}
            aria-hidden
          />
          <span
            className="breath-circle"
            style={{
              '--breath-scale': circleScale,
              '--breath-dur': `${phaseDur}s`,
            }}
          />
        </div>

        <div className="breath-controls">
          <button type="button" className="breath-play-btn" onClick={() => setRunning((r) => !r)}>
            {running ? '❚❚' : '▶'}
          </button>
          <div className="breath-speed-tabs">
            {Object.entries(SPEEDS).map(([key, v]) => (
              <button
                key={key}
                type="button"
                className={`breath-speed-tab ${speed === key ? 'breath-speed-tab--active' : ''}`}
                onClick={() => setSpeed(key)}
                disabled={running}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="breath-stats">
            本轮第 {displayRound} 轮 · 今日累计 {bt.todayBreathRound || 0} 轮 · 今日呼吸{' '}
            {formatBreathDuration(bt.todayBreathSec)}
          </p>
          <button type="button" className="breath-reset-link" onClick={reset}>
            重置轮次
          </button>
        </div>
      </div>
    </section>
  );
}
