/**
 * 21:00 焦虑记录隐藏入口 — 独立模块，不修改 PhoenixPage 核心逻辑
 */

import {
  getGateInactiveReason,
  isAnxietyGateActive,
  msUntilTenPm,
} from './anxietyGate.js';
import {
  clearGateClosedForToday,
  closeGateForToday,
} from './anxietyStorage.js';
import { createSunIcon } from './sunIcon.js';
import { AnxietyRecordView } from './AnxietyRecordView.js';
import { AnxietyHistoryView } from './AnxietyHistoryView.js';

export class PhoenixAnxietyModule {
  /**
   * @param {HTMLElement} root #phoenix-page
   * @param {{ lowPerformanceMode?: boolean }} [options]
   */
  constructor(root, options = {}) {
    this.root = root;
    this.lowPerformanceMode = !!options.lowPerformanceMode;
    // TODO: 开发时可设 forceGate: true 或 URL ?anxietyGate=1 强制显示入口
    this.forceGate = !!options.forceGate;
    this.autoOpenRecord = !!options.autoOpenRecord;

    this._destroyed = false;
    this._gateSun = null;
    this._clockTimer = null;
    this._tenPmTimer = null;
    this._mode = 'inspire'; // inspire | record | history

    this._recordView = null;
    this._historyView = null;
    this._loggedInactive = false;
    this._onVis = null;
  }

  init() {
    if (this._destroyed) return;
    this._syncGateSun();
    if (this.autoOpenRecord) {
      // 21:00-21:59 三击后可直接进入焦虑移交页（复用现有记录页逻辑）
      this._openRecord();
      return;
    }
    this._clockTimer = setInterval(() => this._syncGateSun(), 5000);
    this._onVis = () => this._syncGateSun();
    document.addEventListener('visibilitychange', this._onVis);

    if (import.meta.env.DEV) {
      window.__sunboxClearAnxietyGate = () => {
        clearGateClosedForToday();
        this._loggedInactive = false;
        this._syncGateSun();
        console.info('[SunBox] 已重新开放今日 21 点入口');
      };
    }
  }

  cleanup() {
    this._destroyed = true;
    if (this._clockTimer) clearInterval(this._clockTimer);
    if (this._tenPmTimer) clearTimeout(this._tenPmTimer);
    if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
    this._recordView?.cleanup();
    this._historyView?.cleanup();
    this._removeGateSun();
    this.root?.classList.remove('phoenix-anxiety-inspire-hidden');
    this._resumeFallEffects();
  }

  _syncGateSun() {
    if (this._destroyed || this._mode !== 'inspire') return;

    const active = isAnxietyGateActive(new Date(), this.forceGate);
    if (!active) {
      this._removeGateSun();
      const reason = getGateInactiveReason(new Date(), this.forceGate);
      if (reason && !this._loggedInactive) {
        this._loggedInactive = true;
        console.info('[SunBox 焦虑入口]', reason);
      }
      return;
    }
    this._loggedInactive = false;

    if (!this._gateSun) {
      this._gateSun = createSunIcon({ withHalo: true, asButton: true });
      this._gateSun.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openRecord();
      });
      this._gateSun.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.root.appendChild(this._gateSun);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this._gateSun?.classList.add('is-visible'));
      });
    } else if (!this._gateSun.classList.contains('is-visible')) {
      this._gateSun.classList.add('is-visible');
    }

    this._scheduleTenPmClose();
  }

  _scheduleTenPmClose() {
    if (this._tenPmTimer) clearTimeout(this._tenPmTimer);
    const ms = msUntilTenPm();
    if (ms <= 0) {
      this._removeGateSun();
      return;
    }
    this._tenPmTimer = setTimeout(() => {
      this._tenPmTimer = null;
      if (this._mode === 'inspire') this._removeGateSun();
    }, ms + 50);
  }

  _removeGateSun() {
    if (this._gateSun) {
      this._gateSun.remove();
      this._gateSun = null;
    }
  }

  _openRecord() {
    if (this._mode !== 'inspire') return;
    this._mode = 'record';
    this._removeGateSun();
    this.root.classList.add('phoenix-anxiety-inspire-hidden');

    this._stopPhoenixClickEffects();
    this._recordView = new AnxietyRecordView(this.root, {
      lowPerformanceMode: this.lowPerformanceMode,
      onSubmitDone: () => this._afterSubmit(),
      onOpenHistory: () => this._openHistory(),
    });
    this._recordView.mount();
  }

  _afterSubmit() {
    closeGateForToday();
    this._recordView?.unmount();
    this._recordView = null;
    this._mode = 'inspire';
    this.root.classList.remove('phoenix-anxiety-inspire-hidden');
    this._resumeFallEffects();
    this._removeGateSun();
  }

  _openHistory() {
    if (this._mode !== 'record') return;
    this._pauseMusicIfPlaying();
    this._stopFallEffects();

    this._historyView = new AnxietyHistoryView(this.root, {
      lowPerformanceMode: this.lowPerformanceMode,
      onClose: () => this._closeHistory(),
      getSunRect: () =>
        this.root.querySelector('#phoenix-sun')?.getBoundingClientRect() ?? null,
    });
    this._historyView.mount();
    this._mode = 'history';
  }

  _closeHistory() {
    this._historyView?.unmount();
    this._historyView = null;
    if (this._mode === 'history') this._mode = 'record';
    this._resumeFallEffects();
  }

  _pauseMusicIfPlaying() {
    const audio = this.root.querySelector('.phoenix-audio-hidden');
    if (audio && !audio.paused) {
      audio.dataset.anxietyWasPlaying = '1';
      audio.pause();
    }
  }

  _resumeMusicIfNeeded() {
    const audio = this.root.querySelector('.phoenix-audio-hidden');
    if (audio?.dataset.anxietyWasPlaying === '1') {
      delete audio.dataset.anxietyWasPlaying;
      void audio.play().catch(() => {});
    }
  }

  _stopFallEffects() {
    this.root
      .querySelectorAll('.phoenix-mars, .phoenix-ash, .phoenix-feather')
      .forEach((n) => n.classList.remove('is-falling'));
  }

  _resumeFallEffects() {
    this.root
      .querySelectorAll('.phoenix-mars, .phoenix-ash')
      .forEach((n) => n.classList.add('is-falling'));
    this._resumeMusicIfNeeded();
    this._resumePhoenixClickEffects();
  }

  _stopPhoenixClickEffects() {
    this.root.dataset.anxietyBlockClicks = '1';
  }

  _resumePhoenixClickEffects() {
    delete this.root.dataset.anxietyBlockClicks;
  }
}
