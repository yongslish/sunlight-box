import { deleteAllRecords, loadRecords } from './anxietyStorage.js';

/**
 * 历史记录页（纯黑底，无特效音乐）
 */
export class AnxietyHistoryView {
  /**
   * @param {HTMLElement} root
   * @param {{ onClose: () => void, getSunRect: () => DOMRect | null, lowPerformanceMode?: boolean }} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.onClose = opts.onClose;
    this.getSunRect = opts.getSunRect;
    this.lowPerformanceMode = !!opts.lowPerformanceMode;

    this._panel = null;
    this._listEl = null;
    this._rafIds = new Set();
    this._destroyed = false;
  }

  mount() {
    const panel = document.createElement('div');
    panel.className = 'phoenix-anxiety-history';

    const header = document.createElement('p');
    header.className = 'phoenix-anxiety-history-header';
    header.textContent = '焦虑记录';
    header.style.cursor = 'pointer';
    header.addEventListener('click', () => this.onClose());

    this._listEl = document.createElement('div');
    this._listEl.className = 'phoenix-anxiety-history-list';

    const footer = document.createElement('div');
    footer.className = 'phoenix-anxiety-history-footer';
    const burnBtn = document.createElement('button');
    burnBtn.type = 'button';
    burnBtn.className = 'phoenix-anxiety-burn-all';
    burnBtn.textContent = '焚尽所有';
    footer.appendChild(burnBtn);

    panel.append(header, this._listEl, footer);
    this._renderList();

    burnBtn.addEventListener('click', () => void this._burnAll());
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());

    this.root.appendChild(panel);
    this._panel = panel;

    requestAnimationFrame(() => this._panel?.classList.add('is-open'));
  }

  unmount() {
    this._panel?.remove();
    this._panel = null;
  }

  cleanup() {
    this._destroyed = true;
    this._rafIds.forEach((id) => cancelAnimationFrame(id));
    this._rafIds.clear();
    this.unmount();
  }

  _renderList() {
    if (!this._listEl) return;
    this._listEl.innerHTML = '';
    const records = loadRecords().sort((a, b) => b.submittedAt - a.submittedAt);

    if (records.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText =
        'text-align:center;color:#ffffff44;font-size:3vw;font-weight:300;padding:4vh 0;';
      empty.textContent = '尚无记录';
      this._listEl.appendChild(empty);
      return;
    }

    records.forEach((rec) => {
      const item = document.createElement('div');
      item.className = 'phoenix-anxiety-history-item';
      item.innerHTML = `
        <div class="phoenix-anxiety-history-item-head">
          <span>${rec.date}</span>
          <span>已移交</span>
        </div>
        <div class="phoenix-anxiety-history-item-body"></div>
      `;
      const body = item.querySelector('.phoenix-anxiety-history-item-body');
      if (body) body.textContent = rec.content || '（空白）';
      item.addEventListener('click', () => item.classList.toggle('is-expanded'));
      this._listEl.appendChild(item);
    });
  }

  async _burnAll() {
    const records = loadRecords();
    if (records.length === 0) {
      deleteAllRecords();
      this.onClose();
      return;
    }

    if (this.lowPerformanceMode) {
      deleteAllRecords();
      this._renderList();
      this.onClose();
      return;
    }

    const sunRect = this.getSunRect();
    const rootRect = this.root.getBoundingClientRect();
    const layer = document.createElement('div');
    layer.className = 'phoenix-anxiety-ash-layer';
    layer.style.zIndex = '310';
    this.root.appendChild(layer);

    const targetX = sunRect
      ? sunRect.left + sunRect.width / 2 - rootRect.left
      : rootRect.width / 2;
    const targetY = sunRect
      ? sunRect.top + sunRect.height / 2 - rootRect.top
      : rootRect.height * 0.12;

    const particles = records.map((rec, i) => {
      const el = document.createElement('div');
      el.className = 'phoenix-anxiety-ash';
      el.textContent = rec.date;
      const sx = 20 + (i % 5) * 15;
      const sy = 30 + Math.floor(i / 5) * 8;
      const px = (sx / 100) * rootRect.width;
      const py = (sy / 100) * rootRect.height;
      el.style.left = `${px}px`;
      el.style.top = `${py}px`;
      layer.appendChild(el);
      return { el, px, py };
    });

    await new Promise((resolve) => {
      const start = performance.now();
      const duration = 2200;
      const tick = (now) => {
        const elapsed = now - start;
        const t = Math.min(1, elapsed / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        particles.forEach((p) => {
          const x = p.px + (targetX - p.px) * eased;
          const y = p.py + (targetY - p.py) * eased;
          p.el.style.transform = `translate3d(${x - p.px}px, ${y - p.py}px, 0)`;
          p.el.style.opacity = String(1 - eased);
        });
        if (elapsed < duration) {
          this._rafIds.add(requestAnimationFrame(tick));
        } else {
          resolve();
        }
      };
      this._rafIds.add(requestAnimationFrame(tick));
    });

    layer.remove();
    deleteAllRecords();
    this.onClose();
  }
}
