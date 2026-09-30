import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceHeals, presetHeals, withHeals } from '../src/entities/HealDice.js';
import { migrateItem } from '../src/entities/Equipment.js';
import { defaultEquipmentTemplates, normalizeLibrary } from '../src/library/Library.js';

test('each built-in healing potion lists its heal dice', () => {
  assert.deepEqual(presetHeals('Potion of Healing'), { count: 2, sides: 4, bonus: 2 });
  assert.deepEqual(presetHeals('Potion of Greater Healing'), { count: 4, sides: 4, bonus: 4 });
  assert.deepEqual(presetHeals('Potion of Superior Healing'), { count: 8, sides: 4, bonus: 8 });
  assert.deepEqual(presetHeals('Potion of Supreme Healing'), { count: 10, sides: 4, bonus: 20 });
  assert.equal(presetHeals('Antitoxin'), null);
});

test('coerceHeals keeps a valid record and rejects the rest', () => {
  assert.deepEqual(coerceHeals({ count: 3, sides: 6 }), { count: 3, sides: 6, bonus: 0 });
  assert.deepEqual(coerceHeals({ count: 2.7, sides: 20, bonus: 5.5 }), {
    count: 2,
    sides: 20,
    bonus: 5,
  });
  assert.deepEqual(coerceHeals({ count: 500, sides: 4, bonus: 5000 }), {
    count: 99,
    sides: 4,
    bonus: 999,
  });
  assert.deepEqual(coerceHeals({ count: 1, sides: 4, bonus: -3 }), {
    count: 1,
    sides: 4,
    bonus: 0,
  });
  assert.deepEqual(coerceHeals({ count: 1, sides: 4, bonus: 'x' }), {
    count: 1,
    sides: 4,
    bonus: 0,
  });
  assert.equal(coerceHeals(null), null);
  assert.equal(coerceHeals('2d4+2'), null);
  assert.equal(coerceHeals({ count: 0, sides: 4 }), null);
  assert.equal(coerceHeals({ count: 2, sides: 7 }), null);
  assert.equal(coerceHeals({ count: '2', sides: 4 }), null);
});

test('withHeals fills an older potion by name, and drops a broken heal', () => {
  const old = { name: 'Potion of Healing', type: 'consumable' };
  assert.deepEqual(withHeals(old).heals, { count: 2, sides: 4, bonus: 2 });
  const rope = { name: 'Rope', type: 'gear' };
  assert.equal(withHeals(rope), rope);
  const gearPotion = { name: 'Potion of Healing', type: 'gear' };
  assert.equal(withHeals(gearPotion), gearPotion);
  const renamed = { name: 'Red Vial', type: 'consumable', heals: { count: 1, sides: 8, bonus: 1 } };
  assert.deepEqual(withHeals(renamed), renamed);
  assert.deepEqual(withHeals({ name: 'Odd', type: 'consumable', heals: { count: -1 } }), {
    name: 'Odd',
    type: 'consumable',
  });
});

test('a saved item gets its heal on load, and the library templates list theirs', () => {
  const item = /** @type {any} */ ({
    id: 'p',
    name: 'Potion of Greater Healing',
    type: 'consumable',
    quantity: 1,
    notes: '',
  });
  assert.deepEqual(migrateItem(item).heals, { count: 4, sides: 4, bonus: 4 });
  const potion = defaultEquipmentTemplates().find((t) => t.name === 'Potion of Healing');
  assert.deepEqual(potion?.heals, { count: 2, sides: 4, bonus: 2 });
  const library = normalizeLibrary({
    equipment: [
      { name: 'Troll Draught', type: 'consumable', heals: { count: 3, sides: 6, bonus: 0 } },
      { name: 'Bad Brew', type: 'consumable', heals: { count: 3, sides: 5 } },
    ],
  });
  assert.deepEqual(library.equipment[0].heals, { count: 3, sides: 6, bonus: 0 });
  assert.equal(library.equipment[1].heals, undefined);
});
