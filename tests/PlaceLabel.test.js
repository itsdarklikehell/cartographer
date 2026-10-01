import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeLabel, placeLabels } from '../src/map/PlaceLabel.js';

/** @param {string} id @param {string} name @param {string | null} parentId */
const node = (id, name, parentId) =>
  /** @type {import('../src/types/map.js').MapNode} */ (
    /** @type {unknown} */ ({ id, name, parentId })
  );

const nodes = [
  node('w', 'World', null),
  node('a', 'Ashogate', 'w'),
  node('t1', 'Temple', 'a'),
  node('t2', 'Temple', 'gone'),
];

test('placeLabel adds the parent name after a comma', () => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  assert.equal(placeLabel(nodes[2], byId), 'Temple, Ashogate');
  assert.equal(placeLabel(nodes[1], byId), 'Ashogate, World');
});

test('placeLabel keeps the plain name of a root or an orphan', () => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  assert.equal(placeLabel(nodes[0], byId), 'World');
  assert.equal(placeLabel(nodes[3], byId), 'Temple');
});

test('placeLabels maps every node id to its label', () => {
  assert.deepEqual(
    [...placeLabels(nodes)],
    [
      ['w', 'World'],
      ['a', 'Ashogate, World'],
      ['t1', 'Temple, Ashogate'],
      ['t2', 'Temple'],
    ],
  );
});
