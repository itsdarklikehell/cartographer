import { isDead } from './DeathSaves.js';
import { isDefeated } from './Creature.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * Why a healing spell has no effect on a target, or null when it heals.
 *
 * A heal has no effect on a dead character (three failed death saves). It also
 * has no effect on a creature at 0 HP, because a creature rolls no death saves
 * and 0 HP takes it out of the fight. A spell that raises the dead
 * (`revives`) works the other way round: it has no effect on a target that is
 * not dead, and a dying character at 0 HP is not dead.
 * @param {'character' | 'creature'} kind
 * @param {Character | Creature} entity
 * @param {boolean} revives
 * @returns {'dead' | 'defeated' | 'living' | null}
 */
export function healBlocked(kind, entity, revives) {
  const down =
    kind === 'creature'
      ? isDefeated(/** @type {Creature} */ (entity))
      : isDead(/** @type {Character} */ (entity));
  if (revives) return down ? null : 'living';
  if (!down) return null;
  return kind === 'creature' ? 'defeated' : 'dead';
}

/**
 * The log line of a healing spell that has no effect on its target.
 * @param {string} spellName
 * @param {string} targetName
 * @param {'dead' | 'defeated' | 'living'} reason
 * @returns {string}
 */
export function healBlockedLine(spellName, targetName, reason) {
  const state = { dead: 'is dead', defeated: 'is at 0 HP', living: 'is not dead' }[reason];
  return `${spellName} has no effect on ${targetName}, who ${state}.`;
}
