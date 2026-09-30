import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encounterLabels, labelsFor, numberedNames } from '../src/combat/DisplayNames.js';

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

test('encounterLabels gives each fight foe its fight label, beside a namesake nearby', () => {
  const ordered = [
    { id: 'hero', name: 'Wren' },
    { id: 'near', name: 'Wolf' },
    { id: 'here', name: 'Wolf' },
    { id: 'fell', name: 'Wolf' },
  ];
  const fight = ['hero', 'here'];
  const labels = encounterLabels(ordered, fight, [['here'], ['near']]);
  assert.equal(labels.get('here'), labelsFor(ordered, fight).get('here'));
  assert.deepEqual(Object.fromEntries(labels), { here: 'Wolf', near: 'Wolf 2' });
});

test('encounterLabels keeps a defeated fight foe in the count', () => {
  // The first wolf fell. It leaves the Active list but stays in the fight,
  // so the second wolf keeps "Wolf 2" in both places.
  const ordered = [
    { id: 'fell', name: 'Wolf' },
    { id: 'here', name: 'Wolf' },
  ];
  const labels = encounterLabels(ordered, ['fell', 'here'], [['here'], []]);
  assert.deepEqual(Object.fromEntries(labels), { here: 'Wolf 2' });
});

test('encounterLabels numbers the other groups in order, each id once', () => {
  const ordered = [
    { id: 'w1', name: 'Wolf' },
    { id: 'w2', name: 'Wolf' },
    { id: 'w3', name: 'Wolf' },
    { id: 'g', name: 'Goblin' },
    { id: 'b', name: 'Bear' },
  ];
  const labels = encounterLabels(
    ordered,
    [],
    [
      ['w3', 'g'],
      ['w1', 'w2', 'w3', 'b'],
    ],
  );
  assert.deepEqual(Object.fromEntries(labels), {
    w3: 'Wolf 1',
    g: 'Goblin',
    w1: 'Wolf 2',
    w2: 'Wolf 3',
    b: 'Bear',
  });
  assert.deepEqual(Object.fromEntries(encounterLabels(ordered, ['w1'], [])), {});
});

test('encounterLabels follows a rename in both the fight and the panel', () => {
  // The GM renamed the second wolf "Alpha", so the first reads "Wolf".
  const ordered = [
    { id: 'w1', name: 'Wolf' },
    { id: 'w2', name: 'Alpha' },
  ];
  const fight = ['w1', 'w2'];
  const labels = encounterLabels(ordered, fight, [fight]);
  assert.deepEqual(Object.fromEntries(labels), Object.fromEntries(labelsFor(ordered, fight)));
});
