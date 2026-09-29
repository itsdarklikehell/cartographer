import { normalizeDamagePart } from './Equipment.js';
import { ABILITY_SCORES } from './Modifiers.js';
import { clampInt } from '../util/num.js';

/**
 * Normalizers for the spell fields beyond a single roll: damage that stays on
 * a target, the turn boundary that ends a chip, a spell that the caster uses
 * again without a new slot, and what a hit does besides its damage (a save or
 * a chip on the target, and hit points back to the caster). The authoring form
 * (through `SpellDraft.js`) and the library import (through `Library.js`)
 * share these functions, so a typed spell and an imported one never disagree
 * about what a value means. Each one returns null, or an empty object, for a
 * value that says nothing usable, and the caller then leaves the field off
 * the spell. Every function here is pure.
 */

/** @typedef {import('../types/spell.js').ChipUntil} ChipUntil */
/** @typedef {import('../types/spell.js').SpellOngoing} SpellOngoing */
/** @typedef {import('../types/spell.js').SpellRepeat} SpellRepeat */
/** @typedef {import('../types/spell.js').SpellOnHit} SpellOnHit */
/** @typedef {import('../types/spell.js').SpellDrain} SpellDrain */
/** @typedef {import('../types/spell.js').Ability} Ability */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

/** The turn boundaries a chip can end at, in the order the form lists them.
 * @type {ChipUntil[]} */
export const CHIP_UNTILS = ['caster-start', 'caster-end', 'target-end'];

/** How each boundary reads in the form and the spell detail.
 * @type {Record<ChipUntil, string>} */
export const UNTIL_LABELS = {
  'caster-start': "the start of the caster's next turn",
  'caster-end': "the end of the caster's next turn",
  'target-end': "the end of the target's next turn",
};

/** The costs a repeat can take. @type {('action' | 'bonus')[]} */
export const REPEAT_COSTS = ['action', 'bonus'];

/** The shares of dealt damage a draining spell gives back. @type {SpellDrain[]} */
export const DRAINS = ['half', 'full'];

/**
 * A written boundary, or null when the value names none.
 * @param {unknown} value
 * @returns {ChipUntil | null}
 */
export function normalizeUntil(value) {
  return CHIP_UNTILS.includes(/** @type {ChipUntil} */ (value))
    ? /** @type {ChipUntil} */ (value)
    : null;
}

/**
 * A written list of damage terms, each one repaired. A value that is not a
 * list reads as no terms.
 * @param {unknown} value
 * @returns {DamagePart[]}
 */
export function normalizeParts(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((p) => p && typeof p === 'object').map((p) => normalizeDamagePart(p));
}

/**
 * A written ongoing-damage block, or null when it deals nothing. Damage that
 * rolls no dice on a later turn is not a later-turn effect, so the block needs
 * at least one term.
 * @param {unknown} value
 * @returns {SpellOngoing | null}
 */
export function normalizeOngoing(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const damage = normalizeParts(raw.damage);
  if (damage.length === 0) return null;
  const perStep = normalizeParts(raw.perStep);
  const until = normalizeUntil(raw.until);
  return {
    damage,
    ...(perStep.length > 0 ? { perStep } : {}),
    ...(until ? { until } : {}),
  };
}

/**
 * A written repeat block, or null when the spell has none. An empty block is
 * a real repeat: it costs what the casting time costs and resolves the
 * spell's own effect again.
 * @param {unknown} value
 * @returns {SpellRepeat | null}
 */
export function normalizeRepeat(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const cost = REPEAT_COSTS.includes(/** @type {'action'} */ (raw.cost))
    ? /** @type {'action' | 'bonus'} */ (raw.cost)
    : null;
  const damage = normalizeParts(raw.damage);
  return { ...(cost ? { cost } : {}), ...(damage.length > 0 ? { damage } : {}) };
}

/**
 * A written on-hit block, or null when it names no condition. A save ability
 * outside the six drops, and the hit then imposes the condition with no save.
 * @param {unknown} value
 * @returns {SpellOnHit | null}
 */
export function normalizeOnHit(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const condition = typeof raw.condition === 'string' ? raw.condition.trim() : '';
  if (!condition) return null;
  const saveAbility = ABILITY_SCORES.includes(/** @type {string} */ (raw.saveAbility))
    ? /** @type {Ability} */ (raw.saveAbility)
    : null;
  const until = normalizeUntil(raw.until);
  return { condition, ...(saveAbility ? { saveAbility } : {}), ...(until ? { until } : {}) };
}

/**
 * The later-turn and on-hit fields an attack effect has, from a written effect. Each
 * flag is kept only when it is true, so an effect written before the flags
 * existed comes back unchanged.
 * @param {Record<string, unknown>} raw
 * @returns {Partial<import('../types/spell.js').SpellAttackEffect>}
 */
export function attackExtras(raw) {
  const ongoing = normalizeOngoing(raw.ongoing);
  const onHit = normalizeOnHit(raw.onHit);
  const drain = DRAINS.includes(/** @type {SpellDrain} */ (raw.drain))
    ? /** @type {SpellDrain} */ (raw.drain)
    : null;
  return {
    ...(raw.melee === true ? { melee: true } : {}),
    ...(raw.halfOnMiss === true ? { halfOnMiss: true } : {}),
    ...(raw.addsModifier === true ? { addsModifier: true } : {}),
    ...(ongoing ? { ongoing } : {}),
    ...(onHit ? { onHit } : {}),
    ...(drain ? { drain } : {}),
  };
}

/**
 * The later-turn fields a save effect has, from a written effect. A
 * boundary means something only for a chip, so it needs a condition.
 * @param {Record<string, unknown>} raw
 * @param {string} condition the condition the save imposes, or empty
 * @returns {Partial<import('../types/spell.js').SpellSaveEffect>}
 */
export function saveExtras(raw, condition) {
  const until = condition ? normalizeUntil(raw.until) : null;
  const ongoing = normalizeOngoing(raw.ongoing);
  return { ...(until ? { until } : {}), ...(ongoing ? { ongoing } : {}) };
}

/**
 * A written slot-levels-per-increment count, or 0 for the default of one.
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeLevelsPerStep(value) {
  const levels = clampInt(value, 0, 9);
  return levels > 1 ? levels : 0;
}
