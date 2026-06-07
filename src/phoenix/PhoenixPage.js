/**
 * PhoenixPage — 凤凰涅槃励志页特效（原生 JS，无第三方库）
 *
 * 用法：
 *   import { PhoenixPage } from './phoenix/PhoenixPage.js';
 *   const page = new PhoenixPage(document.getElementById('phoenix-page'), { ... });
 *   page.init();
 *   // 离开时：
 *   page.cleanup();
 */

/** @typedef {Object} PhoenixPageOptions */
/** @typedef {Object} PhoenixConfig */

const DEFAULT_CONFIG = {
  lowPerformanceMode: false,
  enableMusic: true,
  enableEffects: true,
  enableEasterEgg: true,
};
const FX_MODE_KEY = 'sunbox_phoenix_fx_mode';
const FX_MODE_CALM = 'calm';
const FX_MODE_WAR = 'war';

export class PhoenixPage {
  /**
   * @param {HTMLElement} container 必须带 id="phoenix-page"
   * @param {PhoenixPageOptions} [options]
   */
  constructor(container, options = {}) {
    if (!container || container.id !== 'phoenix-page') {
      throw new Error('PhoenixPage: container 必须为 id="phoenix-page" 的元素');
    }

    this.root = container;
    /** @type {PhoenixConfig} */
    this.config = { ...DEFAULT_CONFIG, ...(options.config || {}) };

    // TODO: 替换为你的励志主文案（也可在构造时传入 mainText）
    this.mainText =
      options.mainText ||
      '沉潜不躁，蓄力不怠；时机一至，雷霆万钧';

    // TODO: 替换为精神纲领小字
    this.mottoText =
      options.mottoText ||
      '天行健，君子以自强不息；地势坤，君子以厚德载物';

    // TODO: 替换为你的背景图地址（留空则仅显示黑底+金雾）
    this.backgroundSrc = options.backgroundSrc || '';

    // 背景音乐（随机 the_cage / pingpang2）
    const defaultAudios = ['/audio/the_cage.mp3', '/audio/pingpang2.mp3'];
    this.audioSrc = options.audioSrc || defaultAudios[Math.floor(Math.random() * defaultAudios.length)];

    this.easterText =
      options.easterText || '你已经走了这么远了，真的很了不起。';

    /** @type {(() => void) | null} */
    this.onBack = options.onBack || null;
    /** @type {(() => void) | null} */
    this.onLeaderTrigger = options.onLeaderTrigger || null;

    this._inited = false;
    this._destroyed = false;

    this._timeouts = new Set();
    this._rafIds = new Set();
    this._listeners = [];

    this._effectsRunning = false;
    this._clickBlockedUntil = 0;
    this._tapTimes = [];
    this._phoenixCooldownUntil = 0;
    this._leaderTransitioning = false;
    this._easterShown = false;
    this._lastActivity = 0;
    this._easterTimer = null;
    this._featherTimer = null;
    this._featherCount = 0;

    this._audio = null;
    this._audioFadeRaf = null;
    this._targetVolume = 0.2;
    this._musicBusy = false;

    this._sparkParticles = [];
    this._fxMode = this._loadFxMode();

    this._els = {};
  }

  /** 初始化：构建 DOM、绑定事件（不自动播放音乐，需用户点播放） */
  init() {
    if (this._inited || this._destroyed) return;
    this._inited = true;
    this._lastActivity = Date.now();

    this.root.innerHTML = '';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', '凤凰涅槃');
    this._applyFxModeClass();

    this._buildDom();
    this._createFallParticles();
    this._bindEvents();
    this._scheduleEasterEgg();
    this._scheduleFeatherSpawn();

    // 进入页面即启动飘落（不必等音乐），音乐仅控制音量
    if (this.config.enableEffects) {
      this._startEffects();
    }
    void this._autoStartMusic();
  }

  /** 销毁：停音乐、清定时器、取消 rAF、移除监听与 DOM */
  cleanup() {
    if (this._destroyed) return;
    this._destroyed = true;

    this._stopMusicImmediate();
    this._stopEffects();
    this._cancelSparkRaf();

    this._timeouts.forEach((id) => clearTimeout(id));
    this._timeouts.clear();

    this._rafIds.forEach((id) => cancelAnimationFrame(id));
    this._rafIds.clear();

    this._listeners.forEach(({ target, type, handler, opts }) => {
      target.removeEventListener(type, handler, opts);
    });
    this._listeners = [];

    if (this._easterTimer) clearTimeout(this._easterTimer);
    if (this._featherTimer) clearTimeout(this._featherTimer);

    this.root.innerHTML = '';
    this._inited = false;
  }

  // —— DOM ——

  _buildDom() {
    const black = this._el('div', 'phoenix-bg-black');
    const img = this._el('img', 'phoenix-bg-img');
    img.alt = '';
    img.decoding = 'async';
    if (this.backgroundSrc) {
      img.src = this.backgroundSrc;
    } else {
      img.style.display = 'none';
    }

    const veil = this._el('div', 'phoenix-gold-veil');
    const vignette = this._el('div', 'phoenix-vignette');
    const fallLayer = this._el('div', 'phoenix-fall-layer');
    const flightLayer = this._el('div', 'phoenix-flight-layer');
    const sparkLayer = this._el('div', 'phoenix-spark-layer');
    const rippleLayer = this._el('div', 'phoenix-ripple-layer');
    const leaderSun = this._el('button', 'phoenix-leader-sun-hit');
    leaderSun.type = 'button';
    leaderSun.setAttribute('aria-label', '隐藏触发位');
    const leaderMask = this._el('div', 'phoenix-leader-mask');

    const portal = this._el('div', 'phoenix-portal');
    const portalRingOuter = this._el('div', 'phoenix-portal-ring phoenix-portal-ring--outer');
    const portalRingInner = this._el('div', 'phoenix-portal-ring phoenix-portal-ring--inner');
    const portalShards = this._el('div', 'phoenix-portal-shards');
    const portalFlash = this._el('div', 'phoenix-portal-flash');
    const portalText = this._el('p', 'phoenix-portal-text');
    portalText.textContent = this.mainText;
    portal.append(portalRingOuter, portalRingInner, portalShards, portalFlash, portalText);

    const fxToggle = document.createElement('button');
    fxToggle.type = 'button';
    fxToggle.className = 'phoenix-fx-toggle';
    fxToggle.textContent = '◌';
    fxToggle.setAttribute('aria-label', '切换特效强度');
    fxToggle.setAttribute('title', '切换特效强度');

    const easter = this._el('p', 'phoenix-easter');
    easter.textContent = this.easterText;

    const textDock = this._el('div', 'phoenix-text-dock');
    const motto = this._el('p', 'phoenix-motto');
    motto.textContent = this.mottoText;
    textDock.append(motto);

    const audio = document.createElement('audio');
    audio.className = 'phoenix-audio-hidden';
    audio.preload = 'none';
    audio.loop = true;
    if (this.config.enableMusic && this.audioSrc) {
      audio.src = this.audioSrc;
    }

    const bird = this._buildPhoenixBird();

    this.root.append(
      black,
      img,
      veil,
      vignette,
      fallLayer,
      flightLayer,
      sparkLayer,
      rippleLayer,
      portal,
      leaderSun,
      leaderMask,
      easter,
      textDock,
      audio,
      fxToggle
    );
    flightLayer.appendChild(bird);

    this._els = {
      img,
      fallLayer,
      flightLayer,
      sparkLayer,
      rippleLayer,
      portalText,
      leaderSun,
      leaderMask,
      easter,
      audio,
      fxToggle,
      bird,
    };
    this._syncFxToggleLabel();
  }

  _buildPhoenixBird() {
    const bird = this._el('div', 'phoenix-bird');
    const body = this._el('div', 'phoenix-bird-body');
    const wing = this._el('div', 'phoenix-bird-wing');
    const trail = this._el('div', 'phoenix-bird-trail');
    bird.append(body, wing, trail);
    return bird;
  }

  _el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  // —— 飘落粒子（CSS animation） ——

  _createFallParticles() {
    const { fallLayer } = this._els;
    if (!fallLayer || !this.config.enableEffects) return;

    const low = this.config.lowPerformanceMode;
    const marsCount = low ? 15 : 30;

    for (let i = 0; i < marsCount; i++) {
      fallLayer.appendChild(this._makeMars(i));
    }

    if (!low) {
      for (let i = 0; i < 15; i++) {
        fallLayer.appendChild(this._makeAsh(i));
      }
    }
  }

  _rand(min, max) {
    return min + Math.random() * (max - min);
  }

  _vw(n) {
    return (window.innerWidth * n) / 100;
  }

  _fallDuration(speedPxPerFrame) {
    const h = window.innerHeight + this._vw(8);
    const pxPerSec = speedPxPerFrame * 60;
    return Math.max(8, h / pxPerSec);
  }

  _makeMars(index) {
    const el = this._el('div', 'phoenix-mars');
    const size = this._rand(0.35, 0.75);
    const opA = this._rand(0.22, 0.38);
    const startX = this._rand(0, 100);
    const endX = startX + this._rand(-5, 5);
    const speed = this._rand(0.5, 1.5);
    const delay = this._rand(0, 3);

    el.style.width = `${size}vw`;
    el.style.height = `${size}vw`;
    el.style.left = `${startX}vw`;
    el.style.setProperty('--px-start', '0vw');
    el.style.setProperty('--px-end', `${endX - startX}vw`);
    el.style.setProperty('--op-a', String(opA));
    el.style.setProperty('--op-b', String(this._rand(0.18, 0.4)));
    el.style.setProperty('--op-c', String(this._rand(0.2, 0.42)));
    el.style.setProperty('--op-d', String(this._rand(0.16, 0.36)));
    el.style.setProperty('--op-e', String(this._rand(0.14, 0.3)));
    el.style.setProperty('--dur', `${this._fallDuration(speed)}s`);
    el.style.setProperty('--delay', `${delay}s`);
    el.style.opacity = String(this._rand(0.24, 0.36));

    return el;
  }

  _makeAsh(index) {
    const el = this._el('div', 'phoenix-ash');
    const w = this._rand(0.3, 0.6);
    const h = w * this._rand(0.6, 1.2);
    const startX = this._rand(0, 100);
    const endX = startX + this._rand(-8, 8);
    const speed = this._rand(0.3, 1);
    const delay = this._rand(0, 5);
    const rotStart = this._rand(0, 360);
    const rotEnd = rotStart + this._rand(-180, 360);

    el.style.width = `${w}vw`;
    el.style.height = `${h}vw`;
    el.style.left = `${startX}vw`;
    el.style.borderRadius = `${this._rand(10, 40)}%`;
    el.style.opacity = String(this._rand(0.1, 0.18));
    el.style.setProperty('--px-start', '0vw');
    el.style.setProperty('--px-end', `${endX - startX}vw`);
    el.style.setProperty('--rot-start', `${rotStart}deg`);
    el.style.setProperty('--rot-end', `${rotEnd}deg`);
    el.style.setProperty('--dur', `${this._fallDuration(speed)}s`);
    el.style.setProperty('--delay', `${delay}s`);

    return el;
  }

  _spawnFeather() {
    if (
      this._destroyed ||
      this.config.lowPerformanceMode ||
      !this.config.enableEffects ||
      !this._effectsRunning
    ) {
      return;
    }
    if (this._featherCount >= 2) return;

    const el = this._el('div', 'phoenix-feather');
    const startX = this._rand(5, 90);
    const endX = startX + this._rand(-4, 4);
    const speed = this._rand(0.2, 0.5);
    el.style.left = `${startX}vw`;
    el.style.opacity = String(this._rand(0.22, 0.32));
    el.style.setProperty('--px-start', '0vw');
    el.style.setProperty('--px-end', `${endX - startX}vw`);
    el.style.setProperty('--dur', `${this._fallDuration(speed)}s`);

    this._featherCount += 1;
    this._els.fallLayer.appendChild(el);

    const onEnd = () => {
      el.remove();
      this._featherCount = Math.max(0, this._featherCount - 1);
    };
    el.addEventListener('animationend', onEnd, { once: true });

    const durMs = this._fallDuration(speed) * 1000;
    this._timeout(() => onEnd(), durMs + 100);

    el.classList.add('is-falling');
  }

  _scheduleFeatherSpawn() {
    if (this.config.lowPerformanceMode || !this.config.enableEffects) return;

    const schedule = () => {
      if (this._destroyed) return;
      const delay = this._rand(10, 20) * 1000;
      this._featherTimer = setTimeout(() => {
        if (this._effectsRunning) this._spawnFeather();
        schedule();
      }, delay);
    };
    schedule();
  }

  _startFallAnimations() {
    const { fallLayer } = this._els;
    if (!fallLayer) return;
    fallLayer.querySelectorAll('.phoenix-mars, .phoenix-ash').forEach((node) => {
      node.classList.add('is-falling');
    });
  }

  _stopFallAnimations() {
    const { fallLayer } = this._els;
    if (!fallLayer) return;
    fallLayer.querySelectorAll('.phoenix-mars, .phoenix-ash, .phoenix-feather').forEach(
      (node) => {
        node.classList.remove('is-falling');
        if (node.classList.contains('phoenix-feather')) node.remove();
      }
    );
    this._featherCount = 0;
  }

  // —— 交互 ——

  _bindEvents() {
    this._on(this.root, 'pointerdown', (e) => this._handlePointerDown(e));
    if (this._els.fxToggle) {
      this._on(this._els.fxToggle, 'click', (e) => {
        e.stopPropagation();
        this._toggleFxMode();
      });
      this._on(this._els.fxToggle, 'pointerdown', (e) => e.stopPropagation());
    }

    ['pointerdown', 'keydown', 'touchstart'].forEach((type) => {
      this._on(document, type, () => this._touchActivity(), { passive: true });
    });
  }

  _handlePointerDown(e) {
    if (this._destroyed) return;
    if (this._leaderTransitioning) return;
    if (this.root.dataset.anxietyBlockClicks === '1') return;
    if (e.target.closest('.phoenix-anxiety-sun')) return;

    this._touchActivity();

    const now = Date.now();
    const isLeaderTap = !!e.target.closest('.phoenix-leader-sun-hit');

    // 7 连击太阳触发位（1 秒内）进入精神领袖模块
    if (isLeaderTap) {
      this._tapTimes = this._tapTimes.filter((t) => now - t < 1000);
      this._tapTimes.push(now);
      if (this._tapTimes.length >= 7 && now >= this._phoenixCooldownUntil) {
        this._tapTimes = [];
        this._phoenixCooldownUntil = now + 10000;
        this._triggerLeaderTransition();
      }
      return;
    }

    if (now < this._clickBlockedUntil) return;
    this._clickBlockedUntil = now + 300;

    if (!this.config.enableEffects || this.config.lowPerformanceMode) return;

    const rect = this.root.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this._spawnRipple(x, y);
    this._spawnSparks(x, y);
  }

  _triggerLeaderTransition() {
    if (this._leaderTransitioning) return;
    this._leaderTransitioning = true;

    const { leaderSun, leaderMask } = this._els;
    leaderSun?.classList.add('is-dimming');

    this._timeout(() => {
      leaderMask?.classList.add('is-closing');
    }, 1500);

    this._timeout(() => {
      if (typeof this.onLeaderTrigger === 'function') {
        this.onLeaderTrigger();
      } else {
        this._triggerPhoenixFlight();
      }
    }, 2500);
  }

  _spawnRipple(x, y) {
    const { rippleLayer } = this._els;
    if (!rippleLayer) return;

    const ripple = this._el('div', 'phoenix-ripple');
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    rippleLayer.appendChild(ripple);
    ripple.addEventListener(
      'animationend',
      () => ripple.remove(),
      { once: true }
    );
  }

  _spawnSparks(x, y) {
    const { sparkLayer } = this._els;
    if (!sparkLayer) return;

    const count = Math.floor(this._rand(3, 6));
    const start = performance.now();
    const duration = 1500;
    const particles = [];

    for (let i = 0; i < count; i++) {
      const el = this._el('div', 'phoenix-spark');
      const size = this._rand(0.2, 0.4);
      el.style.width = `${size}vw`;
      el.style.height = `${size}vw`;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.opacity = String(this._rand(0.35, 0.5));
      el.style.boxShadow = '0 0 1vw #e05555aa';
      sparkLayer.appendChild(el);

      particles.push({
        el,
        px: 0,
        py: 0,
        vx: this._rand(-0.35, 0.35),
        vy: this._rand(-1.2, -2),
        baseOpacity: this._rand(0.38, 0.55),
      });
    }

    let lastFrame = start;
    const tick = (now) => {
      if (this._destroyed) {
        particles.forEach((p) => p.el.remove());
        return;
      }
      const elapsed = now - start;
      const t = elapsed / duration;
      const dt = Math.min(32, now - lastFrame) / 16.67;
      lastFrame = now;

      particles.forEach((p) => {
        p.px += p.vx * dt;
        p.py += p.vy * dt;
        p.el.style.transform = `translate3d(${p.px}px, ${p.py}px, 0)`;
        p.el.style.opacity = String(Math.max(0, (1 - t) * p.baseOpacity));
      });

      if (elapsed < duration) {
        const id = requestAnimationFrame(tick);
        this._rafIds.add(id);
      } else {
        particles.forEach((p) => p.el.remove());
      }
    };

    const id = requestAnimationFrame(tick);
    this._rafIds.add(id);
  }

  _cancelSparkRaf() {
    this._sparkParticles.forEach((p) => p.el?.remove());
    this._sparkParticles = [];
  }

  _triggerPhoenixFlight() {
    const { bird } = this._els;
    if (!bird) return;
    bird.classList.remove('is-flying');
    void bird.offsetWidth;
    bird.classList.add('is-flying');
    this._timeout(() => bird.classList.remove('is-flying'), 3200);
  }

  _loadFxMode() {
    try {
      const v = localStorage.getItem(FX_MODE_KEY);
      if (v === FX_MODE_CALM || v === FX_MODE_WAR) return v;
    } catch {
      // ignore
    }
    return FX_MODE_WAR;
  }

  _saveFxMode() {
    try {
      localStorage.setItem(FX_MODE_KEY, this._fxMode);
    } catch {
      // ignore
    }
  }

  _applyFxModeClass() {
    this.root.classList.toggle('phoenix-fx-war', this._fxMode === FX_MODE_WAR);
    this.root.classList.toggle('phoenix-fx-calm', this._fxMode !== FX_MODE_WAR);
  }

  _syncFxToggleLabel() {
    const btn = this._els.fxToggle;
    if (!btn) return;
    btn.dataset.mode = this._fxMode;
    btn.setAttribute(
      'aria-label',
      this._fxMode === FX_MODE_WAR ? '切换到柔和特效' : '切换到战场特效'
    );
  }

  _toggleFxMode() {
    this._fxMode = this._fxMode === FX_MODE_WAR ? FX_MODE_CALM : FX_MODE_WAR;
    this._applyFxModeClass();
    this._syncFxToggleLabel();
    this._saveFxMode();
  }

  // —— 彩蛋 ——

  _touchActivity() {
    this._lastActivity = Date.now();
    if (this._easterTimer) {
      clearTimeout(this._easterTimer);
      this._easterTimer = null;
    }
    if (!this._easterShown && this.config.enableEasterEgg) {
      this._scheduleEasterEgg();
    }
  }

  _scheduleEasterEgg() {
    if (!this.config.enableEasterEgg || this._easterShown) return;

    this._easterTimer = setTimeout(() => {
      if (this._destroyed || this._easterShown) return;
      const idle = Date.now() - this._lastActivity;
      if (idle < 30000) {
        this._scheduleEasterEgg();
        return;
      }
      this._showEasterEgg();
    }, 30000);
    this._timeouts.add(this._easterTimer);
  }

  _showEasterEgg() {
    if (this._easterShown || !this._els.easter) return;
    this._easterShown = true;
    this._els.easter.classList.add('is-visible');
    this._timeout(() => {
      this._els.easter?.classList.remove('is-visible');
    }, 5200);
  }

  // —— 音乐 ——

  async _autoStartMusic() {
    if (!this.config.enableMusic) return;
    const ok = await this._playMusic();
    if (ok) return;

    const unlock = async () => {
      const played = await this._playMusic();
      if (!played) return;
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('touchstart', unlock, true);
  }

  async _playMusic() {
    const { audio } = this._els;
    if (!audio) return false;
    if (!audio.src && this.audioSrc) audio.src = this.audioSrc;

    audio.muted = true;
    audio.volume = 0;
    try {
      await audio.play();
    } catch {
      return false;
    }
    audio.muted = false;

    this._fadeAudioVolume(0, this._targetVolume, 2000);
    if (!this._effectsRunning && this.config.enableEffects) {
      this._startEffects();
    }
    return true;
  }

  async _pauseMusic() {
    const { audio } = this._els;
    if (!audio) return;

    const fromVol = audio.volume;
    await new Promise((resolve) => {
      this._fadeAudioVolume(fromVol, 0, 2000, () => {
        if (!this._destroyed) {
          audio.pause();
          audio.currentTime = 0;
        }
        resolve();
      });
    });

    this._stopEffects();
  }

  _fadeAudioVolume(from, to, ms, onDone) {
    const { audio } = this._els;
    if (!audio) return;

    if (this._audioFadeRaf) {
      cancelAnimationFrame(this._audioFadeRaf);
      this._rafIds.delete(this._audioFadeRaf);
    }

    const start = performance.now();
    const tick = (now) => {
      if (this._destroyed) return;
      const t = Math.min(1, (now - start) / ms);
      const eased =
        t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; /* ease-in-out */
      audio.volume = from + (to - from) * eased;

      if (t < 1) {
        this._audioFadeRaf = requestAnimationFrame(tick);
        this._rafIds.add(this._audioFadeRaf);
      } else {
        audio.volume = to;
        onDone?.();
      }
    };
    this._audioFadeRaf = requestAnimationFrame(tick);
    this._rafIds.add(this._audioFadeRaf);
  }

  _stopMusicImmediate() {
    const { audio } = this._els;
    if (this._audioFadeRaf) {
      cancelAnimationFrame(this._audioFadeRaf);
      this._rafIds.delete(this._audioFadeRaf);
      this._audioFadeRaf = null;
    }
    if (audio) {
      audio.pause();
      audio.volume = 0;
      audio.removeAttribute('src');
      audio.load();
    }
  }

  _startEffects() {
    if (!this.config.enableEffects) return;
    this._effectsRunning = true;
    this._startFallAnimations();
  }

  _stopEffects() {
    this._effectsRunning = false;
    this._stopFallAnimations();
  }

  // —— 工具 ——

  _on(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    this._listeners.push({ target, type, handler, opts });
  }

  _timeout(fn, ms) {
    const id = setTimeout(() => {
      this._timeouts.delete(id);
      if (!this._destroyed) fn();
    }, ms);
    this._timeouts.add(id);
    return id;
  }
}
