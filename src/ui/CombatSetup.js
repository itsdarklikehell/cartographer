import { formatModifier } from '../entities/Modifiers.js';
import { setTip } from './Tooltip.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';
import { checkbox, numberField } from './formFields.js';
import { openDialog } from './Modal.js';
import { rollUnsettled } from '../combat/InitiativeRoll.js';
import { numberedNames } from '../combat/DisplayNames.js';

/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/combat.js').ParticipantView} ParticipantView */

/**
 * Show the combat setup dialog. It lists one row per potential combatant with
 * an editable initiative value. An optional Roll initiative button fills
 * every row from `rollInitiative` (a Dexterity check in the app, or an
 * injected roll in tests). Each roll also returns a note saying what slanted
 * it, which the dialog passes on to `onRolled` for the log. A Start combat
 * button submits the form. Rolled values stay editable, so the GM can override
 * a result by hand before starting. A Surprised box on each row marks a
 * combatant that the other side caught unaware.
 *
 * This is the GM's entry into combat. The initiative panel itself only shows
 * a running fight, so the caller must gate who can open this dialog. On
 * Start, this function rolls each row that the GM neither rolled nor typed,
 * and resolves to the participants with their final initiative values. On
 * cancel, it resolves to null.
 *
 * As in the initiative panel, a row's name and side come from `describe`,
 * not from the participant, because the participant carries only the
 * numbers.
 * @param {Participant[]} roster
 * @param {{
 *   describe?: (participant: Participant) => ParticipantView | null,
 *   rollInitiative?: (participant: Participant) => { value: number, note: string },
 *   onRolled?: (results: { name: string, value: number, note: string }[]) => void,
 * }} [callbacks]
 * @returns {Promise<Participant[] | null>}
 */
export function combatSetupModal(roster, callbacks = {}) {
  /** @type {Map<string, HTMLInputElement>} */
  const inputs = new Map();
  /** @type {Map<string, HTMLInputElement>} */
  const surprised = new Map();
  /** The ids whose value the GM rolled or typed. Start rolls the others. */
  const settled = new Set();

  /**
   * The setup rows show only a name and a side. The fallback for an
   * unresolvable id needs only those two fields.
   * @param {Participant} participant
   * @returns {Pick<ParticipantView, 'name' | 'side'>}
   */
  const described = (participant) =>
    callbacks.describe?.(participant) ?? { name: 'Unknown combatant', side: 'party' };
  // Two rows that share a name get numbers, in roster order, which is the
  // campaign's order of characters and then creatures. The fight numbers
  // them the same way.
  const labels = numberedNames(roster.map((p) => ({ id: p.id, name: described(p).name })));
  const describe = (/** @type {Participant} */ participant) => {
    const view = described(participant);
    return { ...view, name: labels.get(participant.id) ?? view.name };
  };

  return openDialog({
    title: 'Set up combat',
    form: true,
    build: (close) => {
      /** @type {Node[]} */
      const body = [];
      for (const participant of roster) {
        const view = describe(participant);
        const modifier = el(
          'span',
          'initiative-panel__modifier u-muted',
          formatModifier(participant.modifier ?? 0),
        );
        setTip(modifier, 'DEX modifier, added to the initiative roll');

        const input = numberField(participant.initiative, {
          className: 'initiative-panel__init',
          ariaLabel: `Initiative for ${view.name}`,
        });
        input.addEventListener('input', () => settled.add(participant.id));
        inputs.set(participant.id, input);

        const surprise = checkbox('Surprised', participant.surprised === true, {
          className: 'initiative-panel__surprised',
        });
        surprise.input.setAttribute('aria-label', `${view.name} is surprised`);
        setTip(
          surprise.label,
          'No action, bonus action, or move on its first turn, and no reaction until that turn ends',
        );
        surprised.set(participant.id, surprise.input);

        body.push(
          el(
            'div',
            `initiative-panel__row u-row u-g2 initiative-panel__row--${view.side}`,
            el('span', 'initiative-panel__name', view.name),
            modifier,
            input,
            surprise.label,
          ),
        );
      }

      /** @type {HTMLElement[]} */
      const actions = [];

      const rollInitiative = callbacks.rollInitiative;
      if (rollInitiative) {
        const rollAll = textButton(
          'Roll initiative',
          () => {
            /** @type {{ name: string, value: number, note: string }[]} */
            const results = [];
            for (const participant of roster) {
              const input = inputs.get(participant.id);
              if (!input) continue;
              const { value, note } = rollInitiative(participant);
              input.value = String(value);
              settled.add(participant.id);
              results.push({ name: describe(participant).name, value, note });
            }
            if (results.length > 0) callbacks.onRolled?.(results);
          },
          { icon: 'dice' },
        );
        actions.push(rollAll);
      }

      const cancel = textButton('Cancel', () => close('cancel'));

      // The submit button carries a value. This makes an Escape dismissal,
      // where returnValue stays empty, read as a cancel, not as starting the
      // fight.
      const start = textButton('Start combat', undefined, {
        icon: 'sword',
        variant: 'primary',
        type: 'submit',
        value: 'start',
      });

      actions.push(cancel, start);
      return { body, actions, initialFocus: start };
    },
    result: (returnValue) => {
      if (returnValue !== 'start') return null;
      // A row the GM neither rolled nor typed still shows the placeholder of
      // 10 plus the modifier. Start rolls those rows, and logs them the same
      // way a press of Roll initiative does.
      if (callbacks.rollInitiative) {
        const rolled = rollUnsettled(roster, settled, callbacks.rollInitiative);
        for (const { participant, value } of rolled) {
          const input = inputs.get(participant.id);
          if (input) input.value = String(value);
        }
        if (rolled.length > 0) {
          callbacks.onRolled?.(
            rolled.map(({ participant, value, note }) => ({
              name: describe(participant).name,
              value,
              note,
            })),
          );
        }
      }
      return roster.map((p) => {
        const { surprised: _, ...rest } = p;
        const initiative = Number(inputs.get(p.id)?.value) || 0;
        return surprised.get(p.id)?.checked
          ? { ...rest, initiative, surprised: true }
          : { ...rest, initiative };
      });
    },
  });
}
