import { coerceCR } from '../data/challenge.js';
import { normalizeStatBlock } from './Modifiers.js';
import { copyEnemyWeapon } from './EquipmentPresets.js';
import { copySpellbook } from './CharacterSpellbook.js';
import { casterTemplateFields } from './Caster.js';
import { creatureProficiencyFields } from './Proficiencies.js';
import { defenseFields } from './DamageDefenses.js';
import { creatureTypeFields } from './CreatureType.js';
import { attackTraitFields } from './CreatureAttacks.js';
import { DISPOSITIONS, createCreature } from './Creature.js';

/**
 * Creature templates: the reusable blueprint of a creature that the library
 * keeps and that the GM saves from an encounter row. Every function here is
 * pure.
 */

/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/**
 * Capture a creature as a reusable template: its blueprint (name,
 * disposition, max HP, stat block, gear), not its live state (current HP,
 * location, conditions, met).
 * @param {string} id
 * @param {Creature} creature
 * @returns {CreatureTemplate}
 */
export function toTemplate(id, creature) {
  const cr = coerceCR(creature.cr);
  return {
    id,
    name: creature.name,
    disposition: creature.disposition ?? 'neutral',
    maxHP: creature.maxHP,
    stats: normalizeStatBlock(creature.stats ?? {}),
    weapon: creature.weapon ?? null,
    armor: creature.armor ?? null,
    ...(creature.level != null ? { level: creature.level, tier: creature.tier ?? 'mob' } : {}),
    ...(cr === undefined ? {} : { cr }),
    ...creatureProficiencyFields(creature.proficiencies),
    ...defenseFields(creature.defenses),
    ...creatureTypeFields(creature),
    ...attackTraitFields(creature),
    ...(creature.role !== undefined ? { role: creature.role } : {}),
    ...(creature.notes !== undefined ? { notes: creature.notes } : {}),
    ...casterTemplateFields(creature),
  };
}

/**
 * Spawn a fresh, full-health creature from a template. Every field carried
 * over is copied, not aliased. A template is shared library data (the
 * built-in list hands out the same entry object to every spawn), so two
 * creatures from one template must not edit one weapon, armor, or
 * spellbook through each other.
 *
 * The read is tolerant on purpose: a library file has no version field, so
 * an imported or hand-edited template can carry an older shape. A
 * `statBlock` field reads as `stats`. A missing disposition reads as
 * hostile, because only foe templates predate the field. Absent gear takes
 * the level default on a leveled template and null on an unleveled one,
 * which is what absence meant in each older shape.
 * @param {CreatureTemplate & { statBlock?: Record<string, number> }} template
 * @param {string} id
 * @param {EncounterLocation | null} [location]
 * @returns {Creature}
 */
export function fromTemplate(template, id, location = null) {
  const level = Number(template.level);
  return createCreature(id, template.name, {
    disposition: DISPOSITIONS.includes(template.disposition) ? template.disposition : 'hostile',
    maxHP: template.maxHP,
    stats: { ...(template.stats ?? template.statBlock ?? {}) },
    location,
    ...(Number.isFinite(level) ? { level, tier: template.tier ?? 'mob' } : {}),
    cr: template.cr,
    // The normalizer builds fresh lists, so a spawn never shares the arrays of
    // the shared template entry.
    proficiencies: template.proficiencies,
    defenses: template.defenses,
    creatureType: template.creatureType,
    conditionImmunities: template.conditionImmunities,
    multiattack: template.multiattack,
    packTactics: template.packTactics,
    ...(template.weapon !== undefined
      ? { weapon: template.weapon ? copyEnemyWeapon(template.weapon) : template.weapon }
      : {}),
    ...(template.armor !== undefined
      ? { armor: template.armor ? { ...template.armor } : template.armor }
      : {}),
    ...(template.role !== undefined ? { role: template.role } : {}),
    ...(template.notes !== undefined ? { notes: template.notes } : {}),
    class: template.class,
    subclass: template.subclass,
    casterLevel: template.casterLevel,
    spellbook: template.spellbook ? copySpellbook(template.spellbook) : template.spellbook,
  });
}
