import { textButton } from './buttons.js';
import { el } from './dom.js';

/**
 * A text element that folds to a few lines behind a More button, which
 * reads Less while the text is open. The caller keeps the open state, so
 * it lasts across a list repaint, and `onToggle` flips it and repaints.
 * The CSS class `<className>--folded` sets how many lines show.
 * @param {'span' | 'p'} tag
 * @param {string} className
 * @param {string} text
 * @param {{ fold: boolean, open: boolean, onToggle: () => void, subject: string,
 *   focusKey: string }} opts `fold` false returns the text alone. `subject`
 *   names the text in the button's accessible name, such as "notes on Dorn".
 * @returns {HTMLElement[]}
 */
export function foldText(tag, className, text, opts) {
  const body = el(tag, className, text);
  if (!opts.fold) return [body];
  body.classList.toggle(`${className}--folded`, !opts.open);
  const more = textButton(opts.open ? 'Less' : 'More', opts.onToggle, {
    className: 'fold-text__more',
  });
  more.setAttribute('aria-expanded', String(opts.open));
  more.setAttribute('aria-label', `${opts.open ? 'Fold' : 'Show all'} ${opts.subject}`);
  more.dataset.focusKey = opts.focusKey;
  return [body, more];
}
