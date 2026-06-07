import { createSunIcon } from './sunIcon.js';
import {
  addRecord,
  clearDraft,
  loadDraft,
  saveDraft,
} from './anxietyStorage.js';

const QUICK_TAGS = [
  { label: '😠 怒', text: '怒：' },
  { label: '😔 屈', text: '屈：' },
  { label: '😫 累', text: '累：' },
];

/**
 * 焦虑记录页（叠加在励志页之上，复用背景与飘落）
 */
export class AnxietyRecordView {
  /**
   * @param {HTMLElement} root #phoenix-page
   * @param {{ lowPerformanceMode?: boolean, onSubmitDone: () => void, onOpenHistory: () => void }} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.lowPerformanceMode = !!opts.lowPerformanceMode;
    this.onSubmitDone = opts.onSubmitDone;
    this.onOpenHistory = opts.onOpenHistory;

    this._destroyed = false;
    this._timeouts = new Set();
    this._rafIds = new Set();
    this._longPressTimer = null;
    this._draftTimer = null;

    this._overlay = null;
    this._textarea = null;
    this._sun = null;
    this._ashLayer = null;
    this._doneMsg = null;
  }

  mount() {
    const overlay = document.createElement('div');
    overlay.className = 'phoenix-anxiety-overlay';

    const top = document.createElement('div');
    top.className = 'phoenix-anxiety-record-top';
    this._sun = createSunIcon({ withHalo: false, asButton: true });
    top.appendChild(this._sun);

    const body = document.createElement('div');
    body.className = 'phoenix-anxiety-body';

    this._textarea = document.createElement('textarea');
    this._textarea.className = 'phoenix-anxiety-textarea';
    // TODO: 可修改 placeholder 文案
    this._textarea.placeholder =
      '把今天所有的焦虑、委屈、愤怒，都倒在这里。';
    this._textarea.value = loadDraft();

    const quickRow = document.createElement('div');
    quickRow.className = 'phoenix-anxiety-quick-row';
    QUICK_TAGS.forEach(({ label, text }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'phoenix-anxiety-quick-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => this._appendQuick(text));
      quickRow.appendChild(btn);
    });

    body.append(this._textarea, quickRow);

    const footer = document.createElement('div');
    footer.className = 'phoenix-anxiety-footer';
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'phoenix-anxiety-submit';
    submit.textContent = '移交太阳';
    submit.addEventListener('click', () => void this._handleSubmit());
    footer.appendChild(submit);

    this._ashLayer = document.createElement('div');
    this._ashLayer.className = 'phoenix-anxiety-ash-layer';

    this._doneMsg = document.createElement('p');
    this._doneMsg.className = 'phoenix-anxiety-done-msg';
    // TODO: 可修改移交完成提示语
    this._doneMsg.textContent = '今日尘埃，已付朝阳。';

    overlay.append(top, body, footer);
    overlay.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.append(overlay, this._ashLayer, this._doneMsg);
    this._overlay = overlay;

    this._textarea.addEventListener('input', () => this._scheduleDraftSave());
    this._bindLongPressSun();

    requestAnimationFrame(() => {
      this._overlay?.classList.add('is-open');
      this._textarea?.focus();
    });
  }

  unmount() {
    this._saveDraftNow();
    this._clearTimers();
    this._overlay?.remove();
    this._ashLayer?.remove();
    this._doneMsg?.remove();
    this._overlay = null;
  }

  cleanup() {
    this._destroyed = true;
    this._saveDraftNow();
    this.unmount();
  }

  _appendQuick(text) {
    if (!this._textarea) return;
    const cur = this._textarea.value;
    this._textarea.value = cur ? `${cur}\n${text}` : text;
    this._textarea.focus();
    this._scheduleDraftSave();
  }

  _scheduleDraftSave() {
    if (this._draftTimer) clearTimeout(this._draftTimer);
    this._draftTimer = setTimeout(() => this._saveDraftNow(), 400);
  }

  _saveDraftNow() {
    if (!this._textarea) return;
    saveDraft(this._textarea.value.trim() ? this._textarea.value : '');
  }

  _bindLongPressSun() {
    if (!this._sun) return;
    const start = () => {
      this._longPressTimer = setTimeout(() => {
        this.onOpenHistory();
      }, 3000);
    };
    const cancel = () => {
      if (this._longPressTimer) {
        clearTimeout(this._longPressTimer);
        this._longPressTimer = null;
      }
    };
    this._sun.addEventListener('pointerdown', start);
    this._sun.addEventListener('pointerup', cancel);
    this._sun.addEventListener('pointerleave', cancel);
    this._sun.addEventListener('pointercancel', cancel);
  }

  async _handleSubmit() {
    if (!this._overlay || this._overlay.classList.contains('is-submitting')) return;
    this._overlay.classList.add('is-submitting');
    const content = this._textarea?.value || '';

    addRecord(content);
    clearDraft();

    if (this.lowPerformanceMode) {
      this._textarea?.classList.add('is-fading');
      await this._wait(500);
    } else {
      await this._playAshAnimation(content);
    }

    this._showDoneMessage();
    await this._wait(2000);
    this.onSubmitDone();
  }

  _showDoneMessage() {
    this._doneMsg?.classList.add('is-visible');
  }

  async _playAshAnimation(content) {
    this._pauseFallEffects();
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const sunRect = this._sun?.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    if (!sunRect || !this._ashLayer) {
      this._textarea?.classList.add('is-fading');
      await this._wait(800);
      return;
    }

    const targetX = sunRect.left + sunRect.width / 2 - rootRect.left;
    const targetY = sunRect.top + sunRect.height / 2 - rootRect.top;
    this._sun?.classList.add('is-absorbing');

    if (lines.length === 0) {
      this._textarea?.classList.add('is-fading');
      await this._wait(3000);
      return;
    }

    this._textarea.style.opacity = '0';

    const particles = [];
    const taRect = this._textarea.getBoundingClientRect();
    lines.forEach((line, i) => {
      const el = document.createElement('div');
      el.className = 'phoenix-anxiety-ash';
      el.textContent = line;
      const startY =
        taRect.top - rootRect.top + i * (parseFloat(getComputedStyle(this._textarea).lineHeight) || 22);
      const startX = taRect.left - rootRect.left;
      el.style.left = `${startX}px`;
      el.style.top = `${startY}px`;
      this._ashLayer.appendChild(el);
      particles.push({
        el,
        x: startX,
        y: startY,
        delay: i * 120,
      });
    });

    await new Promise((resolve) => {
      const start = performance.now();
      const duration = 3000;
      const tick = (now) => {
        if (this._destroyed) {
          particles.forEach((p) => p.el.remove());
          resolve();
          return;
        }
        const elapsed = now - start;
        particles.forEach((p) => {
          const t = Math.max(0, Math.min(1, (elapsed - p.delay) / (duration - p.delay)));
          const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          const x = p.x + (targetX - p.x) * eased;
          const y = p.y + (targetY - p.y) * eased;
          p.el.style.transform = `translate3d(${x - p.x}px, ${y - p.y}px, 0)`;
          p.el.style.opacity = String(1 - eased * 0.85);
        });
        if (elapsed < duration) {
          const id = requestAnimationFrame(tick);
          this._rafIds.add(id);
        } else {
          particles.forEach((p) => p.el.remove());
          resolve();
        }
      };
      const id = requestAnimationFrame(tick);
      this._rafIds.add(id);
    });

    this._sun?.classList.remove('is-absorbing');
  }

  _pauseFallEffects() {
    this.root
      .querySelectorAll('.phoenix-mars.is-falling, .phoenix-ash.is-falling, .phoenix-feather.is-falling')
      .forEach((n) => n.classList.remove('is-falling'));
  }

  _wait(ms) {
    return new Promise((resolve) => {
      const id = setTimeout(() => {
        this._timeouts.delete(id);
        resolve();
      }, ms);
      this._timeouts.add(id);
    });
  }

  _clearTimers() {
    this._timeouts.forEach((id) => clearTimeout(id));
    this._timeouts.clear();
    this._rafIds.forEach((id) => cancelAnimationFrame(id));
    this._rafIds.clear();
    if (this._draftTimer) clearTimeout(this._draftTimer);
    if (this._longPressTimer) clearTimeout(this._longPressTimer);
  }
}
