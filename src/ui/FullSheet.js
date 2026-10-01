import { switcherIndex } from '../view/SheetSwitcher.js';
import { bareButton, textButton } from './buttons.js';
import { el } from './dom.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The full character sheet: a view the width of the page, in the way the
 * combat screen takes the page. It opens over Play mode and hides the map,
 * the dock, and the sidebar (full-sheet.css). The bar along the top has a "Back
 * to the map" button and a switcher with one tab per party member.
 *
 * The view does not build a second sheet. It moves the sheet card, with its
 * Character, Equipment, Inventory, and Spellbook tabs, from the sidebar into
 * its body, and moves it back on close. Every control of the card keeps
 * working in both places, and the wide body gives the card the room for its
 * two-column layout.
 *
 * Escape closes the view when no dialog is open. Close puts focus back on
 * the control that opened the view.
 * @param {HTMLElement} container the page section of the view
 * @param {{
 *   card: HTMLElement,
 *   getCharacters: () => Character[],
 *   getSelectedId: () => string | null,
 *   onSelect: (id: string) => void,
 * }} opts card is the sheet card the view borrows from the sidebar.
 * @returns {{ open: () => void, close: () => void, update: () => void, isOpen: () => boolean }}
 */
export function mountFullSheet(container, opts) {
  const home = /** @type {HTMLElement} */ (opts.card.parentElement);
  const marker = document.createComment('sheet card home');
  /** @type {HTMLElement | null} */
  let opener = null;

  const back = textButton('Back to the map', () => close(), { icon: 'map' });
  back.id = 'full-sheet-back';
  const switcher = el('div', 'full-sheet__switcher u-row');
  switcher.setAttribute('role', 'tablist');
  switcher.setAttribute('aria-label', 'Party member');
  const bar = el('div', 'full-sheet__bar u-row u-g3', back, switcher);
  const body = el('div', 'full-sheet__body');
  body.id = 'full-sheet-body';
  container.append(el('div', 'full-sheet__layout u-col u-g3', bar, body));

  switcher.addEventListener('keydown', (event) => {
    const tabs = /** @type {HTMLButtonElement[]} */ ([...switcher.querySelectorAll('[role=tab]')]);
    const index = tabs.indexOf(/** @type {HTMLButtonElement} */ (event.target));
    const next = switcherIndex(event.key, index, tabs.length);
    if (next === null || index < 0) return;
    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  });

  function update() {
    if (!isOpen()) return;
    const focused = switcher.contains(document.activeElement);
    const selected = opts.getSelectedId();
    switcher.innerHTML = '';
    for (const character of opts.getCharacters()) {
      const current = character.id === selected;
      const tab = bareButton([character.name], () => opts.onSelect(character.id), {
        className: 'full-sheet__tab',
      });
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(current));
      tab.setAttribute('aria-controls', body.id);
      tab.tabIndex = current ? 0 : -1;
      switcher.appendChild(tab);
      if (current && focused) tab.focus();
    }
  }

  /** @param {KeyboardEvent} event */
  function onKey(event) {
    if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    close();
  }

  function isOpen() {
    return document.body.classList.contains('sheet-full');
  }

  function open() {
    if (isOpen()) return;
    opener = /** @type {HTMLElement | null} */ (document.activeElement);
    home.insertBefore(marker, opts.card);
    body.appendChild(opts.card);
    document.body.classList.add('sheet-full');
    document.addEventListener('keydown', onKey);
    update();
    back.focus();
  }

  function close() {
    if (!isOpen()) return;
    marker.replaceWith(opts.card);
    document.body.classList.remove('sheet-full');
    document.removeEventListener('keydown', onKey);
    if (opener?.isConnected) opener.focus();
    opener = null;
  }

  return { open, close, update, isOpen };
}
