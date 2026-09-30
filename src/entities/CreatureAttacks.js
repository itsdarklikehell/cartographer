/**
 * The attack traits of a creature's stat block. Multiattack is how many times
 * the creature swings its weapon for one Attack action. A creature has one
 * weapon, so the trait is a plain count. The combat screen banks the extra
 * swings behind the Attack action the same way Extra Attack does for a
 * character.
 *
 * Pack Tactics is a flag. The fight has no positions, so the attack dialog
 * offers the advantage as a box for the GM to tick.
 *
 * Every function is pure. A creature with no trait stores no key, so an older
 * save loads as a creature with one attack.
 */

import { attacksPerAction } from './Features.js';

/** The most swings one Multiattack may list. A sanity ceiling on typed
 * input: the largest SRD Multiattack by weapon count stays under it. */
export const MAX_MULTIATTACK = 6;

/**
 * Read a typed or stored Multiattack count. A count below 2 means the
 * creature has no Multiattack, and a count above the ceiling stops at it.
 * @param {unknown} value
 * @returns {number | undefined}
 */
export function coerceMultiattack(value) {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count < 2) return undefined;
  return Math.min(count, MAX_MULTIATTACK);
}

/**
 * The attack trait fields to spread into a creature or a template. A creature
 * with no trait stores no key.
 * @param {{ multiattack?: unknown, packTactics?: unknown } | undefined} value
 * @returns {{ multiattack?: number, packTactics?: true }}
 */
export function attackTraitFields(value) {
  const multiattack = coerceMultiattack(value?.multiattack);
  return {
    ...(multiattack ? { multiattack } : {}),
    ...(value?.packTactics === true ? { packTactics: /** @type {const} */ (true) } : {}),
  };
}

/**
 * How many swings one Attack action buys this attacker with this weapon. A
 * character reads its Extra Attack features, and a creature reads its
 * Multiattack count. The larger number wins, because the two never add up.
 * @param {any} attacker a character or a creature
 * @param {import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon} weapon
 * @returns {number}
 */
export function swingsPerAction(attacker, weapon) {
  return Math.max(attacksPerAction(attacker, weapon), coerceMultiattack(attacker.multiattack) ?? 1);
}
