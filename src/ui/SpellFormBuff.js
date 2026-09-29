import { setTip } from './Tooltip.js';
import { labeled, fieldRow, numberField } from './formFields.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The spell form's controls for what a buff's chip changes besides a roll:
 * a flat AC bonus (Shield, Shield of Faith), a base AC for a holder without
 * body armor (Mage Armor), and a floor under the holder's AC (Barkskin).
 * `ui/SpellForm.js` places the row, calls `sync` when the effect kind
 * changes, and reads the values back with `read`. `entities/ChipMods.js`
 * decides what they mean.
 * @param {Spell | null} spell the spell being edited, or null for a new one
 */
export function buildBuffControls(spell) {
  const mods = spell?.effect.kind === 'buff' ? (spell.effect.mods ?? {}) : {};
  const ac = numberField(mods.ac ?? 0, { min: -30, max: 30, className: 'form__number' });
  setTip(ac, 'Added to the AC of each target. Negative to lower it');
  const acBase = numberField(mods.acBase ?? 0, { min: 0, max: 30, className: 'form__number' });
  setTip(acBase, 'Base AC before DEX for a target without body armor, as with Mage Armor');
  const acMin = numberField(mods.acMin ?? 0, { min: 0, max: 30, className: 'form__number' });
  setTip(acMin, "The target's AC can't be lower than this, as with Barkskin");

  const rows = {
    ac: fieldRow(
      labeled('AC bonus', ac),
      labeled('Unarmored base AC', acBase),
      labeled('Minimum AC', acMin),
    ),
  };

  /** @param {string} kind */
  function sync(kind) {
    rows.ac.hidden = kind !== 'buff';
  }

  /** The control values, for `SpellDraft.assembleSpell`. */
  function read() {
    return { mods: { ac: ac.value, acBase: acBase.value, acMin: acMin.value } };
  }

  return { rows, sync, read };
}
