import { test } from 'node:test';
import assert from 'node:assert/strict';
import { potionBlocked, potionHeals, potionSelection } from '../src/entities/Potions.js';
import { createCharacter } from '../src/entities/Character.js';

test('each healing potion lists its heal dice', () => {
  assert.deepEqual(potionHeals('Potion of Healing'), { count: 2, sides: 4, bonus: 2 });
  assert.deepEqual(potionHeals('Potion of Greater Healing'), { count: 4, sides: 4, bonus: 4 });
  assert.deepEqual(potionHeals('Potion of Superior Healing'), { count: 8, sides: 4, bonus: 8 });
  assert.deepEqual(potionHeals('Potion of Supreme Healing'), { count: 10, sides: 4, bonus: 20 });
});

test('an item that is not a healing potion has no heal dice', () => {
  assert.equal(potionHeals('Antitoxin'), null);
  assert.equal(potionHeals('Mystery Flask'), null);
});

test('the heal rolls as a tray selection', () => {
  assert.deepEqual(potionSelection({ count: 4, sides: 4, bonus: 4 }), {
    counts: { d4: 4 },
    modifier: 4,
  });
});

test('a dead character cannot take a potion, and a dying one can', () => {
  const hero = createCharacter('h', 'Wren');
  assert.equal(potionBlocked(hero), null);
  const dying = { ...hero, deathSaves: { successes: 0, failures: 2, stable: false } };
  assert.equal(potionBlocked(dying), null);
  const dead = { ...hero, deathSaves: { successes: 0, failures: 3, stable: false } };
  assert.equal(potionBlocked(dead), 'Wren is dead. A potion does not help.');
});
