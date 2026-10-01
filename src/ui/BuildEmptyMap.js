import { textButton } from './buttons.js';
import { el } from './dom.js';

/**
 * Mount the Build-mode empty state over the map canvas. It shows while the
 * map in view has no tile art, and it offers the two ways to fill the map.
 * CSS hides it outside Build mode. Call sync() after each draw; it touches
 * the DOM only when the state changes.
 * @param {HTMLElement} viewport the element that wraps the map canvas
 * @param {{ isBlank: () => boolean, getName: () => string, onPaint: () => void, onGenerate: () => void }} opts
 * @returns {{ sync: () => void }}
 */
export function mountBuildEmptyMap(viewport, opts) {
  const title = el('p', 'map-empty__title');
  const card = el(
    'div',
    'map-empty__card u-col u-g2',
    title,
    el('p', 'map-empty__hint', 'Paint tiles by hand, or generate a layout and edit it.'),
    el(
      'div',
      'u-row u-g2 u-wrap',
      textButton('Paint tiles', opts.onPaint),
      textButton('Generate map', opts.onGenerate, { variant: 'primary' }),
    ),
  );
  const root = el('div', 'map-empty', card);
  root.hidden = true;
  viewport.appendChild(root);

  /** @type {string | null} the name shown, or null while hidden */
  let shown = null;
  const sync = () => {
    const name = opts.isBlank() ? opts.getName() : null;
    if (name === shown) return;
    shown = name;
    root.hidden = name === null;
    if (name !== null) title.textContent = `"${name}" has no tiles yet.`;
  };
  return { sync };
}
