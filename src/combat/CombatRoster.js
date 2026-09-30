import { effectiveStatBlock, isDefeated } from '../entities/Creature.js';
import { encounterGroup, isOnTile } from '../entities/CreatureMap.js';
import { effectiveStats } from '../entities/Equipment.js';
import { abilityModifier } from '../entities/Modifiers.js';
import { createParticipant } from './Initiative.js';

/**
 * The combatants of a fight that starts where the party stands, and the log line
 * of the initiative roll. `app/encounterWiring.js` opens the setup dialog with
 * these.
 */

/**
 * The combatants are everyone involved in this encounter: the whole party,
 * the undefeated hostile creatures of the encounter group (the party's tile
 * and the tiles around it), and any friendly or neutral creature on the
 * party's own tile. Hostile creatures line up as foes. Friendly and neutral
 * ones line up with the party. Each combatant carries its
 * DEX modifier. This modifier seeds the default value (10 + modifier, the
 * passive baseline), adds to the d20 roll from Roll initiative, and shows
 * beside the name. The GM can edit every value by hand.
 * @param {import('../types/entities.js').Character[]} characters
 * @param {import('../types/creature.js').Creature[]} creatures
 * @param {import('../types/map.js').PartyPosition} position
 * @returns {import('../types/combat.js').Participant[]}
 */
export function combatRoster(characters, creatures, position) {
  /** @type {(id: string, stats: Record<string, number> | undefined) => import('../types/combat.js').Participant} */
  const withDex = (id, stats) => {
    const mod = abilityModifier(stats?.DEX ?? 10);
    return createParticipant(id, 10 + mod, mod);
  };
  // A defeated hostile stays staged but takes no part in a new fight. A
  // bystander on the party's tile joins whatever its condition. One on a
  // neighbouring tile stays out, because it is not part of the encounter.
  const roster = encounterGroup(creatures, position).filter((c) =>
    c.disposition === 'hostile' ? !isDefeated(c) : isOnTile(c, position),
  );
  return [
    ...characters.map((c) => withDex(c.id, effectiveStats(c))),
    ...roster.map((c) => withDex(c.id, effectiveStatBlock(c))),
  ];
}

/**
 * The travelogue line for one press of Roll initiative. It records every
 * result, and a roll that something slanted states why, in parentheses after
 * its value.
 * @param {{ name: string, value: number, note: string }[]} results
 * @returns {string}
 */
export function initiativeLine(results) {
  return `Initiative rolled: ${results
    .map((r) => `${r.name} ${r.value}${r.note ? ` (${r.note})` : ''}`)
    .join(', ')}.`;
}
