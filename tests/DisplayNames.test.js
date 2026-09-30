import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelsAcross, labelsFor, numberedNames } from '../src/combat/DisplayNames.js';

test('numberedNames numbers only the names that repeat', () => {
  const labels = numberedNames([
    { id: 'a', name: 'Bandit' },
    { id: 'w', name: 'Wren' },
    { id: 'b', name: 'Bandit' },
    { id: 'c', name: 'Bandit' },
  ]);
  assert.deepEqual(
    [...labels],
    [
      ['a', 'Bandit 1'],
      ['w', 'Wren'],
      ['b', 'Bandit 2'],
      ['c', 'Bandit 3'],
    ],
  );
});

test('labelsFor numbers within the given ids, in list order', () => {
  const ordered = [
    { id: 'a', name: 'Wolf' },
    { id: 'b', name: 'Wolf' },
    { id: 'c', name: 'Wolf' },
  ];
  assert.deepEqual(
    [...labelsFor(ordered, ['c', 'a'])],
    [
      ['a', 'Wolf 1'],
      ['c', 'Wolf 2'],
    ],
  );
  assert.deepEqual([...labelsFor(ordered, ['b'])], [['b', 'Wolf']]);
});

test('labelsAcross numbers through the groups in order, with no number twice', () => {
  const ordered = [
    { id: 'w1', name: 'Wolf' },
    { id: 'w2', name: 'Wolf' },
    { id: 'w3', name: 'Wolf' },
    { id: 'g', name: 'Goblin' },
  ];
  const labels = labelsAcross(ordered, [
    ['w3', 'g'],
    ['w1', 'w2', 'w3'],
  ]);
  assert.deepEqual(Object.fromEntries(labels), {
    w3: 'Wolf 1',
    g: 'Goblin',
    w1: 'Wolf 2',
    w2: 'Wolf 3',
  });
  assert.deepEqual(Object.fromEntries(labelsAcross(ordered, [])), {});
});
