import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipName } from '../src/ui/CombatRibbon.js';

test('chipName splits the number that tells two foes apart', () => {
  assert.deepEqual(chipName('Gray Wolf 3'), { base: 'Gray Wolf', number: '3' });
  assert.deepEqual(chipName('  Gray   Wolf  12 '), { base: 'Gray Wolf', number: '12' });
});

test('chipName keeps a name with no number whole', () => {
  assert.deepEqual(chipName('Ser Aldric'), { base: 'Ser Aldric', number: null });
  assert.deepEqual(chipName('7'), { base: '7', number: null });
});

test('chipName marks an unresolved name', () => {
  assert.deepEqual(chipName(null), { base: '?', number: null });
  assert.deepEqual(chipName('   '), { base: '?', number: null });
});
