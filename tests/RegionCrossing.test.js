import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossingFor, projectAlong, projectBack, sideCell } from '../src/map/RegionCrossing.js';
import { computeCrossingEntryTile } from '../src/map/EntryPoint.js';
import { findRegionGroups } from '../src/map/RegionGroups.js';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { fillTiles, gridTiles } from './helpers/grid.js';

/** @typedef {import('../src/types/map.js').MapNode} MapNode */

/**
 * A 6x6 parent painted with regions from a picture, one row per string: a
 * letter links that cell to the child of the same name, and "." leaves it
 * unlinked.
 * @param {string[]} rows
 * @returns {MapNode}
 */
function painted(rows) {
  return fillTiles(createMapNode('world', 'World', null, rows[0].length, rows.length), (id, x, y) =>
    createTile(id, 'grass.svg', { childNodeId: rows[y][x] === '.' ? null : rows[y][x] }),
  );
}

/**
 * @param {string} id
 * @param {{ kind?: 'region' | 'interior', parentId?: string }} [opts]
 * @returns {MapNode}
 */
function region(id, { kind = 'region', parentId = 'world' } = {}) {
  return { ...createMapNode(id, id, parentId, 4, 4, { kind }), tiles: gridTiles(4, 4) };
}

/** @param {MapNode} parent @param {string} id */
function group(parent, id) {
  const found = findRegionGroups(parent).find((g) => g.childNodeId === id);
  assert.ok(found);
  return found;
}

// A is an L: its top row reaches x 3, and its lower rows stop at x 1.
const L = painted(['AAAAB.', 'AABBB.', 'AABBB.', '......']);

test('projectAlong and projectBack map a coordinate between a block and a map', () => {
  assert.equal(projectAlong(4, 2, 6, 9), 4);
  assert.equal(projectAlong(3, 3, 3, 9), 4, 'a one-cell block maps to the middle');
  assert.equal(projectAlong(0, 2, 6, 9), 0, 'the result stays inside the map');
  assert.equal(projectBack(4, 9, 2, 6), 4);
  assert.equal(projectBack(0, 1, 2, 6), 4, 'a one-cell map maps to the middle of the block');
  assert.equal(projectBack(20, 9, 2, 6), 6);
});

test('sideCell steps past the outermost cell of the block in that row or column', () => {
  const a = group(L, 'A');
  assert.deepEqual(sideCell(a, 'east', 0), { x: 4, y: 0 });
  assert.deepEqual(sideCell(a, 'east', 1), { x: 2, y: 1 });
  assert.deepEqual(sideCell(a, 'south', 3), { x: 3, y: 1 });
  assert.deepEqual(sideCell(a, 'north', 0), { x: 0, y: -1 });
  assert.deepEqual(sideCell(a, 'west', 2), { x: -1, y: 2 });
  assert.equal(sideCell(a, 'east', 5), null, 'a row outside the block has no cell');
});

test('crossingFor follows the uneven border of a painted region', () => {
  const nodes = new Map([['B', region('B')]]);
  const byId = (/** @type {string} */ id) => nodes.get(id);
  const a = group(L, 'A');
  const child = region('A');
  // Row 0 of the 4x4 map projects to row 0 of the block, where B starts at x 4.
  assert.deepEqual(crossingFor(L, child, a, 'east', { x: 3, y: 0 }, byId), {
    target: nodes.get('B'),
    tileId: '4,0',
  });
  // Row 2 projects to row 1, where B starts at x 2.
  assert.equal(crossingFor(L, child, a, 'east', { x: 3, y: 2 }, byId)?.tileId, '2,1');
  // Past the south edge lies unlinked terrain, and past the west edge nothing.
  assert.equal(crossingFor(L, child, a, 'south', { x: 1, y: 3 }, byId), null);
  assert.equal(crossingFor(L, child, a, 'west', { x: 0, y: 1 }, byId), null);
});

test('crossingFor crosses only into an outdoor sibling that exists', () => {
  const parent = painted(['AB', 'AB']);
  const a = group(parent, 'A');
  const child = region('A');
  const at = { x: 3, y: 3 };
  const cross = (/** @type {MapNode | undefined} */ b) =>
    crossingFor(parent, child, a, 'east', at, () => b);
  assert.equal(cross(region('B'))?.tileId, '1,1');
  assert.equal(cross(undefined), null, 'a missing node');
  assert.equal(cross(region('B', { kind: 'interior' })), null, 'an interior');
  assert.equal(cross(region('B', { parentId: 'elsewhere' })), null, 'a node of another parent');
});

test('crossingFor never crosses into the region it leaves', () => {
  // A wraps around an unlinked hole, so walking east from the left column
  // meets A again only if the step skipped the outermost cell.
  const parent = painted(['AAA', 'A.A', 'AAA']);
  const a = group(parent, 'A');
  assert.equal(
    crossingFor(parent, region('A'), a, 'east', { x: 3, y: 1 }, () => undefined),
    null,
  );
});

test('the party lands where the crossing cell sits in the block of the next region', () => {
  const b = region('B');
  // B spans x 2-4 and y 0-2 of the L parent. Cell 4,0 is its top-right corner.
  assert.equal(computeCrossingEntryTile(L, b, '4,0'), '3,0');
  assert.equal(computeCrossingEntryTile(L, b, '2,1'), '0,2');
  // A cell that no block of B contains falls back to the middle of the map.
  assert.equal(computeCrossingEntryTile(painted(['A']), b, '0,0'), '2,2');
  assert.equal(computeCrossingEntryTile(L, b, 'nowhere'), '2,2');
});
