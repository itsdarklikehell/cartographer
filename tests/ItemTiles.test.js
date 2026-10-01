import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equip } from '../src/entities/Equipment.js';
import { createCharacter, addItem } from '../src/entities/Character.js';
import { tileText, shownItem } from '../src/view/ItemTiles.js';
import { item } from './helpers/fixtures.js';

test('a tile names the item, its stack, and whether it is worn', () => {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(
    hero,
    item('sword', 'Longsword', {
      type: 'weapon',
      damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
    }),
  );
  hero = addItem(hero, { ...item('arrow', 'Arrows', { type: 'gear' }), quantity: 20 });
  hero = equip(hero, 'mainHand', 'sword');
  assert.deepEqual(tileText(hero, hero.inventory[0]), {
    name: 'Longsword',
    stat: '1d8 slashing',
    count: '',
    equipped: true,
  });
  assert.deepEqual(tileText(hero, hero.inventory[1]), {
    name: 'Arrows',
    stat: '',
    count: 'x20',
    equipped: false,
  });
});

test('the detail pane falls back to the first item', () => {
  const a = item('a', 'A');
  const b = item('b', 'B');
  assert.equal(shownItem([a, b], 'b'), b);
  assert.equal(shownItem([a, b], 'gone'), a);
  assert.equal(shownItem([a, b], null), a);
  assert.equal(shownItem([], 'a'), null);
});
