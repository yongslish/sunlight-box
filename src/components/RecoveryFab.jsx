import { useCallback, useState } from 'react';

/**
 * 右下角独立入口，不触碰太阳任何逻辑
 */
export function RecoveryFab({ onOpen, visible }) {
  const [phase, setPhase] = useState('idle'); // idle | burst

  const handleClick = useCallback(() => {
    if (phase !== 'idle') return;
    setPhase('burst');
    window.setTimeout(() => {
      onOpen();
      window.setTimeout(() => setPhase('idle'), 80);
    }, 520);
  }, [onOpen, phase]);

  if (!visible) return null;

  return (
    <div className="recovery-fab-wrap pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-[90]">
      {phase === 'burst' && (
        <>
          <span className="recovery-fab-ripple" aria-hidden />
          <span className="recovery-fab-ripple recovery-fab-ripple--delay" aria-hidden />
        </>
      )}
      <button
        type="button"
        aria-label="身心恢复追踪"
        onClick={handleClick}
        disabled={phase === 'burst'}
        className={`recovery-fab pointer-events-auto ${phase === 'burst' ? 'recovery-fab--burst' : ''}`}
      >
        <span className="recovery-fab-icon" aria-hidden>
          🌱
        </span>
        <span className="recovery-fab-label" aria-hidden>
          专注
        </span>
      </button>
    </div>
  );
}
