import { mustGetElement } from '../ui/dom.js';

/**
 * Wires the Menu button of the header. The stylesheet shows the button only
 * at phone width, where it folds the header actions and view switches away.
 * A press on a button inside the menu runs that action and closes the menu,
 * and Escape or a click outside the header closes it too.
 */
export function wireHeaderMenu() {
  const header = /** @type {HTMLElement} */ (mustGetElement('header-menu').closest('header'));
  const button = mustGetElement('header-menu-btn');
  const menu = mustGetElement('header-menu');

  /** @param {boolean} open */
  function setOpen(open) {
    header.classList.toggle('app-header--menu-open', open);
    button.setAttribute('aria-expanded', String(open));
  }

  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest('button')) setOpen(false);
  });
  header.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || button.getAttribute('aria-expanded') !== 'true') return;
    setOpen(false);
    button.focus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!header.contains(/** @type {Node} */ (event.target))) setOpen(false);
  });
}
