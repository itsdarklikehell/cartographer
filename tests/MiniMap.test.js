import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approximateCell, compassArea, miniMapTileSize, miniMapView } from '../src/map/MiniMap.js';
import { findRegionGroups } from '../src/map/RegionGroups.js';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { fillTiles, gridTiles } from './helpers/grid.js';

/** @typedef {import('../src/types/map.js').MapNode} MapNode */

/**
 * A parent painted from a picture, one row per string: a letter links that
 * cell to the child of the same name, and "." leaves it unlinked.
 * @param {string[]} rows
 * @returns {MapNode}
 */
function painted(rows) {
  return fillTiles(createMapNode('world', 'World', null, rows[0].length, rows.length), (id, x, y) =>
    createTile(id, 'grass.svg', { childNodeId: rows[y][x] === '.' ? null : rows[y][x] }),
  );
}

/** @param {string} id @param {number} [size] @returns {MapNode} */
function child(id, size = 9) {
  return { ...createMapNode(id, id, 'world', size, size), tiles: gridTiles(size, size) };
}

/** @param {MapNode} parent @param {string} id */
function group(parent, id) {
  const found = findRegionGroups(parent).find((g) => g.childNodeId === id);
  assert.ok(found);
  return found;
}

// A is a 3x3 square at (1..3, 0..2). B is an L whose top row reaches x 4.
const WORLD = painted(['.AAABB', '.AAAB.', '.AAAB.', '......']);
const L = painted(['BBB', 'B..', 'B..']);

test('approximateCell scales a child cell onto the block', () => {
  const a = group(WORLD, 'A');
  const node = child('A');
  assert.deepEqual(approximateCell(a, node, { x: 0, y: 0 }), { x: 1, y: 0 });
  assert.deepEqual(approximateCell(a, node, { x: 8, y: 8 }), { x: 3, y: 2 });
  assert.deepEqual(approximateCell(a, node, { x: 4, y: 4 }), { x: 2, y: 1 });
});

test('approximateCell moves a point outside a ragged block to its nearest cell', () => {
  const b = group(L, 'B');
  // The east edge of the child maps to (2, 1), which is outside the L.
  assert.deepEqual(approximateCell(b, child('B'), { x: 8, y: 4 }), { x: 2, y: 0 });
});

test('miniMapView is null for the world and for a node no parent tile links to', () => {
  const position = { nodeId: 'A', tileId: '0,0' };
  assert.equal(miniMapView(WORLD, null, position), null);
  assert.equal(miniMapView(child('C'), WORLD, position), null);
});

test('miniMapView marks the party in the node, on the parent, or nowhere', () => {
  const node = child('A');
  const inNode = miniMapView(node, WORLD, { nodeId: 'A', tileId: '8,0' });
  assert.equal(inNode?.parent, WORLD);
  assert.equal(inNode?.group.childNodeId, 'A');
  assert.deepEqual(inNode?.partyCell, { x: 3, y: 0 });

  const onParent = miniMapView(node, WORLD, { nodeId: 'world', tileId: '0,3' });
  assert.deepEqual(onParent?.partyCell, { x: 0, y: 3 });

  assert.equal(miniMapView(node, WORLD, { nodeId: 'B', tileId: '0,0' })?.partyCell, null);
  assert.equal(
    miniMapView(node, WORLD, { nodeId: 'A', tileId: 'entrance' })?.partyCell,
    null,
    'an id that is not a grid cell marks nothing',
  );
});

test('miniMapView uses the block the traveler entered through', () => {
  const twoMouths = painted(['A.A', '...']);
  const view = miniMapView(child('A'), twoMouths, { nodeId: 'A', tileId: '0,0' }, '2,0');
  assert.deepEqual(view?.partyCell, { x: 2, y: 0 });
});

test('miniMapTileSize fits the longest side and never drops below one pixel', () => {
  assert.equal(miniMapTileSize(40, 20, 160), 4);
  assert.equal(miniMapTileSize(6, 6, 160), 26);
  assert.equal(miniMapTileSize(500, 10, 160), 1);
  assert.equal(miniMapTileSize(0, 0, 160), 160);
});

test('compassArea names the third of the map a cell is in', () => {
  assert.equal(compassArea({ x: 0, y: 0 }, 9, 9), 'north-west');
  assert.equal(compassArea({ x: 4, y: 0 }, 9, 9), 'north');
  assert.equal(compassArea({ x: 8, y: 4 }, 9, 9), 'east');
  assert.equal(compassArea({ x: 4, y: 4 }, 9, 9), 'center');
  assert.equal(compassArea({ x: 8, y: 8 }, 9, 9), 'south-east');
  assert.equal(compassArea({ x: 0, y: 8 }, 0, 0), 'south-west');
});
