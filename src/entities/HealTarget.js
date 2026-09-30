import { isDead } from './DeathSaves.js';
import { isDefeated } from './Creature.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * The chip that stops its holder from regaining hit points (Chill Touch), or
 * undefined. Temporary HP is not healing, so this chip does not stop it.
 * @param {Condition[] | undefined} conditions
 * @returns {Condition | undefined}
 */
export function healingBlockedBy(conditions) {
  return (conditions ?? []).find((chip) => chip.mods?.noHealing);
}

/**
 * Why a healing spell has no effect on a target, or null when it heals.
 *
 * A heal has no effect on a dead character (three failed death saves). It also
 * has no effect on a creature at 0 HP, because a creature rolls no death saves
 * and 0 HP takes it out of the fight. A spell that raises the dead
 * (`revives`) works the other way round: it has no effect on a target that is
 * not dead, and a dying character at 0 HP is not dead. A target with a chip
 * that stops healing (Chill Touch) regains nothing from a heal.
 * @param {'character' | 'creature'} kind
 * @param {Character | Creature} entity
 * @param {boolean} revives
 * @returns {'dead' | 'defeated' | 'living' | 'noHealing' | null}
 */
export function healBlocked(kind, entity, revives) {
  const down =
    kind === 'creature'
      ? isDefeated(/** @type {Creature} */ (entity))
      : isDead(/** @type {Character} */ (entity));
  if (revives) return down ? null : 'living';
  if (down) return kind === 'creature' ? 'defeated' : 'dead';
  return healingBlockedBy(entity.conditions) ? 'noHealing' : null;
}

/**
 * The log line of a healing spell that has no effect on its target.
 * @param {string} spellName
 * @param {string} targetName
 * @param {'dead' | 'defeated' | 'living' | 'noHealing'} reason
 * @returns {string}
 */
export function healBlockedLine(spellName, targetName, reason) {
  const state = {
    dead: 'is dead',
    defeated: 'is at 0 HP',
    living: 'is not dead',
    noHealing: 'cannot regain hit points',
  }[reason];
  return `${spellName} has no effect on ${targetName}, who ${state}.`;
}
