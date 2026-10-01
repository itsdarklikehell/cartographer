import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { FIT_MARGIN, MIN_FIT_CELLS, revealedExtent } from '../src/map/FitArea.js';
import { fillTiles } from './helpers/grid.js';

/** A width by height node with the given cells revealed. */
function nodeWith(revealed, width = 40, height = 30) {
  const set = new Set(revealed);
  return fillTiles(createMapNode('n', 'N', null, width, height), (id) =>
    createTile(id, 'grass', { revealed: set.has(id) }),
  );
}

test('revealedExtent frames the revealed tiles plus the margin', () => {
  assert.equal(FIT_MARGIN, 2);
  assert.deepEqual(revealedExtent(nodeWith(['5,5', '20,18'])), {
    x: 3,
    y: 3,
    width: 20,
    height: 18,
  });
});

test('revealedExtent grows a small box to the minimum, centered', () => {
  assert.equal(MIN_FIT_CELLS, 12);
  assert.deepEqual(revealedExtent(nodeWith(['20,15'])), { x: 15, y: 10, width: 12, height: 12 });
});

test('revealedExtent keeps the box inside the node', () => {
  assert.deepEqual(revealedExtent(nodeWith(['0,0'])), { x: 0, y: 0, width: 12, height: 12 });
  assert.deepEqual(revealedExtent(nodeWith(['39,29'])), { x: 28, y: 18, width: 12, height: 12 });
  assert.deepEqual(revealedExtent(nodeWith(['1,1'], 8, 6)), { x: 0, y: 0, width: 8, height: 6 });
});

test('revealedExtent is null with nothing revealed, and skips non-grid ids', () => {
  assert.equal(revealedExtent(nodeWith([])), null);
  const node = nodeWith([]);
  const odd = { ...node, tiles: [...node.tiles, createTile('extra', 'grass', { revealed: true })] };
  assert.equal(revealedExtent(odd), null);
});
