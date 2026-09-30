import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MULTIATTACK,
  attackTraitFields,
  coerceMultiattack,
  swingsPerAction,
} from '../src/entities/CreatureAttacks.js';
import { createCreature, editCreature, withDefaults } from '../src/entities/Creature.js';
import { fromTemplate, toTemplate } from '../src/entities/CreatureTemplate.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { createParticipant } from '../src/combat/Initiative.js';
import { spend } from '../src/combat/ActionBudget.js';
import { attackDialog } from '../src/app/attackFields.js';
import { weaponAttack } from '../src/app/weaponAttack.js';
import { roll } from '../src/dice/DiceRoller.js';
import { stubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };
const SCIMITAR = /** @type {any} */ ({
  name: 'Scimitar',
  kind: 'melee',
  damage: [{ count: 1, sides: 6, damageType: 'slashing' }],
});

/** @param {Record<string, unknown>} [over] */
const boss = (over = {}) =>
  createCreature('boss', 'Boss', {
    disposition: 'hostile',
    maxHP: 20,
    location: HERE,
    weapon: SCIMITAR,
    multiattack: 2,
    ...over,
  });

test('coerceMultiattack keeps a count from 2 up to the ceiling', () => {
  assert.equal(coerceMultiattack(2), 2);
  assert.equal(coerceMultiattack('3.7'), 3);
  assert.equal(coerceMultiattack(99), MAX_MULTIATTACK);
  assert.equal(coerceMultiattack(1), undefined);
  assert.equal(coerceMultiattack(''), undefined);
  assert.equal(coerceMultiattack('x'), undefined);
  assert.equal(coerceMultiattack(undefined), undefined);
});

test('attackTraitFields stores a key only for a real Multiattack', () => {
  assert.deepEqual(attackTraitFields({ multiattack: '2' }), { multiattack: 2 });
  assert.deepEqual(attackTraitFields({ multiattack: 1 }), {});
  assert.deepEqual(attackTraitFields(undefined), {});
});

test('swingsPerAction reads Multiattack on a creature and Extra Attack on a character', () => {
  assert.equal(swingsPerAction(boss(), SCIMITAR), 2);
  assert.equal(swingsPerAction(boss({ multiattack: undefined }), SCIMITAR), 1);
  assert.equal(swingsPerAction(createCharacter('hero', 'Hero'), SCIMITAR), 1);
});

test('the creature model keeps Multiattack through load, edit, and template', () => {
  const creature = boss();
  assert.equal(creature.multiattack, 2);
  assert.equal(withDefaults({ ...creature, multiattack: 0 }).multiattack, undefined);
  assert.equal(withDefaults(creature).multiattack, 2);
  const { multiattack: _gone, ...older } = creature;
  assert.equal('multiattack' in withDefaults(/** @type {any} */ (older)), false);
  const edited = editCreature(creature, {
    name: 'Boss',
    disposition: 'hostile',
    maxHP: 20,
    location: HERE,
    multiattack: 3,
  });
  assert.equal(edited.multiattack, 3);
  const cleared = editCreature(creature, {
    name: 'Boss',
    disposition: 'hostile',
    maxHP: 20,
    location: HERE,
  });
  assert.equal('multiattack' in cleared, false);
  const template = toTemplate('t1', creature);
  assert.equal(template.multiattack, 2);
  assert.equal(fromTemplate(template, 'b2').multiattack, 2);
});

const hero = withHP(createCharacter('hero', 'Hero'), 40);

/** @param {import('../src/types/combat.js').Participant} participant */
const dialogFor = (participant, over = {}) =>
  attackDialog({
    attacker: boss(),
    defenders: [{ id: 'hero', name: 'Hero', ac: 10, conditions: [] }],
    participant,
    weapon: SCIMITAR,
    defenderId: null,
    offhand: false,
    reaction: false,
    ...over,
  });

test('the attack dialog offers the whole Multiattack while the action is unspent', () => {
  const box = dialogFor(createParticipant('boss')).fields.find((f) => f.name === 'multiattack');
  assert.equal(box?.label, 'Multiattack (roll all 2 attacks)');
  assert.equal(box?.value, true);
  const spent = spend(createParticipant('boss'), 'action');
  assert.equal(
    dialogFor(spent).fields.some((f) => f.name === 'multiattack'),
    false,
  );
  assert.equal(
    dialogFor(createParticipant('boss'), { offhand: true }).fields.some(
      (f) => f.name === 'multiattack',
    ),
    false,
  );
});

/** A fight of the boss against the hero, with dice that always roll high. */
function fight(heroHP = 40) {
  const app = stubApp({
    state: /** @type {any} */ ({
      characters: [withHP(createCharacter('hero', 'Hero'), heroHP)],
      creatures: [boss()],
      combat: { order: [{ id: 'boss' }, { id: 'hero' }] },
    }),
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
  /** @type {string[]} */
  const toasted = [];
  app.toasts = /** @type {any} */ ({ show: (/** @type {string} */ m) => toasted.push(m) });
  app.actions.spendBudget = () => true;
  app.actions.rollDice = /** @type {any} */ (
    (/** @type {any} */ selection) => ({ result: roll(selection, () => 0.99) })
  );
  return Object.assign(app, { toasted });
}

const attacks = (/** @type {string[]} */ log) => log.filter((l) => l.startsWith('Boss attacks'));

test('a ticked Multiattack rolls every swing against the picked target', async () => {
  const app = fight();
  await weaponAttack(app, /** @type {any} */ (app.state.combat), { id: 'boss' }, SCIMITAR, {
    prompt: async () => ({ target: 'hero', multiattack: '1' }),
  });
  assert.equal(attacks(app.log).length, 2);
});

test('an unticked Multiattack rolls one swing', async () => {
  const app = fight();
  await weaponAttack(app, /** @type {any} */ (app.state.combat), { id: 'boss' }, SCIMITAR, {
    prompt: async () => ({ target: 'hero', multiattack: '' }),
  });
  assert.equal(attacks(app.log).length, 1);
});

test('a Multiattack stops quietly once the target drops', async () => {
  const app = fight(1);
  await weaponAttack(app, /** @type {any} */ (app.state.combat), { id: 'boss' }, SCIMITAR, {
    prompt: async () => ({ target: 'hero', multiattack: '1' }),
  });
  assert.equal(attacks(app.log).length, 1);
  assert.ok(!app.toasted.some((m) => /down or gone/.test(m)));
});

test('an unarmed hero keeps its one swing', () => {
  assert.equal(swingsPerAction(hero, SCIMITAR), 1);
});

test('the library normalizer keeps a Multiattack count and drops a bad one', async () => {
  const { normalizeLibrary } = await import('../src/library/Library.js');
  const lib = normalizeLibrary({
    creatures: [
      { name: 'Twin Blade', maxHP: 10, multiattack: 2 },
      { name: 'One Blade', maxHP: 10, multiattack: 'no' },
    ],
  });
  const byName = Object.fromEntries(lib.creatures.map((c) => [c.name, c]));
  assert.equal(byName['Twin Blade'].multiattack, 2);
  assert.equal('multiattack' in byName['One Blade'], false);
});
