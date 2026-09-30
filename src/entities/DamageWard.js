/**
 * The damage type that a reaction spell would resist in one hit, for the
 * pause after a damage roll (`app/damageWard.js`). A buff whose chip resists
 * types in `mods.resist`, or lets the caster pick one from `resistChoice`,
 * qualifies. Every function here is pure.
 */

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../dice/DiceRoller.js').DamageGroup} DamageGroup */
/** @typedef {import('../types/creature.js').DamageDefenses} DamageDefenses */

/**
 * The damage types a buff spell's chip can resist: its fixed list and its
 * pick list together. Any other spell resists nothing.
 * @param {Spell} spell
 * @returns {string[]}
 */
export function wardTypes(spell) {
  if (spell.effect.kind !== 'buff') return [];
  return [...(spell.effect.mods?.resist ?? []), ...(spell.effect.resistChoice ?? [])];
}

/**
 * The type in the hit that the spell would resist, or null when it would
 * change nothing. A type that the defender already resists or is immune to
 * gains nothing, so it does not count. With more than one type, the one that
 * deals the most damage wins, because the pick resists one type only.
 * @param {Spell} spell
 * @param {DamageGroup[]} groups the hit's damage, one group per type
 * @param {DamageDefenses} defenses what the defender already has
 * @returns {string | null}
 */
export function wardType(spell, groups, defenses) {
  const types = wardTypes(spell);
  const covered = new Set([...(defenses.resist ?? []), ...(defenses.immune ?? [])]);
  const best = groups
    .filter((g) => g.subtotal > 0 && types.includes(g.damageType) && !covered.has(g.damageType))
    .sort((a, b) => b.subtotal - a.subtotal)[0];
  return best ? best.damageType : null;
}
