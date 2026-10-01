import { slotLevelOf } from '../entities/SpellSlots.js';
import { formatCastingTime } from '../entities/SpellTiming.js';
import { capitalize } from '../util/text.js';

/**
 * The text of the spell cards in the Spellbook tab and of the slot count in
 * each level heading. This module is pure.
 */

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/**
 * One short line under a spell name: the school, the casting time without
 * its reaction trigger, and the range.
 * @param {Spell} spell
 * @returns {string}
 */
export function spellCardLine(spell) {
  const time = formatCastingTime(spell.castingTime).split(',')[0];
  return `${capitalize(spell.school)}, ${time}, ${spell.range}`;
}

/**
 * The free slots of one spell level, as "2 of 3 slots", summed over every
 * pool of that level (a pact pool counts too). The text is empty for a
 * cantrip and for a level with no slots.
 * @param {ResourcePool[]} pools
 * @param {number} level
 * @returns {string}
 */
export function levelSlotText(pools, level) {
  const matching = level > 0 ? pools.filter((p) => slotLevelOf(p) === level) : [];
  const max = matching.reduce((n, p) => n + p.max, 0);
  if (max === 0) return '';
  const free = matching.reduce((n, p) => n + p.current, 0);
  return `${free} of ${max} ${max === 1 ? 'slot' : 'slots'}`;
}
