import { clampInt } from '../util/num.js';

/**
 * What a condition chip changes on its holder besides a d20 roll. A buff
 * spell such as Shield or Barkskin writes these fields onto the chip it
 * leaves, and the AC readers (`Armor.armorClass` for a character,
 * `Creature.effectiveStatBlock` for a creature) fold the chips in. The chip
 * goes away with its spell, so the change ends with it. Every function here
 * is pure.
 */

/** @typedef {import('../types/entities.js').ChipMods} ChipMods */
/** @typedef {import('../types/entities.js').Condition} Condition */

/** The largest AC a chip field can name. */
const MAX_AC = 30;

/**
 * A written mods block, or null when it changes nothing. A flat AC bonus can
 * be negative, for a chip that lowers AC. A base AC and a floor below 1 name
 * nothing, so they drop.
 * @param {unknown} value
 * @returns {ChipMods | null}
 */
export function normalizeChipMods(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const ac = clampInt(raw.ac, -MAX_AC, MAX_AC, 0);
  const acBase = clampInt(raw.acBase, 0, MAX_AC);
  const acMin = clampInt(raw.acMin, 0, MAX_AC);
  const mods = {
    ...(ac !== 0 ? { ac } : {}),
    ...(acBase > 0 ? { acBase } : {}),
    ...(acMin > 0 ? { acMin } : {}),
  };
  return Object.keys(mods).length > 0 ? mods : null;
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
  return parts.join(', ');
}
