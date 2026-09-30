import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weaponIsMagical } from '../src/entities/MagicWeapon.js';

/** A warlock of `level` who carries two weapons, with the pact weapon set to
 * item `blade`. */
function bladeLock(level, pactBoon = 'blade') {
  return {
    id: 'w',
    classes: [{ classId: 'warlock', level }],
    level,
    pactBoon,
    pactWeapon: 'blade',
    inventory: [
      { id: 'blade', name: 'Longsword', type: 'weapon' },
      { id: 'axe', name: 'Handaxe', type: 'weapon' },
    ],
  };
}

test('a flagged weapon counts as magical for anyone, and a plain one does not', () => {
  assert.equal(weaponIsMagical(null, { magical: true }), true);
  assert.equal(weaponIsMagical({ id: 'goblin' }, { id: 'sword' }), false);
  assert.equal(weaponIsMagical(undefined, {}), false);
});

test('the pact weapon of a Pact of the Blade warlock counts as magical', () => {
  assert.equal(weaponIsMagical(bladeLock(3), { id: 'blade' }), true);
  assert.equal(weaponIsMagical(bladeLock(3), { id: 'axe' }), false, 'another weapon');
  assert.equal(weaponIsMagical(bladeLock(3), {}), false, 'a creature weapon has no id');
  assert.equal(weaponIsMagical(bladeLock(3, 'tome'), { id: 'blade' }), false, 'no blade boon');
  assert.equal(weaponIsMagical(bladeLock(2), { id: 'blade' }), false, 'below 3rd level');
});
