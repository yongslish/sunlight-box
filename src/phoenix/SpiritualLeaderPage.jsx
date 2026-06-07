import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './spiritual-leader.css';
import {
  addLeaderMessage,
  formatDateZh,
  getAnxietyFirstLineByDate,
  getGroupedHistory,
  getMessagesByDate,
  loadLeaderSettings,
  resolveSilentSeconds,
} from './spiritualLeaderStorage.js';

const PROMPT = '说吧，我在听。';
const FIXED_TEXT = '我听见了。\n我在未来等你。';

function useViewportScale() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 375);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth || 375);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

function buildSunElement() {
  const node = document.createElement('div');
  node.className = 'leader-portal';
  node.innerHTML = `
    <span class="leader-portal-ring leader-portal-ring--a" aria-hidden="true"></span>
    <span class="leader-portal-ring leader-portal-ring--b" aria-hidden="true"></span>
    <span class="leader-portal-core" aria-hidden="true"></span>
  `;
  return node;
}

function playSoftBell(enabled) {
  if (!enabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 432;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.03, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
  } catch {
    // ignore audio failures to keep silent experience stable
  }
}

function EnterFade() {
  return (
    <>
      <div className="leader-enter-fade" aria-hidden="true" />
      <div className="leader-entry-wormhole" aria-hidden="true">
        <span className="leader-entry-wormhole-ring leader-entry-wormhole-ring--a" />
        <span className="leader-entry-wormhole-ring leader-entry-wormhole-ring--b" />
        <span className="leader-entry-wormhole-core" />
      </div>
    </>
  );
}

export function SpiritualLeaderPage({ onExit }) {
  const settings = useMemo(() => loadLeaderSettings(), []);
  const leaderAudioRef = useRef(null);
  const audioFadeRef = useRef(null);
  const textareaRef = useRef(null);
  const sunHolderRef = useRef(null);
  const topSunPressTimerRef = useRef(null);
  const enterHoldTimerRef = useRef(null);
  const enterLongSentRef = useRef(false);
  const flowTimersRef = useRef([]);
  const exitTimerRef = useRef(null);
  const dndPrevRef = useRef(null);
  const [text, setText] = useState('');
  const [sentLines, setSentLines] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | flashing | silent | reveal | revealed | emergency
  const [showFixed, setShowFixed] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [view, setView] = useState('main'); // main | history | day
  const [historyDate, setHistoryDate] = useState('');
  const [historyItems, setHistoryItems] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [burnTip, setBurnTip] = useState('');
  const [particles, setParticles] = useState([]);
  const particleTimerRef = useRef(null);
  const viewRef = useRef('main');
  const vw = useViewportScale();

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (!sunHolderRef.current) return;
    const sun = buildSunElement();
    sunHolderRef.current.innerHTML = '';
    sunHolderRef.current.appendChild(sun);
  }, []);

  const stopAudioFade = useCallback(() => {
    if (audioFadeRef.current) {
      cancelAnimationFrame(audioFadeRef.current);
      audioFadeRef.current = null;
    }
  }, []);

  const fadeLeaderAudio = useCallback((to, ms, onDone) => {
    const audio = leaderAudioRef.current;
    if (!audio) {
      onDone?.();
      return;
    }
    stopAudioFade();
    const from = audio.volume;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      audio.volume = from + (to - from) * eased;
      if (t < 1) {
        audioFadeRef.current = requestAnimationFrame(tick);
      } else {
        audio.volume = to;
        audioFadeRef.current = null;
        onDone?.();
      }
    };
    audioFadeRef.current = requestAnimationFrame(tick);
  }, [stopAudioFade]);

  useEffect(() => {
    const audio = leaderAudioRef.current;
    if (!audio) return;
    audio.volume = 0.01;
    const unlockAndPlay = async () => {
      try {
        await audio.play();
        fadeLeaderAudio(0.35, 1800);
      } catch {
        // autoplay may fail on some environments
      }
    };
    void unlockAndPlay();
    return () => {
      stopAudioFade();
      audio.pause();
      audio.currentTime = 0;
    };
  }, [fadeLeaderAudio, stopAudioFade]);

  useEffect(() => {
    if (view !== 'main' || phase === 'emergency') return;
    if (particleTimerRef.current) window.clearInterval(particleTimerRef.current);
    particleTimerRef.current = window.setInterval(() => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const left = Math.random() * 100;
      const dur = 15000 + Math.random() * 8000;
      const delay = Math.random() * 1500;
      const opacity = 0.18 + Math.random() * 0.18;
      setParticles((prev) => [...prev.slice(-26), { id, left, dur, delay, opacity }]);
      window.setTimeout(() => {
        setParticles((prev) => prev.filter((item) => item.id !== id));
      }, dur + delay + 300);
    }, 1200);
    return () => {
      if (particleTimerRef.current) window.clearInterval(particleTimerRef.current);
    };
  }, [phase, view]);

  useEffect(() => {
    // 尝试进入免打扰（Web 端无系统 API 时降级为仅记录状态）
    try {
      const prev = window.localStorage.getItem('sunbox_dnd_prev');
      dndPrevRef.current = prev || '0';
      window.localStorage.setItem('sunbox_dnd_prev', prev || '0');
      window.localStorage.setItem('sunbox_dnd_active', '1');
    } catch {
      // ignore
    }
    return () => {
      try {
        if (dndPrevRef.current != null) {
          window.localStorage.setItem('sunbox_dnd_active', dndPrevRef.current);
        }
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || view !== 'main' || phase === 'emergency') return;
    const t = window.setTimeout(() => {
      el.focus();
    }, 80);
    return () => window.clearTimeout(t);
  }, [phase, view]);

  useEffect(() => {
    if (view !== 'history') return;
    setHistoryItems(getGroupedHistory());
  }, [view]);

  const clearFlowTimers = useCallback(() => {
    flowTimersRef.current.forEach((id) => window.clearTimeout(id));
    flowTimersRef.current = [];
  }, []);

  const queueFlowTimer = useCallback((fn, ms) => {
    const id = window.setTimeout(() => {
      flowTimersRef.current = flowTimersRef.current.filter((item) => item !== id);
      fn();
    }, ms);
    flowTimersRef.current.push(id);
    return id;
  }, []);

  const beginExit = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    fadeLeaderAudio(0.01, 900, () => {
      const audio = leaderAudioRef.current;
      if (audio) audio.pause();
    });
    if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = window.setTimeout(() => {
      onExit?.();
    }, 1000);
  }, [fadeLeaderAudio, isExiting, onExit]);

  const backInsideLeader = useCallback(() => {
    if (viewRef.current === 'day') {
      setView('history');
      return true;
    }
    if (viewRef.current === 'history') {
      setView('main');
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    window.history.pushState({ sunboxLeader: true }, '');
    const onPop = () => {
      if (backInsideLeader()) {
        window.history.pushState({ sunboxLeader: true }, '');
        return;
      }
      beginExit();
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (backInsideLeader()) return;
      beginExit();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, [backInsideLeader, beginExit]);

  useEffect(
    () => () => {
      clearFlowTimers();
      if (enterHoldTimerRef.current) window.clearTimeout(enterHoldTimerRef.current);
      if (topSunPressTimerRef.current) window.clearTimeout(topSunPressTimerRef.current);
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    },
    [clearFlowTimers]
  );

  const inputFont = `${Math.max(14, vw * 0.04)}px`;
  const hintFont = `${Math.max(12, vw * 0.035)}px`;
  const fixedFont = `${Math.max(12, vw * 0.03)}px`;

  const runSilent = useCallback((payload, mode) => {
    clearFlowTimers();
    addLeaderMessage({ text: payload, mode });
    setSentLines([payload]);
    setText('');
    setShowFixed(false);
    setPhase('flashing');
    queueFlowTimer(() => {
      if (mode === 'silent') {
        setPhase('idle');
      } else {
        const wait = resolveSilentSeconds(payload, settings.replySpeed) * 1000;
        setPhase('silent');
        queueFlowTimer(() => {
          setPhase('reveal');
          setShowFixed(true);
          playSoftBell(settings.bellEnabled);
          queueFlowTimer(() => setPhase('revealed'), 2000);
        }, wait);
      }
    }, 2000);
    queueFlowTimer(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [clearFlowTimers, queueFlowTimer, settings.bellEnabled, settings.replySpeed]);

  const triggerEmergency = () => {
    clearFlowTimers();
    addLeaderMessage({ text: '...', mode: 'emergency' });
    setSentLines([]);
    setText('');
    setShowFixed(false);
    setPhase('emergency');
    textareaRef.current?.blur();
  };

  const submitNormal = useCallback(() => {
    const payload = text.trimEnd();
    if (!payload) return;
    if (payload === '...') {
      triggerEmergency();
      return;
    }
    setSentLines([]);
    runSilent(payload, 'normal');
  }, [runSilent, text]);

  const onInputKeyDown = useCallback((e) => {
    if (e.nativeEvent?.isComposing) return;
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    if (e.repeat) return;

    enterLongSentRef.current = false;
    if (enterHoldTimerRef.current) window.clearTimeout(enterHoldTimerRef.current);
    enterHoldTimerRef.current = window.setTimeout(() => {
      const payload = text.trimEnd();
      if (!payload) return;
      if (payload === '...') {
        triggerEmergency();
      } else {
        setSentLines([]);
        runSilent(payload, 'silent');
      }
      enterLongSentRef.current = true;
    }, 1000);
  }, [runSilent, text]);

  const onInputKeyUp = useCallback((e) => {
    if (e.nativeEvent?.isComposing) return;
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (enterHoldTimerRef.current) {
      window.clearTimeout(enterHoldTimerRef.current);
      enterHoldTimerRef.current = null;
    }
    if (!enterLongSentRef.current) {
      submitNormal();
    }
  }, [submitNormal]);

  const startHistoryLongPress = () => {
    if (topSunPressTimerRef.current) window.clearTimeout(topSunPressTimerRef.current);
    topSunPressTimerRef.current = window.setTimeout(() => {
      setView('history');
    }, 3000);
  };

  const stopHistoryLongPress = () => {
    if (topSunPressTimerRef.current) {
      window.clearTimeout(topSunPressTimerRef.current);
      topSunPressTimerRef.current = null;
    }
  };

  const openDay = (dateKey) => {
    setHistoryDate(dateKey);
    setView('day');
  };

  const dailyContent = useMemo(() => {
    if (!historyDate) return [];
    const lines = [];
    if (settings.anxietySyncEnabled) {
      const anxiety = getAnxietyFirstLineByDate(historyDate);
      if (anxiety) lines.push({ id: `a-${historyDate}`, text: anxiety, source: 'anxiety' });
    }
    const leader = getMessagesByDate(historyDate).map((item) => ({
      id: item.id,
      text: item.text,
      source: 'leader',
      mode: item.mode || 'normal',
    }));
    return [...lines, ...leader];
  }, [historyDate, settings.anxietySyncEnabled]);

  const displayDailyContent = useMemo(() => {
    return dailyContent.filter((row) => {
      if (row.source !== 'leader') return true;
      return String(row.text || '').trim() !== '...';
    });
  }, [dailyContent]);

  const burnAll = async () => {
    setIsDeleting(true);
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
    setIsDeleting(false);
    setBurnTip('已封存为仪式特效，记录仍保留');
    window.setTimeout(() => setBurnTip(''), 2200);
  };

  return (
    <div className={`leader-root ${phase === 'emergency' ? 'is-emergency' : ''}`}>
      <video
        className="leader-bg-video"
        src="/audio/leader-theme.mp3"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
      <audio ref={leaderAudioRef} src="/audio/leader-theme.mp3" preload="auto" loop />
      <div
        className={`leader-bgm-aura ${settings.breathingEnabled ? 'is-breathing' : ''}`}
        aria-hidden="true"
      />
      <div className="leader-particle-layer" aria-hidden="true">
        {particles.map((p) => (
          <span
            key={p.id}
            className="leader-particle"
            style={{
              left: `${p.left}%`,
              animationDuration: `${p.dur}ms`,
              animationDelay: `${p.delay}ms`,
              opacity: p.opacity,
            }}
          />
        ))}
      </div>
      <EnterFade />
      <div className="leader-top">
        <button
          type="button"
          className="leader-history-hit"
          onPointerDown={startHistoryLongPress}
          onPointerUp={stopHistoryLongPress}
          onPointerLeave={stopHistoryLongPress}
          onPointerCancel={stopHistoryLongPress}
          aria-label="历史入口"
        />
        {view === 'main' && (
          <button
            type="button"
            className="leader-history-btn-visible"
            title="历史记录"
            onClick={() => { if (view === 'history') setView('main'); else setView('history'); }}
            aria-label="历史记录"
          >
            📋
          </button>
        )}
        <div
          className={`leader-top-sun ${phase === 'flashing' ? 'is-flashing' : ''}`}
          ref={sunHolderRef}
          style={{ visibility: phase === 'emergency' ? 'hidden' : 'visible' }}
          aria-hidden={view !== 'main'}
        />
      </div>

      {view === 'main' && phase !== 'emergency' && (
        <>
          <div className={`leader-dialog ${showFixed ? 'is-muted' : ''}`}>
            {sentLines.map((line, idx) => (
              <p key={`${line}-${idx}`} className="leader-line" style={{ fontSize: inputFont }}>
                {line}
              </p>
            ))}
          </div>
          <div className={`leader-reveal ${showFixed ? 'is-visible' : ''}`}>
            <div className="leader-silhouette" />
            <p className="leader-fixed" style={{ fontSize: fixedFont }}>
              {FIXED_TEXT}
            </p>
            <div className="leader-core-slogan">
              <p>Even in the dark, you can heal my scars</p>
              <p>纵陷至暗，自愈伤痕</p>
            </div>
          </div>
          <button
            type="button"
            className="leader-center-history-hit"
            onPointerDown={startHistoryLongPress}
            onPointerUp={stopHistoryLongPress}
            onPointerLeave={stopHistoryLongPress}
            onPointerCancel={stopHistoryLongPress}
            aria-label="历史入口"
          />
          <div className="leader-input-wrap">
            <textarea
              ref={textareaRef}
              className="leader-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onInputKeyDown}
              onKeyUp={onInputKeyUp}
              placeholder={PROMPT}
              style={{
                fontSize: inputFont,
                lineHeight: 1.5,
              }}
            />
            {!text && (
              <p className="leader-hint" style={{ fontSize: hintFont }}>
                {PROMPT}
              </p>
            )}
          </div>
        </>
      )}

      {phase === 'emergency' && (
        <div
          className={`leader-emergency ${
            settings.breathingEnabled ? 'leader-emergency-breathe' : ''
          }`}
        />
      )}

      {view === 'history' && (
        <div className="leader-history">
          <div className="leader-nav">
            <button type="button" className="leader-nav-back" onClick={() => setView('main')}>
              返回对话
            </button>
          </div>
          <div className="leader-history-list">
            {historyItems.length === 0 && !isDeleting ? (
              <p className="leader-empty">所有心事，皆已释然</p>
            ) : (
              historyItems.map((item) => (
                <button
                  key={item.date}
                  type="button"
                  className={`leader-history-item ${isDeleting ? 'is-smoking' : ''}`}
                  onClick={() => openDay(item.date)}
                >
                  {formatDateZh(item.date)} {item.preview}
                </button>
              ))
            )}
          </div>
          <button type="button" className="leader-burn" onClick={burnAll} aria-label="删除全部">
            <span className="leader-burn-icon">🔥</span>
          </button>
          {burnTip ? <p className="leader-burn-tip">{burnTip}</p> : null}
        </div>
      )}

      {view === 'day' && (
        <div className="leader-day">
          <div className="leader-day-header">
            <button type="button" className="leader-nav-back" onClick={() => setView('history')}>
              返回日期列表
            </button>
            <span>{formatDateZh(historyDate)}</span>
          </div>
          <div className="leader-day-list">
            {displayDailyContent.map((row, idx) => (
              <div key={row.id} className="leader-day-entry">
                {idx > 0 ? <p className="leader-day-divider">...</p> : null}
                <p className="leader-day-line">{row.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className="leader-exit-hit"
        onPointerDown={beginExit}
        aria-label="退出精神领袖"
      />

      {isExiting && <div className="leader-exit-fade" aria-hidden="true" />}
    </div>
  );
}
