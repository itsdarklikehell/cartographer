import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { findRegionGroups } from '../src/map/RegionGroups.js';
import { groupOutline, regionSlots } from '../src/map/RegionOutline.js';
import { revealAround } from '../src/map/FogOfWar.js';

/**
 * A node painted from rows of letters: each letter links its cell to the
 * child of that name, and "." leaves the cell unlinked.
 * @param {string[]} rows
 */
function painted(rows) {
  let node = createMapNode('n', 'Node', null, rows[0].length, rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      const childNodeId = cell === '.' ? null : cell;
      node = setTile(node, createTile(`${x},${y}`, 'grass.svg', { childNodeId }));
    });
  });
  return node;
}

/** @param {{ x1: number, y1: number, x2: number, y2: number }[]} edges */
const keys = (edges) => edges.map((e) => `${e.x1},${e.y1}-${e.x2},${e.y2}`).sort();

test('groupOutline traces the cell edges around a group, not its box', () => {
  const [group] = findRegionGroups(painted(['AA', 'A.']));
  assert.deepEqual(
    keys(groupOutline(group)),
    ['0,0-0,1', '0,0-1,0', '0,1-0,2', '0,2-1,2', '1,0-2,0', '1,1-1,2', '1,1-2,1', '2,0-2,1'].sort(),
  );
});

test('groupOutline rings a hole in the group too', () => {
  const group = findRegionGroups(painted(['AAA', 'A.A', 'AAA'])).find((g) => g.childNodeId === 'A');
  const edges = keys(groupOutline(/** @type {any} */ (group)));
  // Twelve edges around the outside, and four around the empty middle cell.
  assert.equal(edges.length, 16);
  for (const inner of ['1,1-2,1', '1,2-2,2', '1,1-1,2', '2,1-2,2'])
    assert.ok(edges.includes(inner));
});

test('groupOutline is cached on the group', () => {
  const [group] = findRegionGroups(painted(['A']));
  assert.equal(groupOutline(group), groupOutline(group));
});

test('regionSlots gives regions that touch different slots', () => {
  const slots = regionSlots(findRegionGroups(painted(['AB', 'CD'])));
  assert.notEqual(slots.get('A'), slots.get('B'));
  assert.notEqual(slots.get('A'), slots.get('C'));
  assert.notEqual(slots.get('B'), slots.get('D'));
  assert.notEqual(slots.get('C'), slots.get('D'));
  // A and D touch only at a corner, so they can share a slot, and two slots do.
  assert.equal(new Set(slots.values()).size, 2);
});

test('regionSlots gives every block of one child the same slot', () => {
  const slots = regionSlots(findRegionGroups(painted(['A.A', 'BBB'])));
  assert.equal(slots.size, 2);
  assert.notEqual(slots.get('A'), slots.get('B'));
});

test('regionSlots colors a wheel of regions with few slots', () => {
  // The middle region touches five regions around it, which all touch their
  // neighbors in a ring.
  const slots = regionSlots(
    findRegionGroups(painted(['.BBC.', 'FFMCC', 'FMMMD', 'EEMDD', '.EED.'])),
  );
  for (const [a, b] of [
    ['M', 'B'],
    ['M', 'C'],
    ['M', 'D'],
    ['M', 'E'],
    ['M', 'F'],
    ['B', 'C'],
    ['C', 'D'],
    ['D', 'E'],
    ['E', 'F'],
    ['F', 'B'],
  ]) {
    assert.notEqual(slots.get(a), slots.get(b), `${a} and ${b}`);
  }
  assert.ok(Math.max(...slots.values()) < 6);
});

test('regionSlots is the same for the same layout, and memoized on the groups', () => {
  const groups = findRegionGroups(painted(['AB']));
  assert.equal(regionSlots(groups), regionSlots(groups));
  assert.deepEqual([...regionSlots(findRegionGroups(painted(['AB'])))], [...regionSlots(groups)]);
});

test('a fog reveal keeps the region slots and outlines of the node', () => {
  const node = painted(['AB', 'CD']);
  const groups = findRegionGroups(node);
  const slots = regionSlots(groups);
  const outline = groupOutline(groups[0]);
  const revealed = revealAround(node, '0,0', 3);
  assert.notEqual(revealed, node);
  assert.equal(findRegionGroups(revealed), groups);
  assert.equal(regionSlots(findRegionGroups(revealed)), slots);
  assert.equal(groupOutline(findRegionGroups(revealed)[0]), outline);
});
