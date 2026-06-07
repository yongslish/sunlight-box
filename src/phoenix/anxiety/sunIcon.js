/**
 * 金色太阳图标（CSS 绘制，id: phoenix-sun）
 */

/**
 * @param {{ withHalo?: boolean, asButton?: boolean }} opts
 */
export function createSunIcon(opts = {}) {
  const { withHalo = false, asButton = true } = opts;
  const el = document.createElement(asButton ? 'button' : 'div');
  el.id = 'phoenix-sun';
  el.className = 'phoenix-anxiety-sun';
  if (withHalo) el.classList.add('phoenix-anxiety-sun--halo');
  if (asButton) {
    el.type = 'button';
    el.setAttribute('aria-label', '太阳');
  }
  el.innerHTML = `
    <span class="phoenix-anxiety-sun__backdrop" aria-hidden="true"></span>
    <span class="phoenix-anxiety-sun__halo" aria-hidden="true"></span>
    <span class="phoenix-anxiety-sun__disc" aria-hidden="true"></span>
    <span class="phoenix-anxiety-sun__ray phoenix-anxiety-sun__ray--a" aria-hidden="true"></span>
    <span class="phoenix-anxiety-sun__ray phoenix-anxiety-sun__ray--b" aria-hidden="true"></span>
    <span class="phoenix-anxiety-sun__ray phoenix-anxiety-sun__ray--c" aria-hidden="true"></span>
    <span class="phoenix-anxiety-sun__ray phoenix-anxiety-sun__ray--d" aria-hidden="true"></span>
  `;
  return el;
}
