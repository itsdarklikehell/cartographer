import { clampInt } from '../util/num.js';

/**
 * What a condition chip changes on its holder besides a d20 roll. A buff
 * spell such as Shield or Barkskin writes these fields onto the chip it
 * leaves, and the AC readers (`Armor.armorClass` for a character,
 * `Creature.effectiveStatBlock` for a creature) fold the chips in. The HP
 * fields work through `entities/HPBuffs.js`, and `app/combatants.js` reads
 * the immunities when a chip lands. The chip goes away with its spell, so
 * the change ends with it. Every function here is pure.
 */

/** @typedef {import('../types/entities.js').ChipMods} ChipMods */
/** @typedef {import('../types/entities.js').Condition} Condition */

/** The largest AC a chip field can name. */
const MAX_AC = 30;

/** The largest HP maximum raise a chip can name. */
export const MAX_HP_BOOST = 100;

/** The most temporary HP a chip can grant at the start of a turn. */
const MAX_TEMP_EACH_TURN = 30;

/**
 * A written list of condition names, trimmed, with blanks and repeats
 * dropped. A repeat is a name that matches an earlier one without regard to
 * case.
 * @param {unknown} value
 * @returns {string[]}
 */
function nameList(value) {
  if (!Array.isArray(value)) return [];
  /** @type {string[]} */
  const names = [];
  for (const entry of value) {
    const name = typeof entry === 'string' ? entry.trim() : '';
    if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

/**
 * A written mods block, or null when it changes nothing. A flat AC bonus can
 * be negative, for a chip that lowers AC. A base AC, a floor, an HP raise,
 * and a temporary HP grant below 1 name nothing, so they drop.
 * @param {unknown} value
 * @returns {ChipMods | null}
 */
export function normalizeChipMods(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const ac = clampInt(raw.ac, -MAX_AC, MAX_AC, 0);
  const acBase = clampInt(raw.acBase, 0, MAX_AC);
  const acMin = clampInt(raw.acMin, 0, MAX_AC);
  const maxHP = clampInt(raw.maxHP, 0, MAX_HP_BOOST);
  const immune = nameList(raw.immune);
  const tempHPEachTurn = clampInt(raw.tempHPEachTurn, 0, MAX_TEMP_EACH_TURN);
  const mods = {
    ...(ac !== 0 ? { ac } : {}),
    ...(acBase > 0 ? { acBase } : {}),
    ...(acMin > 0 ? { acMin } : {}),
    ...(maxHP > 0 ? { maxHP } : {}),
    ...(immune.length > 0 ? { immune } : {}),
    ...(tempHPEachTurn > 0 ? { tempHPEachTurn } : {}),
  };
  return Object.keys(mods).length > 0 ? mods : null;
}

/**
 * The HP maximum raise of a holder's chips. Aid from two casts does not
 * stack, so the highest one wins.
 * @param {Condition[] | undefined} conditions
 * @returns {number}
 */
export function heldBoost(conditions) {
  let boost = 0;
  for (const chip of conditions ?? []) boost = Math.max(boost, chip.mods?.maxHP ?? 0);
  return boost;
}

/**
 * The chip on a holder that makes it immune to a condition, or undefined.
 * The match ignores case.
 * @param {Condition[] | undefined} conditions
 * @param {string} name
 * @returns {Condition | undefined}
 */
export function immunityTo(conditions, name) {
  const key = name.trim().toLowerCase();
  return (conditions ?? []).find((chip) =>
    (chip.mods?.immune ?? []).some((n) => n.toLowerCase() === key),
  );
}

/**
 * The mods of every chip on a holder, combined. The flat bonuses add up,
 * because Shield and Shield of Faith stack. A base AC and a floor do not
 * stack, so the highest of each wins. A holder with no such chip reads as
 * all zeros.
 * @param {Condition[] | undefined} conditions
 * @returns {{ ac: number, acBase: number, acMin: number }}
 */
export function heldMods(conditions) {
  const total = { ac: 0, acBase: 0, acMin: 0 };
  for (const chip of conditions ?? []) {
    const mods = chip.mods;
    if (!mods) continue;
    total.ac += mods.ac ?? 0;
    total.acBase = Math.max(total.acBase, mods.acBase ?? 0);
    total.acMin = Math.max(total.acMin, mods.acMin ?? 0);
  }
  return total;
}

/**
 * An AC with the flat chip bonuses added and the floor applied. The floor
 * comes last, so Barkskin's 16 is a minimum for the finished AC. Shield of
 * Faith on a holder with AC 12 gives 14, which the floor raises to 16, and
 * not 18.
 * @param {number} ac the AC before any chip
 * @param {{ ac: number, acMin: number }} mods from `heldMods`
 * @returns {number}
 */
export function withChipAC(ac, mods) {
  return Math.max(ac + mods.ac, mods.acMin);
}

/**
 * How a mods block reads on a chip tooltip and in the spell detail, for
 * example "+5 AC" or "AC at least 16". A block that changes nothing reads as
 * an empty string.
 * @param {ChipMods | undefined} mods
 * @returns {string}
 */
export function modsSummary(mods) {
  if (!mods) return '';
  const parts = [];
  if (mods.ac) parts.push(`${mods.ac > 0 ? '+' : ''}${mods.ac} AC`);
  if (mods.acBase) parts.push(`base AC ${mods.acBase} + DEX without armor`);
  if (mods.acMin) parts.push(`AC at least ${mods.acMin}`);
  if (mods.maxHP) parts.push(`+${mods.maxHP} max HP`);
  if (mods.immune) parts.push(`immune to ${mods.immune.join(' and ')}`);
  if (mods.tempHPEachTurn) parts.push(`${mods.tempHPEachTurn} temp HP each turn`);
  return parts.join(', ');
}
