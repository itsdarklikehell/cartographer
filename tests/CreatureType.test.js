import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  castTypeFields,
  coerceCreatureType,
  creatureTypeFields,
  creatureTypeOf,
  isImmuneToCondition,
  normalizeConditionImmunities,
} from '../src/entities/CreatureType.js';
import { createCreature, editCreature, withDefaults } from '../src/entities/Creature.js';
import { fromTemplate, toTemplate } from '../src/entities/CreatureTemplate.js';
import { DEFAULT_CREATURES } from '../src/data/creatures.js';
import { exampleBestiary, exampleCreatures } from '../src/campaign/ExampleCast.js';

test('coerceCreatureType reads an SRD type in any case and drops the rest', () => {
  assert.equal(coerceCreatureType(' Undead '), 'undead');
  assert.equal(coerceCreatureType('robot'), undefined);
  assert.equal(coerceCreatureType(undefined), undefined);
});

test('normalizeConditionImmunities keeps known conditions in canonical case', () => {
  assert.deepEqual(normalizeConditionImmunities(['poisoned', 'Poisoned', 'x', 'concentrating']), [
    'Poisoned',
  ]);
  assert.deepEqual(normalizeConditionImmunities('Poisoned'), []);
});

test('creatureTypeFields stores nothing for an untyped creature with no immunity', () => {
  assert.deepEqual(creatureTypeFields(undefined), {});
  assert.deepEqual(creatureTypeFields({ creatureType: 'robot', conditionImmunities: [] }), {});
  assert.deepEqual(creatureTypeFields({ creatureType: 'Ooze', conditionImmunities: ['prone'] }), {
    creatureType: 'ooze',
    conditionImmunities: ['Prone'],
  });
});

test('a character counts as humanoid and a creature reads its own type', () => {
  assert.equal(creatureTypeOf('character', {}), 'humanoid');
  assert.equal(creatureTypeOf('creature', { creatureType: 'beast' }), 'beast');
  assert.equal(creatureTypeOf('creature', {}), undefined);
  assert.equal(creatureTypeOf('creature', null), undefined);
});

test('isImmuneToCondition matches by name in any case', () => {
  assert.equal(isImmuneToCondition({ conditionImmunities: ['Poisoned'] }, 'poisoned'), true);
  assert.equal(isImmuneToCondition({ conditionImmunities: ['Poisoned'] }, 'Charmed'), false);
  assert.equal(isImmuneToCondition(null, 'Charmed'), false);
});

test('castTypeFields gives a character no immunity list', () => {
  assert.deepEqual(castTypeFields('character', { conditionImmunities: ['Charmed'] }), {
    creatureType: 'humanoid',
  });
  assert.deepEqual(castTypeFields('creature', { conditionImmunities: ['Charmed'] }), {
    conditionImmunities: ['Charmed'],
  });
  assert.deepEqual(castTypeFields('creature', {}), {});
});

test('the creature model stores, loads, edits, and templates the type fields', () => {
  const skel = createCreature('s', 'Skeleton', {
    creatureType: 'undead',
    conditionImmunities: ['poisoned'],
  });
  assert.equal(skel.creatureType, 'undead');
  assert.deepEqual(skel.conditionImmunities, ['Poisoned']);
  assert.equal('creatureType' in createCreature('p', 'Plain'), false);
  const loaded = withDefaults(/** @type {any} */ ({ ...skel, creatureType: 'Robot' }));
  assert.equal('creatureType' in loaded, false);
  assert.deepEqual(loaded.conditionImmunities, ['Poisoned']);
  const edited = editCreature(skel, {
    name: 'Skeleton',
    disposition: 'hostile',
    maxHP: 10,
    location: null,
    creatureType: 'construct',
  });
  assert.equal(edited.creatureType, 'construct');
  assert.equal('conditionImmunities' in edited, false);
  const template = toTemplate('t', skel);
  assert.equal(template.creatureType, 'undead');
  const spawned = fromTemplate(template, 'x');
  assert.deepEqual(spawned.conditionImmunities, ['Poisoned']);
  assert.notEqual(spawned.conditionImmunities, template.conditionImmunities);
});

test('every built-in bestiary entry and every example creature has a type', () => {
  for (const c of DEFAULT_CREATURES) assert.ok(c.creatureType, c.name);
  const cast = exampleCreatures(() => /** @type {any} */ ({ nodeId: 'n', tileId: 't' }));
  for (const c of cast) assert.ok(coerceCreatureType(c.creatureType), c.name);
  for (const c of exampleBestiary()) assert.ok(c.creatureType, c.name);
});

test('the library keeps a creature type, immunities, and spell type rules', async () => {
  const { normalizeLibrary } = await import('../src/library/Library.js');
  const lib = normalizeLibrary({
    creatures: [{ name: 'Mold', creatureType: 'Plant', conditionImmunities: ['blinded', 'x'] }],
    spells: [
      {
        name: 'Rot',
        level: 1,
        effect: {
          kind: 'save',
          saveAbility: 'CON',
          damage: [],
          typeRules: { skip: ['undead'], maxDamage: ['plant'] },
        },
      },
      {
        name: 'Mend',
        level: 1,
        effect: {
          kind: 'heal',
          healing: [],
          typeRules: { skip: ['construct'], disadvantage: ['ooze'] },
        },
      },
    ],
  });
  assert.equal(lib.creatures[0].creatureType, 'plant');
  assert.deepEqual(lib.creatures[0].conditionImmunities, ['Blinded']);
  assert.deepEqual(/** @type {any} */ (lib.spells[0].effect).typeRules, {
    skip: ['undead'],
    maxDamage: ['plant'],
  });
  assert.deepEqual(/** @type {any} */ (lib.spells[1].effect).typeRules, { skip: ['construct'] });
});
