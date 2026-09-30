import { promptModal } from './Modal.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';
import { classLevelOf } from '../entities/Multiclass.js';
import {
  PACT_BOON_LEVEL,
  eligibleInvocations,
  getInvocations,
  getPactBoon,
  invocationCount,
  pactBoonName,
  setInvocations,
  setPactBoon,
} from '../entities/Invocations.js';
import { PACT_BOONS } from '../data/invocations.js';
import { splitList } from '../util/text.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The warlock rows of the progression section: the pact boon from 3rd
 * warlock level, and the eldritch invocations from 2nd, with a list of what
 * each picked invocation does. `entities/Invocations.js` holds the rules.
 * This file is DOM wiring over it, verified visually. A character with no
 * warlock level gets no rows.
 * @param {() => Character} getCharacter
 * @param {{ editBase: boolean, onCommit: (character: Character) => void }} opts
 *   editBase gates the Choose buttons, since a pick changes the base character
 * @returns {HTMLElement[]}
 */
export function buildInvocationRows(getCharacter, opts) {
  const character = getCharacter();
  const level = classLevelOf(character, 'warlock');
  const count = invocationCount(level);
  /** @type {HTMLElement[]} */
  const rows = [];

  if (level >= PACT_BOON_LEVEL) {
    const boon = getPactBoon(character);
    rows.push(
      row(
        boon ? `Pact boon: ${pactBoonName(boon)}` : 'No pact boon chosen',
        opts.editBase && ['Choose', choosePactBoon, 'Choose the pact boon'],
      ),
    );
  }

  if (count > 0) {
    const picked = getInvocations(character);
    rows.push(
      row(
        `Invocations (${picked.length} of ${count})`,
        opts.editBase && ['Choose', chooseInvocations, 'Choose the eldritch invocations'],
      ),
    );
    if (picked.length > 0) {
      rows.push(
        el(
          'details',
          'character-sheet__features u-muted',
          el('summary', '', 'Invocation rules'),
          el(
            'ul',
            'u-col u-g1',
            ...picked.map((inv) => el('li', '', `${inv.name}: ${inv.description}`)),
          ),
        ),
      );
    }
  }

  async function choosePactBoon() {
    const values = await promptModal(
      'Pact boon',
      [
        {
          name: 'boon',
          label: 'Pact boon',
          type: 'select',
          options: [
            { value: '', label: 'None' },
            ...PACT_BOONS.map((b) => ({ value: b.id, label: b.name })),
          ],
          value: getPactBoon(getCharacter()) ?? '',
        },
      ],
      { submitLabel: 'Choose' },
    );
    if (!values) return;
    const boon = /** @type {import('../types/invocation.js').PactBoon | ''} */ (values.boon);
    const live = getCharacter();
    const next = setPactBoon(live, boon || null);
    if (next !== live) opts.onCommit(next);
  }

  async function chooseInvocations() {
    const from = getCharacter();
    const max = invocationCount(classLevelOf(from, 'warlock'));
    const values = await promptModal(
      'Eldritch invocations',
      [
        {
          name: 'invocations',
          label: `Choose up to ${max}`,
          type: 'multiselect',
          options: eligibleInvocations(from).map((inv) => ({ value: inv.id, label: inv.name })),
          max,
          value: getInvocations(from)
            .map((inv) => inv.id)
            .join(','),
        },
      ],
      { submitLabel: 'Choose' },
    );
    if (!values) return;
    const live = getCharacter();
    const next = setInvocations(live, splitList(values.invocations));
    if (next !== live) opts.onCommit(next);
  }

  return rows;
}

/**
 * One progression row: its text and an optional button.
 * @param {string} text
 * @param {false | [string, () => void, string]} button label, handler, and
 *   accessible label, or false for none
 * @returns {HTMLElement}
 */
function row(text, button) {
  const line = el(
    'div',
    'character-sheet__progress-row u-row u-g2 u-muted',
    el('span', 'character-sheet__progress-text', text),
  );
  if (button) line.appendChild(textButton(button[0], button[1], { ariaLabel: button[2] }));
  return line;
}
