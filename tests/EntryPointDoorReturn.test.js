import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeParentReturnTile } from '../src/map/EntryPoint.js';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { gridTiles } from './helpers/grid.js';

const inBlock = (x, y) => x >= 4 && x <= 5 && y >= 4 && y <= 5;

// A 10x10 town whose 2x2 block at columns 4..5, rows 4..5 links to an 8x8
// interior.
const town = {
  ...createMapNode('town', 'Briarwick', null, 10, 10),
  tiles: gridTiles(10, 10, (id, x, y) =>
    createTile(id, 'grass.svg', { childNodeId: inBlock(x, y) ? 'inn' : null }),
  ),
};
const inn = {
  ...createMapNode('inn', 'Inn', 'town', 8, 8, { kind: 'interior' }),
  tiles: gridTiles(8, 8),
};

/** @param {string} tileId */
const door = (tileId) =>
  /** @type {import('../src/types/map.js').MapExit} */ ({
    kind: 'tile',
    tileId,
    via: 'door',
    targetNodeId: 'town',
    targetName: 'Briarwick',
  });

test('a door in the middle of a wall leads out beside the tile the party came in by', () => {
  const from = { nodeId: 'inn', tileId: '4,7' };
  // Without a way in, the projection of column 4 of 8 rounds to column 5.
  assert.equal(computeParentReturnTile(town, inn, door('4,7'), from), '5,6');
  assert.equal(computeParentReturnTile(town, inn, door('4,7'), from, '4,5'), '4,6');
  assert.equal(computeParentReturnTile(town, inn, door('4,7'), from, '4,4'), '4,6');
});

test('a door on a side wall keeps the row of the way in', () => {
  const from = { nodeId: 'inn', tileId: '7,3' };
  assert.equal(computeParentReturnTile(town, inn, door('7,3'), from, '5,5'), '6,5');
});

test('a way in that is not part of the block is ignored', () => {
  const from = { nodeId: 'inn', tileId: '4,7' };
  assert.equal(computeParentReturnTile(town, inn, door('4,7'), from, '0,0'), '5,6');
});
