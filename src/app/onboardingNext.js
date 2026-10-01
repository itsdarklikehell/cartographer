import { el, mustGetElement } from '../ui/dom.js';
import { textButton } from '../ui/buttons.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The second Welcome step, after "Generate a world" builds a world. It
 * names the next tasks: create the characters, and check where the party
 * starts. The card uses the same overlay and classes as the Welcome card,
 * and its heading takes focus, so a keyboard user lands inside it.
 * @param {AppContext} app
 */
export function showNextSteps(app) {
  const viewport = mustGetElement('map-viewport');
  viewport.querySelector('.onboarding')?.remove();
  const heading = el('h2', 'card__title', 'Your world is ready');
  heading.tabIndex = -1;
  const card = el(
    'div',
    'onboarding__card card u-col u-g2',
    heading,
    el(
      'p',
      'onboarding__blurb u-muted',
      'The party starts beside a town. Next, create the characters and check the party start.',
    ),
  );
  const overlay = el('div', 'onboarding', card);
  const close = () => overlay.remove();

  /** @param {string} label @param {string} hint @param {() => void} action */
  const option = (label, hint, action) => {
    const button = textButton(
      label,
      () => {
        close();
        action();
      },
      { className: 'onboarding__option' },
    );
    card.appendChild(el('div', 'u-col u-g1', button, el('p', 'onboarding__hint u-muted', hint)));
  };

  option('Create a character', 'Switch to Play mode and open the New character form.', () => {
    app.actions.setMode('play');
    const add = [...mustGetElement('party-container').querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'New character',
    );
    add?.click();
  });
  option('Check the party start', 'Switch to Play mode and show the party on the map.', () =>
    app.actions.setMode('play'),
  );
  card.appendChild(textButton('Keep building', close, { className: 'onboarding__skip' }));

  viewport.appendChild(overlay);
  heading.focus();
}
