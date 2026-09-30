import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveAttackSides, weaponAttack } from '../src/app/weaponAttack.js';
import { roll } from '../src/dice/DiceRoller.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };
const ORDER = [{ id: 'hero' }, { id: 'goblin' }];

/** A hero and a goblin on one tile, with a fight running unless `combat` is null. */
function fight({
  hero = withHP(createCharacter('hero', 'Hero'), 12),
  combat = { order: ORDER },
} = {}) {
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    location: HERE,
    level: 1,
  });
  return stubApp({
    state: /** @type {any} */ ({ characters: [hero], creatures: [goblin], combat }),
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

test('liveAttackSides reads both sides from the live state', () => {
  const app = fight();
  const renamed = { ...app.state.creatures[0], name: 'Goblin boss' };
  // A cross-tab adoption replaces the goblin while the dialog is open.
  app.state.creatures = [renamed];
  const live = liveAttackSides(app, ORDER[0], 'goblin');
  assert.ok(!('refusal' in live));
  assert.equal(live.attacker, app.state.characters[0]);
  assert.equal(live.defender.name, 'Goblin boss');
});

test('liveAttackSides refuses once the fight has ended', () => {
  const app = fight({ combat: null });
  assert.deepEqual(liveAttackSides(app, ORDER[0], 'goblin'), {
    refusal: 'The fight ended before the attack rolled.',
  });
});

test('liveAttackSides refuses an attacker that can no longer act', () => {
  const hero = {
    ...withHP(createCharacter('hero', 'Hero'), 12),
    conditions: [{ name: 'Stunned', rounds: 1 }],
  };
  const live = liveAttackSides(fight({ hero: /** @type {any} */ (hero) }), ORDER[0], 'goblin');
  assert.match(/** @type {any} */ (live).refusal, /can no longer act/);
});

test('liveAttackSides refuses an attacker that left the fight', () => {
  const live = liveAttackSides(fight(), { id: 'ghost' }, 'goblin');
  assert.match(/** @type {any} */ (live).refusal, /can no longer act/);
});

test('liveAttackSides refuses a defender that is no longer a target', () => {
  const app = fight();
  app.state.creatures = [];
  assert.match(
    /** @type {any} */ (liveAttackSides(app, ORDER[0], 'goblin')).refusal,
    /down or gone/,
  );
});

const SWORD = /** @type {any} */ ({
  id: 'sword',
  name: 'Sword',
  type: 'weapon',
  kind: 'melee',
  quantity: 1,
  notes: '',
  damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
});

/**
 * A fight whose dice tray rolls at the middle of every die and whose budget
 * always pays, with a recorder for the toasts.
 */
function armed() {
  const app = fight();
  /** @type {string[]} */
  const toasted = [];
  app.toasts = /** @type {any} */ ({ show: (/** @type {string} */ m) => toasted.push(m) });
  app.actions.spendBudget = () => true;
  app.actions.rollDice = /** @type {any} */ (
    (/** @type {any} */ selection) => ({ result: roll(selection, () => 0.99) })
  );
  return Object.assign(app, { toasted });
}

test('weaponAttack rolls nothing when the GM closes the dialog', async () => {
  const app = armed();
  /** @type {string[]} */
  const titles = [];
  await weaponAttack(app, /** @type {any} */ (app.state.combat), ORDER[0], SWORD, {
    defenderId: 'goblin',
    prompt: async (title) => {
      titles.push(title);
      return null;
    },
  });
  assert.deepEqual(titles, ['Attack with Sword']);
  assert.deepEqual(app.log, []);
});

test('weaponAttack refuses a defender that went down while the dialog was open', async () => {
  const app = armed();
  await weaponAttack(app, /** @type {any} */ (app.state.combat), ORDER[0], SWORD, {
    prompt: async () => {
      app.state.creatures = [];
      return { target: 'goblin' };
    },
  });
  assert.deepEqual(app.toasted, ['That target is down or gone, so the attack did not roll.']);
  assert.deepEqual(app.log, []);
});

test('weaponAttack rolls the swing against the defender picked in the dialog', async () => {
  const app = armed();
  await weaponAttack(app, /** @type {any} */ (app.state.combat), ORDER[0], SWORD, {
    prompt: async (_title, fields) => ({ target: String(fields[0].value ?? 'goblin') }),
  });
  assert.match(app.log[0], /^Hero attacks Goblin with Sword/);
  assert.ok(app.state.creatures[0].currentHP < 10, 'the hit lands on the goblin');
});
