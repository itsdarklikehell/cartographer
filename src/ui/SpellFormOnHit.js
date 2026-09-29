import { setTip } from './Tooltip.js';
import { labeled, fieldRow, checkbox, select } from './formFields.js';
import { CONDITIONS } from '../entities/Conditions.js';
import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { CHIP_UNTILS, UNTIL_LABELS } from '../entities/SpellFields.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The spell form's controls for what an attack spell's hit does besides its
 * damage: a condition the hit imposes, with or without a save against it, and
 * the share of the damage the caster regains. `ui/SpellForm.js` places the
 * rows, calls `sync` when the effect kind changes, and reads the values back
 * with `read`. `entities/SpellDraft.js` decides what they mean.
 * @param {Spell | null} spell the spell being edited, or null for a new one
 */
export function buildOnHitControls(spell) {
  const attack = spell?.effect.kind === 'attack' ? spell.effect : null;
  const onHit = attack?.onHit ?? null;

  const imposes = checkbox('A hit imposes a condition', !!onHit);
  setTip(imposes.label, 'Ray of Sickness poisons the creature it hits unless it makes a CON save');
  const stored = onHit?.condition ?? '';
  const condition = select(
    [...(stored && !CONDITIONS.includes(stored) ? [stored] : []), ...CONDITIONS],
    stored || 'Poisoned',
  );
  const save = select(
    [{ value: '', label: 'No save' }, ...ABILITY_SCORES.map((a) => ({ value: a, label: a }))],
    onHit?.saveAbility ?? '',
  );
  const until = select(
    [
      { value: '', label: 'Spell duration' },
      ...CHIP_UNTILS.map((value) => ({ value, label: capitalize(UNTIL_LABELS[value]) })),
    ],
    onHit?.until ?? '',
  );
  const drain = select(
    [
      { value: '', label: 'Nothing' },
      { value: 'half', label: 'Half the damage' },
      { value: 'full', label: 'All the damage' },
    ],
    attack?.drain ?? '',
  );
  const drainField = labeled('Caster regains', drain);
  setTip(drainField, "The damage counts after the target's resistances, as with Vampiric Touch");

  const rows = {
    drain: fieldRow(drainField),
    imposes: fieldRow(imposes.label),
    onHit: fieldRow(labeled('Condition on a hit', condition), labeled('Save against it', save)),
    onHitUntil: fieldRow(labeled('Hit condition ends at', until)),
  };

  /**
   * Show the rows the effect kind uses. The condition rows show only once
   * their box is ticked.
   * @param {string} kind
   */
  function sync(kind) {
    const attacks = kind === 'attack';
    rows.drain.hidden = !attacks;
    rows.imposes.hidden = !attacks;
    rows.onHit.hidden = !attacks || !imposes.input.checked;
    rows.onHitUntil.hidden = rows.onHit.hidden;
  }

  /** @param {() => void} onChange */
  function listen(onChange) {
    imposes.input.addEventListener('change', onChange);
  }

  /** The control values, for `SpellDraft.assembleSpell`. */
  function read() {
    return {
      onHit: imposes.input.checked
        ? { condition: condition.value, saveAbility: save.value, until: until.value }
        : null,
      drain: drain.value,
    };
  }

  return { rows, sync, listen, read };
}
