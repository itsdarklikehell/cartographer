import { canCast } from './Casting.js';
import { toCaster } from './Caster.js';
import { heldRepeat } from './SpellRepeat.js';
import { invocationCast } from './Invocations.js';

/**
 * The ways a caster can pay for one spell, when it has more than one. A
 * caster that keeps a repeat open (Witch Bolt, Spiritual Weapon) can repeat
 * it for free or cast it anew with a slot, on a new target or at a higher
 * level. A warlock that casts a spell at will through an invocation and also
 * knows it can cast it at will or with a slot, and only the slot cast can be
 * upcast or aimed past the invocation's limits. The cast dialog asks first
 * when this list is not empty. Every function here is pure.
 */

/** @typedef {import('../types/cast.js').CastRoute} CastRoute */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The choices for a cast of this spell, or an empty list when there is only
 * one way to cast it.
 * @param {any} entity the real combatant that casts the spell
 * @param {Spell} spell the spell as the spell list offers it
 * @returns {{ id: CastRoute, label: string }[]}
 */
export function castRoutes(entity, spell) {
  const known = canCast(toCaster(entity), spell);
  if (!known) return [];
  if (spell.repeat && heldRepeat(entity, spell.id)) {
    return [
      { id: 'repeat', label: `Repeat (no slot)` },
      { id: 'anew', label: 'Cast anew with a slot' },
    ];
  }
  const invocation = invocationCast(entity, spell.id);
  if (!invocation || invocation.oncePerRest) return [];
  return [
    { id: 'invocation', label: `At will (${invocation.invocation.name})` },
    { id: 'slot', label: 'With a spell slot' },
  ];
}
