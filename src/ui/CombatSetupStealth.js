import { stealthContest, stealthLine } from '../combat/Stealth.js';
import { setTip } from './Tooltip.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';
import { labeled, numberField, select } from './formFields.js';

/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../combat/Stealth.js').Side} Side */

/**
 * @typedef {object} StealthHooks
 * @property {(participant: Participant) => number} rollStealth one
 *   Dexterity (Stealth) total
 * @property {(participant: Participant) => number} passivePerception
 */

/**
 * The optional Stealth contest of the combat setup dialog. A picker names the
 * side that sneaks. Each row of that side then shows a Stealth total, which
 * Roll Stealth fills and the GM can type over. Each row of the other side
 * shows its passive Perception. Every change to a total runs the contest
 * again. The contest ticks the Surprised box of each watcher that notices no
 * one and clears it on each watcher that notices, and the outcome line under
 * the picker says who is surprised. The GM can still change any Surprised box
 * by hand afterward.
 * @param {Participant[]} roster
 * @param {(participant: Participant) => { name: string, side: Side }} describe
 * @param {Map<string, HTMLInputElement>} surprised the Surprised box of each row
 * @param {StealthHooks} hooks
 */
export function stealthStep(roster, describe, surprised, hooks) {
  /** @type {Map<string, HTMLInputElement>} */
  const totals = new Map();
  /** @type {Map<string, HTMLElement>} */
  const cells = new Map();
  /** @type {Map<string, HTMLElement>} */
  const passives = new Map();
  /** @type {Map<string, number>} */
  const passiveOf = new Map();
  const side = select(
    [
      { value: '', label: 'No one' },
      { value: 'party', label: 'The party' },
      { value: 'foe', label: 'The foes' },
    ],
    '',
  );
  const outcome = el('p', 'combat-setup__stealth-outcome u-muted');
  outcome.setAttribute('aria-live', 'polite');
  let line = '';

  const sneaking = () => /** @type {Side | ''} */ (side.value);
  const valueOf = (/** @type {Participant} */ p) => {
    const raw = totals.get(p.id)?.value ?? '';
    return raw === '' || Number.isNaN(Number(raw)) ? null : Number(raw);
  };

  // Show a total on each sneaker row and a passive score on each watcher row,
  // or neither when no one sneaks.
  const layout = () => {
    const by = sneaking();
    for (const p of roster) {
      const mine = describe(p).side === by;
      /** @type {HTMLElement} */ (cells.get(p.id)).hidden = by === '' || !mine;
      /** @type {HTMLElement} */ (passives.get(p.id)).hidden = by === '' || mine;
    }
    roll.hidden = by === '';
  };

  const judge = () => {
    const by = sneaking();
    const sneakers = roster.filter((p) => describe(p).side === by);
    const watchers = roster.filter((p) => by !== '' && describe(p).side !== by);
    const result = stealthContest(
      sneakers.map((p) => ({ id: p.id, total: valueOf(p) })),
      watchers.map((p) => ({ id: p.id, passive: /** @type {number} */ (passiveOf.get(p.id)) })),
    );
    for (const id of result.surprised) setBox(id, true);
    for (const id of result.noticed) setBox(id, false);
    const rolled = sneakers.flatMap((p) => {
      const total = valueOf(p);
      return total === null ? [] : [{ name: describe(p).name, total }];
    });
    line =
      by === '' || rolled.length === 0
        ? ''
        : stealthLine(
            by,
            rolled,
            result.surprised.map((id) => describe(byId(id)).name),
          );
    outcome.textContent = line;
  };

  const byId = (/** @type {string} */ id) =>
    /** @type {Participant} */ (roster.find((p) => p.id === id));
  const setBox = (/** @type {string} */ id, /** @type {boolean} */ on) => {
    const box = surprised.get(id);
    if (box) box.checked = on;
  };

  const roll = textButton(
    'Roll Stealth',
    () => {
      for (const p of roster.filter((q) => describe(q).side === sneaking())) {
        /** @type {HTMLInputElement} */ (totals.get(p.id)).value = String(hooks.rollStealth(p));
      }
      judge();
    },
    { icon: 'dice' },
  );
  side.addEventListener('change', () => {
    layout();
    judge();
  });

  return {
    section: el(
      'div',
      'combat-setup__stealth u-stack u-g1',
      el('div', 'u-row u-g2', labeled('Who sneaks', side), roll),
      outcome,
    ),
    /**
     * The Stealth total and passive Perception cells of one row. Only one of
     * them shows at a time.
     * @param {Participant} participant
     * @returns {HTMLElement[]}
     */
    cells(participant) {
      const name = describe(participant).name;
      const total = numberField('', {
        className: 'combat-setup__stealth-field',
        ariaLabel: `Stealth total for ${name}`,
        placeholder: 'Stealth',
      });
      total.addEventListener('input', judge);
      totals.set(participant.id, total);
      // A visible word names the box, because a filled box loses its
      // placeholder and looks like a second initiative box.
      const cell = el(
        'label',
        'combat-setup__stealth-total',
        el('span', 'u-muted', 'Stealth'),
        total,
      );
      cells.set(participant.id, cell);
      const passive = hooks.passivePerception(participant);
      passiveOf.set(participant.id, passive);
      const shown = el('span', 'combat-setup__passive u-muted', `PP ${passive}`);
      setTip(shown, 'Passive Perception, compared with each Stealth total');
      passives.set(participant.id, shown);
      return [cell, shown];
    },
    /** Hide the cells to match the picker. Call once the rows exist. */
    layout,
    /** The outcome line of the contest, or '' when none ran. */
    line: () => line,
  };
}
