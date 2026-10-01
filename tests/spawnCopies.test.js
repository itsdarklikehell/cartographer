import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnCopies } from '../src/entities/CreatureTemplate.js';

const wolf = { id: 'wolf', name: 'Gray Wolf', disposition: 'hostile', maxHP: 11, stats: {} };
const at = { nodeId: 'vale', tileId: '3,4' };

test('spawnCopies gives each copy its own id past the taken ones', () => {
  const copies = spawnCopies(wolf, 3, at, ['gray-wolf']);
  assert.deepEqual(
    copies.map((c) => c.id),
    ['gray-wolf-2', 'gray-wolf-3', 'gray-wolf-4'],
  );
  for (const c of copies) {
    assert.equal(c.name, 'Gray Wolf');
    assert.equal(c.currentHP, 11);
    assert.deepEqual(c.location, at);
  }
});

test('spawnCopies spawns one copy for a count below 1 or not a number', () => {
  assert.equal(spawnCopies(wolf, 0, null, []).length, 1);
  assert.equal(spawnCopies(wolf, Number.NaN, null, []).length, 1);
  assert.equal(spawnCopies(wolf, 2.7, null, []).length, 2);
});
