import { test } from 'node:test';
import assert from 'node:assert/strict';
import { potionBlocked, potionHeals, potionSelection } from '../src/entities/Potions.js';
import { createCharacter } from '../src/entities/Character.js';

const HEALS = { count: 2, sides: 4, bonus: 2 };

test('a consumable reads its own heal dice, whatever its name', () => {
  assert.deepEqual(potionHeals({ type: 'consumable', heals: HEALS }), HEALS);
  assert.equal(potionHeals({ type: 'consumable' }), null);
  assert.equal(potionHeals({ type: 'gear', heals: HEALS }), null);
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
