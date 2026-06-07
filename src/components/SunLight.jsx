import { useCallback, useEffect, useRef, useState } from 'react';
import { playLightSound } from '../utils/audio.js';
import { playWhisperChime } from '../utils/whisperAudio.js';
import { pickRandomQuote } from '../data/whisperQuotes.js';
import { loadLeaderSettings } from '../phoenix/spiritualLeaderStorage.js';

const STORAGE_KEY = 'sunbox_anxiety_handoff';

/** 三连击 Sun Whisper：1 秒内 3 次轻触 */
const TAP_MAX_MS = 250;
const WHISPER_TAP_COUNT = 3;
const LEADER_TAP_COUNT = 5;
const WHISPER_TAP_WINDOW_MS = 1000;
const TAP_DECIDE_IDLE_MS = 280;
/** 按住超过此时间才进入日食，避免轻触误触 */
const ECLIPSE_ARM_MS = 220;

/** Sun Whisper 过渡：金环 → 爆发 → 溶入暗场 */
const WHISPER_RING_MS = 300;
const WHISPER_BLOOM_MS = 420;
const WHISPER_DISSOLVE_MS = 550;
const WHISPER_TOTAL_MS =
  WHISPER_RING_MS + WHISPER_BLOOM_MS + WHISPER_DISSOLVE_MS;
const LEADER_VORTEX_MS = 2400;

const GOLD = '#FFD166';

const ECLIPSE_MS = 3000;
const MESSAGE_STAY_MS = 5000;

/** 满 3 秒后自动播放的「光芒万丈」段（无需松手） */
const RAD_EXPLODE_MS = 320;
const RAD_BEAM_MS = 720;
const RAD_PEAK_MS = 480;
const RAD_FADE_MS = 720;
const RADIANCE_TOTAL_MS =
  RAD_EXPLODE_MS + RAD_BEAM_MS + RAD_PEAK_MS + RAD_FADE_MS;

/** 含日冕外沿，需足够大才能看清等离子纹理 */
const SUN = 480;

const BG_DARK = '#060e1a';
const BG_LIGHT = '#0d1a2d';

/** 非均匀细条，打破「只有一个软圆斑」的感觉 */
const SCATTER_CONIC_A =
  'repeating-conic-gradient(from 0deg at 50% 50%, transparent 0deg 1.6deg, rgba(255,255,255,0.92) 1.6deg 2.15deg, transparent 2.15deg 4.9deg, rgba(255,224,150,0.78) 4.9deg 5.45deg, transparent 5.45deg 8.2deg, rgba(255,255,255,0.55) 8.2deg 8.65deg, transparent 8.65deg 13deg, rgba(255,245,210,0.7) 13deg 13.75deg, transparent 13.75deg 20deg, rgba(255,255,255,0.42) 20deg 20.45deg, transparent 20.45deg 28deg)';

const SCATTER_CONIC_B =
  'repeating-conic-gradient(from 19deg at 50% 50%, transparent 0deg 2.4deg, rgba(255,255,255,0.65) 2.4deg 2.85deg, transparent 2.85deg 7.1deg, rgba(255,209,102,0.55) 7.1deg 7.5deg, transparent 7.5deg 11deg, rgba(255,255,255,0.48) 11deg 11.35deg, transparent 11.35deg 18deg)';

/** 锥心略偏，避免所有射线共心成一个「圆盘」 */
const SCATTER_CONIC_C =
  'repeating-conic-gradient(from 203deg at 58% 44%, transparent 0deg 2.1deg, rgba(255,255,255,0.7) 2.1deg 2.55deg, transparent 2.55deg 6.4deg, rgba(255,236,180,0.62) 6.4deg 6.95deg, transparent 6.95deg 11deg, rgba(255,255,255,0.4) 11deg 11.5deg, transparent 11.5deg 17deg)';

/** 更长、更稀的条，让光「刺」出屏幕四角 */
const SCATTER_CONIC_D =
  'repeating-conic-gradient(from 71deg at 44% 56%, transparent 0deg 5deg, rgba(255,255,255,0.55) 5deg 5.55deg, transparent 5.55deg 14deg, rgba(255,220,140,0.4) 14deg 14.65deg, transparent 14.65deg 26deg, rgba(255,255,255,0.35) 26deg 26.5deg, transparent 26.5deg 38deg)';

function bezierFactory(mX1, mY1, mX2, mY2) {
  const ax = 3 * mX1 - 3 * mX2 + 1;
  const bx = 3 * mX2 - 6 * mX1;
  const cx = 3 * mX1;
  const ay = 3 * mY1 - 3 * mY2 + 1;
  const by = 3 * mY2 - 6 * mY1;
  const cy = 3 * mY1;

  function sampleCurveX(t) {
    return ((ax * t + bx) * t + cx) * t;
  }
  function sampleCurveY(t) {
    return ((ay * t + by) * t + cy) * t;
  }
  function sampleDerivativeX(t) {
    return (3 * ax * t + 2 * bx) * t + cx;
  }
  function solveCurveX(x) {
    let t2 = x;
    for (let i = 0; i < 8; i++) {
      const x2 = sampleCurveX(t2) - x;
      if (Math.abs(x2) < 1e-6) return t2;
      const d2 = sampleDerivativeX(t2);
      if (Math.abs(d2) < 1e-6) break;
      t2 -= x2 / d2;
    }
    let t0 = 0;
    let t1 = 1;
    t2 = x;
    for (let i = 0; i < 8; i++) {
      const x2 = sampleCurveX(t2);
      if (Math.abs(x2 - x) < 1e-6) return t2;
      if (x > x2) t0 = t2;
      else t1 = t2;
      t2 = (t1 + t0) / 2;
    }
    return t2;
  }
  return function ease(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleCurveY(solveCurveX(t));
  };
}

const easeReveal = bezierFactory(0.4, 0, 0.2, 1);
const easeBurst = bezierFactory(0, 0, 0.2, 1);
const easeFade = bezierFactory(0.4, 0, 1, 1);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16);
  const b = parseInt(c2.slice(1), 16);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

function saveHandoffTimestamp() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ timestamp: Math.floor(Date.now() / 1000) })
    );
  } catch {
    /* ignore */
  }
}

/**
 * idle      初始
 * eclipsing 按住：3s 内对称渐亮（整颗太阳上的压暗层揭开）+ 天亮
 * radiating 满 3s 自动：全屏散射光 + 白闪（无月亮、无全屏圆图）
 * post      爆发结束：文案 + 复位
 */
function inLeaderWindow(now = new Date()) {
  const hour = now.getHours();
  return hour >= 22 || hour < 5;
}

function inNinePmWindow(now = new Date()) {
  return now.getHours() === 21;
}

export function SunLight({ onWhisperEnter, onLeaderEnter }) {
  const [phase, setPhase] = useState('idle');
  const [revealLinear, setRevealLinear] = useState(0);
  const [radTick, setRadTick] = useState(0);
  const [whisperTick, setWhisperTick] = useState(0);
  const [leaderTick, setLeaderTick] = useState(0);
  const [messages, setMessages] = useState(false);

  const pressStartRef = useRef(null);
  const rafEclipseRef = useRef(null);
  const radStartRef = useRef(null);
  const rafRadRef = useRef(null);
  const whisperStartRef = useRef(null);
  const rafWhisperRef = useRef(null);
  const leaderStartRef = useRef(null);
  const rafLeaderRef = useRef(null);
  const radianceStartedRef = useRef(false);
  const lockedRef = useRef(false);
  const timersRef = useRef([]);
  const eclipseArmTimerRef = useRef(null);
  const tapTimesRef = useRef([]);
  const tapDecideTimerRef = useRef(null);
  const lastQuoteRef = useRef(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (eclipseArmTimerRef.current) {
      clearTimeout(eclipseArmTimerRef.current);
      eclipseArmTimerRef.current = null;
    }
    if (tapDecideTimerRef.current) {
      clearTimeout(tapDecideTimerRef.current);
      tapDecideTimerRef.current = null;
    }
  }, []);

  const stopWhisperLoop = useCallback(() => {
    if (rafWhisperRef.current) {
      cancelAnimationFrame(rafWhisperRef.current);
      rafWhisperRef.current = null;
    }
    whisperStartRef.current = null;
  }, []);

  const stopEclipseLoop = useCallback(() => {
    if (rafEclipseRef.current) {
      cancelAnimationFrame(rafEclipseRef.current);
      rafEclipseRef.current = null;
    }
  }, []);

  const stopLeaderLoop = useCallback(() => {
    if (rafLeaderRef.current) {
      cancelAnimationFrame(rafLeaderRef.current);
      rafLeaderRef.current = null;
    }
    leaderStartRef.current = null;
  }, []);

  const stopRadLoop = useCallback(() => {
    if (rafRadRef.current) {
      cancelAnimationFrame(rafRadRef.current);
      rafRadRef.current = null;
    }
    radStartRef.current = null;
  }, []);

  const resetToIdle = useCallback(() => {
    stopEclipseLoop();
    stopRadLoop();
    stopWhisperLoop();
    stopLeaderLoop();
    pressStartRef.current = null;
    radianceStartedRef.current = false;
    lockedRef.current = false;
    tapTimesRef.current = [];
    setPhase('idle');
    setRevealLinear(0);
    setRadTick(0);
    setWhisperTick(0);
    setLeaderTick(0);
    setMessages(false);
    clearTimers();
  }, [clearTimers, stopEclipseLoop, stopLeaderLoop, stopRadLoop, stopWhisperLoop]);

  useEffect(
    () => () => {
      stopEclipseLoop();
      stopRadLoop();
      stopWhisperLoop();
      stopLeaderLoop();
      clearTimers();
    },
    [clearTimers, stopEclipseLoop, stopLeaderLoop, stopRadLoop, stopWhisperLoop]
  );

  const beginWhisperTransition = useCallback((extra = {}) => {
    if (!onWhisperEnter || lockedRef.current) return;
    stopEclipseLoop();
    stopRadLoop();
    clearTimers();
    pressStartRef.current = null;
    lockedRef.current = true;
    tapTimesRef.current = [];
    setPhase('whisperTransition');
    setWhisperTick(0);
    whisperStartRef.current = Date.now();
    // 本地图片，无需预拉取
    void playWhisperChime();

    const tick = () => {
      const s = whisperStartRef.current;
      if (s == null) return;
      const t = Date.now() - s;
      setWhisperTick((prev) => {
        const next = Math.round(t / 32) * 32;
        return next === prev ? prev : next;
      });
      if (t < WHISPER_TOTAL_MS) {
        rafWhisperRef.current = requestAnimationFrame(tick);
      } else {
        stopWhisperLoop();
        const quote = pickRandomQuote(lastQuoteRef.current);
        lastQuoteRef.current = quote.id;
        // 本地图片秒加载，直接进入
        onWhisperEnter({
          quote,
          forceGate: !!extra.forceGate,
          autoOpenRecord: !!extra.autoOpenRecord,
        });
      }
    };
    rafWhisperRef.current = requestAnimationFrame(tick);
  }, [clearTimers, onWhisperEnter, stopEclipseLoop, stopRadLoop, stopWhisperLoop]);

  const registerQuickTap = useCallback(() => {
    const now = Date.now();
    const nowDate = new Date(now);
    const settings = loadLeaderSettings();
    const leaderAllowed = inLeaderWindow(nowDate) || settings.allDayTestMode;

    tapTimesRef.current = tapTimesRef.current.filter(
      (t) => now - t < WHISPER_TAP_WINDOW_MS
    );
    tapTimesRef.current.push(now);

    const resolveTapIntent = () => {
      tapDecideTimerRef.current = null;
      const count = tapTimesRef.current.length;
      tapTimesRef.current = [];
      const currentDate = new Date();
      const currentSettings = loadLeaderSettings();
      const canLeader = inLeaderWindow(currentDate) || currentSettings.allDayTestMode;

      if (
        currentSettings.enabled &&
        onLeaderEnter &&
        canLeader &&
        count >= LEADER_TAP_COUNT
      ) {
        stopEclipseLoop();
        stopRadLoop();
        stopWhisperLoop();
        clearTimers();
        pressStartRef.current = null;
        lockedRef.current = true;
        setPhase('leaderTransition');
        setLeaderTick(0);
        leaderStartRef.current = Date.now();

        const tickLeader = () => {
          const s = leaderStartRef.current;
          if (s == null) return;
          const t = Date.now() - s;
          setLeaderTick((prev) => {
            const next = Math.round(t / 24) * 24;
            return next === prev ? prev : next;
          });
          if (t < LEADER_VORTEX_MS) {
            rafLeaderRef.current = requestAnimationFrame(tickLeader);
            return;
          }
          stopLeaderLoop();
          onLeaderEnter();
        };

        rafLeaderRef.current = requestAnimationFrame(tickLeader);
        return;
      }

      if (count >= WHISPER_TAP_COUNT) {
        beginWhisperTransition({
          forceGate: inNinePmWindow(currentDate),
          autoOpenRecord: inNinePmWindow(currentDate),
        });
      }
    };

    if (tapDecideTimerRef.current) {
      clearTimeout(tapDecideTimerRef.current);
      tapDecideTimerRef.current = null;
    }

    if (
      settings.enabled &&
      onLeaderEnter &&
      leaderAllowed &&
      tapTimesRef.current.length >= LEADER_TAP_COUNT
    ) {
      resolveTapIntent();
      return;
    }

    tapDecideTimerRef.current = window.setTimeout(
      resolveTapIntent,
      TAP_DECIDE_IDLE_MS
    );
  }, [beginWhisperTransition, clearTimers, onLeaderEnter, stopEclipseLoop, stopLeaderLoop, stopRadLoop, stopWhisperLoop]);

  const beginRadiance = useCallback(() => {
    if (radianceStartedRef.current) return;
    radianceStartedRef.current = true;
    lockedRef.current = true;
    setPhase('radiating');
    setRadTick(0);
    radStartRef.current = Date.now();

    const tick = () => {
      const s = radStartRef.current;
      if (s == null) return;
      const t = Date.now() - s;
      setRadTick((prev) => {
        const next = Math.round(t / 32) * 32;
        return next === prev ? prev : next;
      });
      if (t < RADIANCE_TOTAL_MS) {
        rafRadRef.current = requestAnimationFrame(tick);
      } else {
        stopRadLoop();
        saveHandoffTimestamp();
        setMessages(true);
        void playLightSound();
        setPhase('post');
        const t1 = window.setTimeout(() => setMessages(false), MESSAGE_STAY_MS);
        timersRef.current.push(t1);
        const t2 = window.setTimeout(() => {
          resetToIdle();
        }, MESSAGE_STAY_MS + 120);
        timersRef.current.push(t2);
      }
    };
    rafRadRef.current = requestAnimationFrame(tick);
  }, [resetToIdle, stopRadLoop]);

  const eclipseLoop = useCallback(() => {
    const start = pressStartRef.current;
    if (start == null) return;
    const lin = Math.min(1, (Date.now() - start) / ECLIPSE_MS);
    // 约 30fps 更新，避免每帧 setState 卡死主线程
    setRevealLinear((prev) => {
      const next = Math.round(lin * 120) / 120;
      return Math.abs(next - prev) < 0.008 ? prev : next;
    });
    if (lin >= 1) {
      stopEclipseLoop();
      beginRadiance();
      return;
    }
    rafEclipseRef.current = requestAnimationFrame(eclipseLoop);
  }, [beginRadiance, stopEclipseLoop]);

  const startPress = useCallback(
    (e) => {
      if (lockedRef.current || phase === 'whisperTransition' || phase === 'leaderTransition') return;
      if (phase !== 'idle' && phase !== 'eclipsing') return;
      if (e.button !== undefined && e.button !== 0) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      pressStartRef.current = Date.now();
      radianceStartedRef.current = false;

      if (eclipseArmTimerRef.current) {
        clearTimeout(eclipseArmTimerRef.current);
      }
      eclipseArmTimerRef.current = window.setTimeout(() => {
        eclipseArmTimerRef.current = null;
        if (pressStartRef.current == null || lockedRef.current) return;
        setPhase('eclipsing');
        setRevealLinear(0);
        rafEclipseRef.current = requestAnimationFrame(eclipseLoop);
      }, ECLIPSE_ARM_MS);
    },
    [eclipseLoop, phase]
  );

  const abortEclipse = useCallback(() => {
    stopEclipseLoop();
    pressStartRef.current = null;
    setPhase('idle');
    setRevealLinear(0);
    radianceStartedRef.current = false;
  }, [stopEclipseLoop]);

  const endPress = useCallback(
    (e) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      if (phase === 'radiating' || phase === 'post' || phase === 'whisperTransition' || phase === 'leaderTransition') {
        return;
      }
      if (lockedRef.current) return;

      const start = pressStartRef.current;
      const duration = start != null ? Date.now() - start : 0;
      const armed = eclipseArmTimerRef.current == null && phase === 'eclipsing';

      if (eclipseArmTimerRef.current) {
        clearTimeout(eclipseArmTimerRef.current);
        eclipseArmTimerRef.current = null;
      }

      if (!armed && duration < TAP_MAX_MS && phase === 'idle') {
        pressStartRef.current = null;
        registerQuickTap();
        return;
      }

      pressStartRef.current = null;

      if (phase === 'eclipsing') {
        const lin = Math.min(1, duration / ECLIPSE_MS);
        stopEclipseLoop();
        if (lin < 1) {
          abortEclipse();
        } else if (!radianceStartedRef.current) {
          beginRadiance();
        }
      }
    },
    [
      abortEclipse,
      beginRadiance,
      phase,
      registerQuickTap,
      stopEclipseLoop,
    ]
  );

  const cancelPress = useCallback(
    (e) => {
      if (phase === 'radiating' || phase === 'post' || phase === 'whisperTransition' || phase === 'leaderTransition') {
        return;
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (eclipseArmTimerRef.current) {
        clearTimeout(eclipseArmTimerRef.current);
        eclipseArmTimerRef.current = null;
        pressStartRef.current = null;
        return;
      }
      if (phase === 'eclipsing') {
        abortEclipse();
      }
    },
    [abortEclipse, phase]
  );

  const pEclipse = easeReveal(
    phase === 'idle'
      ? revealLinear
      : phase === 'eclipsing'
        ? revealLinear
        : 1
  );

  let whisperRingOp = 0;
  let whisperRingScale = 1;
  let whisperBloomU = 0;
  let whisperDissolveU = 0;

  const leaderU =
    phase === 'leaderTransition' && leaderStartRef.current != null
      ? Math.min(1, leaderTick / LEADER_VORTEX_MS)
      : 0;
  const leaderWarp = easeBurst(Math.min(1, leaderU * 1.2));
  const leaderFade = easeFade(leaderU);

  if (phase === 'whisperTransition' && whisperStartRef.current != null) {
    const t = whisperTick;
    if (t < WHISPER_RING_MS) {
      const u = t / WHISPER_RING_MS;
      whisperRingOp = (1 - Math.abs(u * 2 - 1)) * 0.95;
      whisperRingScale = lerp(0.55, 1.75, easeBurst(u));
    }
    if (t >= WHISPER_RING_MS) {
      whisperBloomU = easeBurst(
        Math.min(1, (t - WHISPER_RING_MS) / WHISPER_BLOOM_MS)
      );
    }
    const dissolveAt = WHISPER_RING_MS + WHISPER_BLOOM_MS;
    if (t >= dissolveAt) {
      whisperDissolveU = easeFade(
        Math.min(1, (t - dissolveAt) / WHISPER_DISSOLVE_MS)
      );
    }
  }

  const sky =
    phase === 'leaderTransition'
      ? lerpColor('#030307', '#000000', easeFade(leaderU))
      : phase === 'whisperTransition'
      ? lerpColor(BG_DARK, '#0A0A0F', whisperDissolveU)
      : phase === 'radiating' || phase === 'post'
        ? BG_LIGHT
        : lerpColor(BG_DARK, BG_LIGHT, pEclipse);

  const sunBrightness =
    phase === 'whisperTransition'
      ? lerp(1.05, 1.35, whisperBloomU)
      : phase === 'radiating' || phase === 'post'
        ? 1.12
        : lerp(0.85, 1.05, pEclipse);
  const sunOpacity =
    phase === 'leaderTransition'
      ? lerp(1, 0.04, easeFade(leaderU))
      : phase === 'whisperTransition'
      ? lerp(1, 0, whisperDissolveU)
      : phase === 'radiating' || phase === 'post'
        ? 1
        : lerp(0.88, 1, pEclipse);
  /** 长按 3s 内由小到大，像被引力拉向眼前 */
  const sunScale =
    phase === 'leaderTransition'
      ? lerp(1, 0.2, easeFade(leaderU))
      : phase === 'whisperTransition'
      ? lerp(1, 1.62, whisperBloomU)
      : phase === 'radiating' || phase === 'post'
        ? 1.38
        : lerp(0.82, 1.38, pEclipse);
  const sunGlow =
    phase === 'whisperTransition'
      ? Math.max(whisperBloomU, whisperRingOp * 0.5)
      : Math.max(0, (pEclipse - 0.35) / 0.65);

  let sunRadScale = sunScale;
  let godRayOpacity = 0;
  let godRayScale = 2.2;
  let godRayRot = 0;
  let emberWash = 0;
  let sunFireGlow = 0;

  if (phase === 'whisperTransition' && whisperStartRef.current != null) {
    godRayOpacity = whisperBloomU * (1 - whisperDissolveU * 0.85);
    godRayScale = lerp(1.2, 3.2, whisperBloomU);
    godRayRot = whisperTick * 0.07;
    emberWash = whisperBloomU * (1 - whisperDissolveU);
    sunFireGlow = whisperBloomU;
    sunRadScale = lerp(1, 1.55, whisperBloomU) * lerp(1, 0.85, whisperDissolveU);
  } else if (phase === 'radiating' && radStartRef.current != null) {
    const t = radTick;
    godRayRot = t * 0.058;
    if (t < RAD_EXPLODE_MS) {
      const u = t / RAD_EXPLODE_MS;
      const eu = easeBurst(u);
      godRayOpacity = eu * 0.7;
      godRayScale = lerp(1.5, 3.8, eu);
      emberWash = eu * 0.55;
      sunFireGlow = eu;
      sunRadScale = lerp(sunScale, 1.55, eu);
    } else if (t < RAD_EXPLODE_MS + RAD_BEAM_MS) {
      const u = (t - RAD_EXPLODE_MS) / RAD_BEAM_MS;
      const eu = easeBurst(u);
      godRayOpacity = 0.7 + eu * 0.3;
      godRayScale = lerp(3.8, 5.2, eu);
      emberWash = 0.55 + eu * 0.4;
      sunFireGlow = 0.75 + eu * 0.25;
      sunRadScale = lerp(1.55, 1.72, eu);
    } else if (t < RAD_EXPLODE_MS + RAD_BEAM_MS + RAD_PEAK_MS) {
      godRayOpacity = 1;
      godRayScale = 5.5;
      emberWash = 0.95;
      sunFireGlow = 1;
      sunRadScale = 1.78;
    } else {
      const u =
        (t - RAD_EXPLODE_MS - RAD_BEAM_MS - RAD_PEAK_MS) / RAD_FADE_MS;
      const eu = easeFade(u);
      godRayOpacity = 1 - eu;
      godRayScale = lerp(5.5, 2.5, eu);
      emberWash = lerp(0.95, 0, eu);
      sunFireGlow = 1 - eu;
      sunRadScale = lerp(1.78, 1.1, eu);
    }
  }

  const glowStrength = Math.max(sunGlow, sunFireGlow);
  const sunFilter = [
    `brightness(${sunBrightness})`,
    `saturate(${lerp(0.85, 1.12, Math.max(pEclipse, sunFireGlow))})`,
    glowStrength > 0.04
      ? `drop-shadow(0 0 ${lerp(10, 56, glowStrength)}px rgba(255, ${Math.round(lerp(140, 90, glowStrength))}, 20, ${lerp(0.35, 0.92, glowStrength)}))`
      : '',
    glowStrength > 0.35
      ? `drop-shadow(0 0 ${lerp(24, 80, glowStrength)}px rgba(255, 200, 80, ${lerp(0.2, 0.55, glowStrength)}))`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const showGodRays =
    (phase === 'radiating' || phase === 'whisperTransition') && godRayOpacity > 0.05;
  const showEmberWash =
    (phase === 'radiating' || phase === 'whisperTransition') && emberWash > 0.03;
  const showWhisperRing =
    phase === 'whisperTransition' && whisperRingOp > 0.04;
  const showLeaderVortex = phase === 'leaderTransition' && leaderU > 0.01;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-[0]"
        style={{
          backgroundColor: sky,
          transform: 'translateZ(0)',
        }}
      />

      {showWhisperRing && (
        <div
          className="pointer-events-none fixed left-1/2 top-1/2 z-[12] -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{
            width: SUN * whisperRingScale * 1.6,
            height: SUN * whisperRingScale * 1.6,
            opacity: whisperRingOp,
            borderColor: GOLD,
            boxShadow: `0 0 ${24 * whisperRingOp}px ${GOLD}, inset 0 0 ${16 * whisperRingOp}px rgba(255,209,102,0.35)`,
            transform: 'translateZ(0)',
          }}
          aria-hidden
        />
      )}

      {showLeaderVortex && (
        <div className="pointer-events-none fixed inset-0 z-[25]" aria-hidden>
          <div
            className="absolute left-1/2 top-1/2 h-[180vmax] w-[180vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              opacity: lerp(0.08, 0.82, leaderFade),
              background: `
                conic-gradient(
                  from ${leaderTick * 0.06}deg at 50% 50%,
                  rgba(120,230,255,0.0) 0deg,
                  rgba(120,230,255,0.54) 16deg,
                  rgba(24,40,88,0.1) 42deg,
                  rgba(132,96,255,0.48) 70deg,
                  rgba(8,12,22,0.06) 96deg,
                  rgba(120,230,255,0.45) 128deg,
                  rgba(12,18,34,0.08) 160deg,
                  rgba(132,96,255,0.38) 196deg,
                  rgba(10,14,26,0.05) 230deg,
                  rgba(120,230,255,0.42) 264deg,
                  rgba(12,18,34,0.06) 300deg,
                  rgba(132,96,255,0.45) 332deg,
                  rgba(120,230,255,0.0) 360deg
                )
              `,
              transform: `
                scale(${lerp(1.25, 0.2, leaderWarp)})
                rotate(${leaderTick * 0.12}deg)
                skewX(${lerp(8, 22, leaderWarp)}deg)
              `,
              filter: `blur(${lerp(0.2, 1.9, leaderWarp)}px)`,
              WebkitMaskImage:
                'radial-gradient(circle, transparent 0 15%, #000 23% 79%, transparent 92%)',
              maskImage:
                'radial-gradient(circle, transparent 0 15%, #000 23% 79%, transparent 92%)',
            }}
          />
          <div
            className="absolute left-1/2 top-1/2 h-[128vmax] w-[128vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              opacity: lerp(0.06, 0.72, leaderFade),
              background: `
                conic-gradient(
                  from ${-leaderTick * 0.09 + 52}deg at 50% 50%,
                  rgba(85,170,255,0.0) 0deg,
                  rgba(90,185,255,0.42) 26deg,
                  rgba(10,20,56,0.08) 58deg,
                  rgba(112,92,255,0.32) 95deg,
                  rgba(8,18,42,0.05) 132deg,
                  rgba(90,185,255,0.4) 174deg,
                  rgba(9,16,36,0.06) 218deg,
                  rgba(112,92,255,0.32) 258deg,
                  rgba(85,170,255,0.0) 360deg
                )
              `,
              transform: `
                scale(${lerp(1.55, 0.38, leaderWarp)})
                rotate(${-leaderTick * 0.08}deg)
                skewY(${lerp(-6, -18, leaderWarp)}deg)
              `,
              filter: `blur(${lerp(0.5, 2.4, leaderWarp)}px)`,
              WebkitMaskImage:
                'radial-gradient(circle, transparent 0 24%, #000 32% 82%, transparent 95%)',
              maskImage:
                'radial-gradient(circle, transparent 0 24%, #000 32% 82%, transparent 95%)',
            }}
          />
          <div
            className="absolute left-1/2 top-1/2 h-[44vmin] w-[44vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(184,244,255,0.36) 0%, rgba(28,82,152,0.56) 35%, rgba(0,0,0,0.98) 74%)',
              transform: `scale(${lerp(0.82, 1.72, leaderWarp)})`,
              opacity: lerp(0.22, 0.92, leaderFade),
            }}
          />
        </div>
      )}

      {showEmberWash && (
        <div
          className="pointer-events-none fixed inset-0 z-[16]"
          style={{
            opacity: emberWash,
            background: `
              radial-gradient(circle at 50% 50%, rgba(255,90,10,0.65) 0%, transparent 38%),
              radial-gradient(circle at 50% 50%, rgba(255,180,60,0.45) 0%, transparent 55%),
              radial-gradient(ellipse 200% 160% at 50% 50%, rgba(255,220,120,0.3) 0%, transparent 68%)
            `,
            transform: 'translateZ(0)',
          }}
          aria-hidden
        />
      )}

      {showGodRays && (
        <div
          className="pointer-events-none fixed inset-0 z-[20]"
          aria-hidden
        >
          <div
            className="absolute inset-[-30%]"
            style={{
              background: SCATTER_CONIC_A,
              opacity: godRayOpacity * 0.95,
              transform: `translateZ(0) rotate(${godRayRot}deg) scale(${godRayScale})`,
            }}
          />
          <div
            className="absolute inset-[-30%]"
            style={{
              background: SCATTER_CONIC_D,
              opacity: godRayOpacity * 0.55,
              transform: `translateZ(0) rotate(${-godRayRot * 0.6 + 12}deg) scale(${godRayScale * 1.02})`,
            }}
          />
        </div>
      )}

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
        <button
          type="button"
          aria-label="按住约三秒渐亮；1秒内连点三次进入 Sun Whisper"
          disabled={phase === 'whisperTransition' || phase === 'leaderTransition'}
          className="relative flex h-[min(100vmin,640px)] w-[min(100vmin,640px)] max-w-[100vw] cursor-pointer select-none items-center justify-center border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[#FFD166]/50"
          style={{ touchAction: 'none' }}
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerCancel={cancelPress}
        >
          <span
            className="sun-sphere-wrap"
            style={{
              transform: `scale(${sunRadScale})`,
              opacity: sunOpacity,
            }}
          >
            {/* 原始太阳图片 */}
            <img
              src="/reference/sun-sphere.png"
              alt=""
              draggable={false}
              className="sun-sphere-img pointer-events-none select-none"
              style={{ filter: sunFilter }}
            />
            {/* 表面等离子耀斑层 */}
            <div className="sun-plasma-overlay" aria-hidden="true">
              <div className="sun-plasma-flare" />
              <div className="sun-plasma-flare" />
              <div className="sun-plasma-flare" />
              <div className="sun-plasma-flare" />
              <div className="sun-plasma-flare" />
              <div className="sun-plasma-flare" />
            </div>
            {/* 热力边缘闪烁 */}
            <div className="sun-heat-rim" aria-hidden="true" />
            {/* 上升余烬粒子 */}
            <div className="sun-ember" aria-hidden="true" />
            <div className="sun-ember" aria-hidden="true" />
            <div className="sun-ember" aria-hidden="true" />
            <div className="sun-ember" aria-hidden="true" />
            <div className="sun-ember" aria-hidden="true" />
            <div className="sun-ember" aria-hidden="true" />
            <div className="sun-ember" aria-hidden="true" />
            <div className="sun-ember" aria-hidden="true" />
            <div className="sun-ember" aria-hidden="true" />
            <div className="sun-ember" aria-hidden="true" />
            {/* 外围漂浮光点 */}
            <div className="sun-sparkles" aria-hidden="true">
              <div className="sun-sparkle-dot" />
              <div className="sun-sparkle-dot" />
              <div className="sun-sparkle-dot" />
              <div className="sun-sparkle-dot" />
              <div className="sun-sparkle-dot" />
              <div className="sun-sparkle-dot" />
              <div className="sun-sparkle-dot" />
              <div className="sun-sparkle-dot" />
              <div className="sun-sparkle-dot" />
              <div className="sun-sparkle-dot" />
            </div>
          </span>
        </button>

        {messages && (
          <div className="message-pop mt-10 flex max-w-[min(90vw,26rem)] flex-col items-center gap-2 px-4 text-center">
            <p className="text-base font-medium text-[#FFE8B0]">
              ✅ 已为你妥善保管，晚上9点我们一起处理
            </p>
            <p className="text-sm text-[#E0D0A0]">所有黑暗已被驱散</p>
            <p className="text-xs text-[#B0A080]">
              Hope is a good thing, maybe the best thing. And good things never die.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
