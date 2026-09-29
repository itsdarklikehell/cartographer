import { setTip } from './Tooltip.js';
import { labeled, fieldRow, numberField, checkbox, select } from './formFields.js';
import { CONDITIONS } from '../entities/Conditions.js';
import { DIE_SIZES } from '../entities/Equipment.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * A number field for the buff rows, with its tooltip.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {string} tip
 * @returns {HTMLInputElement}
 */
function number(value, min, max, tip) {
  const field = numberField(value, { min, max, className: 'form__number' });
  setTip(field, tip);
  return field;
}

/**
 * The spell form's controls for what a buff's chip changes besides a roll:
 * a flat AC bonus (Shield, Shield of Faith), a base AC for a holder without
 * body armor (Mage Armor), a floor under the holder's AC (Barkskin), a raise
 * to the HP maximum (Aid), temporary HP at the cast (False Life) or at the
 * start of each turn (Heroism), and a condition the holder can't take.
 * `ui/SpellForm.js` places the rows, calls `sync` when the effect kind
 * changes, and reads the values back with `read`. `entities/ChipMods.js` and
 * `entities/SpellFields.js` decide what they mean.
 * @param {Spell | null} spell the spell being edited, or null for a new one
 */
export function buildBuffControls(spell) {
  const effect = spell?.effect.kind === 'buff' ? spell.effect : null;
  const mods = effect?.mods ?? {};
  const ac = number(mods.ac ?? 0, -30, 30, 'Added to the AC of each target. Negative to lower it');
  const acBase = number(
    mods.acBase ?? 0,
    0,
    30,
    'Base AC before DEX for a target without body armor, as with Mage Armor',
  );
  const acMin = number(
    mods.acMin ?? 0,
    0,
    30,
    "The target's AC can't be lower than this, as with Barkskin",
  );
  const maxHP = number(
    mods.maxHP ?? 0,
    0,
    100,
    'Added to the HP maximum and current HP of each target while the chip lasts, as with Aid',
  );
  const maxHPPerStep = number(
    effect?.modsPerStep?.maxHP ?? 0,
    0,
    100,
    'More HP maximum per slot level above the base',
  );
  const temp = effect?.tempHP;
  const tempCount = number(
    temp?.count ?? 0,
    0,
    20,
    'Dice of temporary HP each target gains at the cast',
  );
  const tempSides = select(
    DIE_SIZES.map((n) => ({ value: String(n), label: `d${n}` })),
    String(temp?.sides ?? 4),
  );
  const tempFlat = number(
    temp?.flat ?? 0,
    0,
    100,
    'Temporary HP on top of the dice, as with the 4 of False Life',
  );
  const tempPerStep = number(
    temp?.flatPerStep ?? 0,
    0,
    100,
    'More temporary HP per slot level above the base',
  );
  const eachTurn = checkbox('Temp HP each turn', !!effect?.tempEachTurn);
  setTip(
    eachTurn.label,
    "The holder gains the caster's spell modifier as temporary HP at the start of each of its turns, as with Heroism",
  );
  const stored = mods.immune?.[0] ?? '';
  const immune = select(
    [
      { value: '', label: 'None' },
      ...(stored && !CONDITIONS.includes(stored) ? [stored] : []),
      ...CONDITIONS,
    ],
    stored,
  );
  const immuneField = labeled('Immune to', immune);
  setTip(immuneField, 'The holder ends this condition and cannot take it again, as with Heroism');

  const rows = {
    ac: fieldRow(
      labeled('AC bonus', ac),
      labeled('Unarmored base AC', acBase),
      labeled('Minimum AC', acMin),
    ),
    hp: fieldRow(
      labeled('Max HP bonus', maxHP),
      labeled('Per slot level', maxHPPerStep),
      immuneField,
    ),
    temp: fieldRow(
      labeled('Temp HP dice', tempCount),
      labeled('Die', tempSides),
      labeled('Plus', tempFlat),
      labeled('Per slot level', tempPerStep),
      eachTurn.label,
    ),
  };

  /** @param {string} kind */
  function sync(kind) {
    for (const row of Object.values(rows)) row.hidden = kind !== 'buff';
  }

  /** The control values, for `SpellDraft.assembleSpell`. */
  function read() {
    return {
      mods: {
        ac: ac.value,
        acBase: acBase.value,
        acMin: acMin.value,
        maxHP: maxHP.value,
        immune: immune.value ? [immune.value] : [],
      },
      modsPerStep: { maxHP: maxHPPerStep.value },
      tempHP: {
        count: tempCount.value,
        sides: tempSides.value,
        flat: tempFlat.value,
        flatPerStep: tempPerStep.value,
      },
      tempEachTurn: eachTurn.input.checked,
    };
  }

  return { rows, sync, read };
}
