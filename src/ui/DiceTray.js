import { DIE_TYPES, roll, emptySelection, formatResult } from '../dice/DiceRoller.js';
import { buildDisclosure } from './Disclosure.js';
import { icon } from './icons.js';
import { iconButton, segSwitch, textButton } from './buttons.js';
import { el } from './dom.js';
import { numberField } from './formFields.js';
import { capitalize } from '../util/text.js';
import { parseTarget, rollTarget } from '../dice/TrayTarget.js';
import { resultSummary } from '../dice/ResultLine.js';

/** @type {import('../types/dice.js').RollMode[]} */
const MODES = ['normal', 'advantage', 'disadvantage'];

/**
 * Mount a dice tray widget. By default it collapses to a D20 icon behind an
 * accessible disclosure button. Expanding it reveals the full tray: a
 * plus/minus counter for each die type, a plus/minus modifier, a roll
 * button, and a result display. The result display appears with the first
 * roll and shows only the latest result. The
 * caller keeps past rolls: `onRoll` fires with each formatted result, and
 * the app records it in the travelogue.
 *
 * `rollSelection` rolls the tray programmatically, for example for a weapon
 * attack from the initiative panel. It rolls the given counts and modifier
 * against the given target and shows the result. The dice, the modifier, and
 * the target field keep what the GM set, so the GM's next Roll does not
 * repeat the attack. It does not fire `onRoll`, because such callers log the
 * roll under their own name. Without `keep`, it expands the tray so the
 * result is visible. With `keep`, the tray stays closed and the roll uses
 * the target that the GM typed. A save or a check from the character sheet
 * rolls this way, so the GM can type a DC once and roll several checks
 * against it.
 * @param {HTMLElement} container
 * @param {{ onRoll?: (text: string) => void }} [opts]
 * @returns {{
 *   getSelection: () => import('../types/dice.js').DiceSelection,
 *   rollSelection: (next: import('../types/dice.js').DiceSelection, target?: number | null, options?: import('../types/dice.js').TrayRollOptions) => import('../types/dice.js').TrayRoll,
 * }}
 */
export function mountDiceTray(container, opts = {}) {
  const selection = emptySelection();
  /** @type {(() => void)[]} functions that re-sync each stepper's count readout to the selection */
  const refreshers = [];

  const root = el('div', 'dice-tray');
  const disclosure = buildDisclosure({
    headChildren: [
      icon('d20', { size: 28, className: 'dice-tray__d20' }),
      el('span', 'dice-tray__title', 'Roll dice'),
    ],
    body: root,
    className: 'dice-tray__summary',
  });
  container.appendChild(disclosure.head);

  /** @param {string} label @param {number} delta @param {() => number} read @param {(n: number) => void} apply */
  const stepper = (label, delta, read, apply) => {
    const name = el('span', 'dice-tray__label u-muted', label);

    const minus = iconButton('minus', `Decrease ${label}`, () => {
      apply(read() - delta);
      count.textContent = String(read());
    });

    const count = el('span', 'dice-tray__count', String(read()));

    const plus = iconButton('plus', `Increase ${label}`, () => {
      apply(read() + delta);
      count.textContent = String(read());
    });

    refreshers.push(() => {
      count.textContent = String(read());
    });
    return el('div', 'dice-tray__row u-row u-g2', name, minus, count, plus);
  };

  for (const die of DIE_TYPES) {
    root.appendChild(
      stepper(
        die,
        1,
        () => selection.counts[die] ?? 0,
        (next) => {
          selection.counts[die] = Math.max(0, next);
        },
      ),
    );
  }

  root.appendChild(
    stepper(
      'modifier',
      1,
      () => selection.modifier,
      (next) => {
        selection.modifier = next;
      },
    ),
  );

  // The advantage/disadvantage toggle rolls every d20 twice. It keeps the
  // higher die for advantage and the lower die for disadvantage. The choice
  // stays sticky until changed, so a GM can set it once and attack through it.
  // Only this switch writes the sticky choice. A programmatic roll that names
  // its own mode applies that mode to one roll and leaves the toggle alone.
  /** @type {import('../types/dice.js').RollMode} */
  let standingMode = 'normal';
  const modeName = el('span', 'dice-tray__label u-muted', 'd20 mode');
  const modeSwitch = segSwitch({
    ariaLabel: 'Roll d20s normally, with advantage, or with disadvantage',
    options: MODES.map((mode) => ({ value: mode, label: capitalize(mode) })),
    value: selection.mode ?? 'normal',
    onChange: (mode) => {
      standingMode = mode;
      selection.mode = mode;
    },
  });
  // The selection is the value of record here. A programmatic roll writes
  // straight to it, so the buttons re-read the selection rather than holding
  // their own copy.
  refreshers.push(() => modeSwitch.sync(selection.mode ?? 'normal'));
  // This row wraps, unlike the stepper rows above it. The three mode words do
  // not fit beside their label in the narrow left column of the combat screen,
  // where the tray is docked, so the switch takes a line of its own and
  // divides it between the three.
  root.appendChild(
    el('div', 'dice-tray__row dice-tray__mode-row u-row u-g2', modeName, modeSwitch.element),
  );

  // The difficulty target is optional. When set, each roll also reports
  // success or failure against it, using a meets-it-or-beats-it rule, in the
  // tray and the travelogue.
  const targetInput = numberField('', {
    placeholder: 'none',
    className: 'dice-tray__target',
    ariaLabel: 'Target number or DC to meet (optional)',
  });
  root.appendChild(
    el(
      'div',
      'dice-tray__row u-row u-g2',
      el('span', 'dice-tray__label u-muted', 'target / DC'),
      targetInput,
    ),
  );

  const rollButton = textButton(
    'Roll',
    () => opts.onRoll?.(performRoll(parseTarget(targetInput.value)).text),
    {
      icon: 'dice',
      variant: 'primary',
      className: 'dice-tray__roll',
    },
  );

  // The result box stays out of the layout until there is a result to show.
  // An empty sunken box under the roll button reads as a broken readout.
  const resultEl = el('div', 'dice-tray__result');
  // A screen reader hears each new result without taking focus off the tray.
  resultEl.setAttribute('role', 'status');
  resultEl.hidden = true;

  /**
   * Roll the loaded selection and show the result against `target`.
   * @param {number | null} target
   */
  function performRoll(target) {
    const result = roll(selection);
    let text = formatResult(result);
    if (target !== null) {
      text += ` vs target ${target}: ${result.total >= target ? 'success' : 'failure'}`;
    }
    const summary = resultSummary(result, target);
    const verdict =
      summary.verdict === null
        ? null
        : el(
            'span',
            `dice-tray__verdict${result.total >= (target ?? 0) ? '' : ' dice-tray__verdict--fail'}`,
            summary.verdict,
          );
    resultEl.replaceChildren(
      el('span', 'dice-tray__total', String(summary.total)),
      el('span', 'dice-tray__detail u-muted', summary.detail),
      verdict ?? '',
    );
    resultEl.hidden = false;
    return { result, text };
  }

  root.append(rollButton, resultEl);
  container.appendChild(root);

  return {
    getSelection: () => selection,
    rollSelection: (next, target = null, { keep = false } = {}) => {
      // The roll borrows the tray. The dice and the modifier the GM set up
      // come back after the roll, so the GM's next Roll is the GM's own dice.
      // With `keep`, the target field is the target of this roll and the tray
      // stays closed. Without `keep`, the roll uses the target it passed.
      const saved = { counts: { ...selection.counts }, modifier: selection.modifier };
      for (const die of DIE_TYPES) selection.counts[die] = next.counts[die] ?? 0;
      selection.modifier = next.modifier ?? 0;
      // A caller that does not name a mode inherits the tray's toggle, so
      // weapon attacks respect a standing advantage/disadvantage choice. A
      // caller that names one uses it for this roll only: the toggle goes
      // back to the GM's own choice afterward.
      selection.mode = next.mode ?? standingMode;
      if (!keep) disclosure.setExpanded(true);
      // The restore runs even when the roll throws, so a failed programmatic
      // roll cannot leave the toggle showing a mode the GM never picked.
      try {
        const used = rollTarget(target, targetInput.value, keep);
        return { ...performRoll(used), target: used };
      } finally {
        selection.mode = standingMode;
        for (const die of DIE_TYPES) selection.counts[die] = saved.counts[die] ?? 0;
        selection.modifier = saved.modifier;
        for (const refresh of refreshers) refresh();
      }
    },
  };
}
