// The region caches run on flat per-cell grids. These tests compare them with
// reference versions keyed by "x,y" strings, on generated worlds and on the
// odd tile ids that the grids hand back to the string path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { expandTree } from '../src/map/GeneratorTree.js';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { findRegionGroups } from '../src/map/RegionGroups.js';
import { groupOutline, regionSlots } from '../src/map/RegionOutline.js';
import { NEIGHBORS4, gridCellOf, parseCoords, tileIdAt } from '../src/map/MapGeometry.js';
import { mulberry32 } from '../src/util/Rng.js';

/** The flood fill over a Map keyed by tile id. */
function referenceGroups(node) {
  const byCoord = new Map();
  for (const tile of node.tiles) {
    const coords = tile.childNodeId ? parseCoords(tile.id) : null;
    if (coords) byCoord.set(tile.id, { tile, ...coords });
  }
  const visited = new Set();
  const groups = [];
  for (const [key, entry] of byCoord) {
    if (visited.has(key)) continue;
    const childNodeId = entry.tile.childNodeId;
    const stack = [entry];
    visited.add(key);
    const group = { childNodeId, tileIds: [], cells: [], minX: entry.x, minY: entry.y };
    Object.assign(group, { maxX: entry.x, maxY: entry.y });
    while (stack.length) {
      const c = stack.pop();
      group.tileIds.push(c.tile.id);
      group.cells.push({ x: c.x, y: c.y });
      group.minX = Math.min(group.minX, c.x);
      group.maxX = Math.max(group.maxX, c.x);
      group.minY = Math.min(group.minY, c.y);
      group.maxY = Math.max(group.maxY, c.y);
      for (const [dx, dy] of NEIGHBORS4) {
        const nKey = tileIdAt(c.x + dx, c.y + dy);
        if (visited.has(nKey)) continue;
        const n = byCoord.get(nKey);
        if (!n || n.tile.childNodeId !== childNodeId) continue;
        visited.add(nKey);
        stack.push(n);
      }
    }
    groups.push(group);
  }
  return groups;
}

/** The neighbor sets that regionSlots colors, over a Map keyed by tile id. */
function referenceTouches(groups) {
  const owner = new Map();
  for (const g of groups) for (const id of g.tileIds) owner.set(id, g.childNodeId);
  const touches = new Map();
  for (const g of groups) {
    const near = touches.get(g.childNodeId) ?? new Set();
    touches.set(g.childNodeId, near);
    for (const { x, y } of g.cells) {
      for (const [dx, dy] of NEIGHBORS4) {
        const other = owner.get(tileIdAt(x + dx, y + dy));
        if (other && other !== g.childNodeId) near.add(other);
      }
    }
  }
  return touches;
}

/** The smallest-last slots over the reference neighbor sets. */
function referenceSlots(groups) {
  const touches = referenceTouches(groups);
  const left = new Set(touches.keys());
  const order = [];
  while (left.size) {
    let pick = '';
    let fewest = Infinity;
    for (const id of left) {
      const n = [...touches.get(id)].filter((o) => left.has(o)).length;
      if (n < fewest || (n === fewest && id < pick)) [pick, fewest] = [id, n];
    }
    left.delete(pick);
    order.unshift(pick);
  }
  const slots = new Map();
  for (const id of order) {
    const taken = new Set([...touches.get(id)].map((o) => slots.get(o)));
    let slot = 0;
    while (taken.has(slot)) slot++;
    slots.set(id, slot);
  }
  return slots;
}

/** The outline edges of a group, over a Set of "x,y" strings. */
function referenceOutline(group) {
  const members = new Set(group.cells.map((c) => tileIdAt(c.x, c.y)));
  const edges = [];
  for (const { x, y } of group.cells) {
    for (const [dx, dy] of NEIGHBORS4) {
      if (members.has(tileIdAt(x + dx, y + dy))) continue;
      if (dx === 0) edges.push([x, dy < 0 ? y : y + 1, 'h']);
      else edges.push([dx < 0 ? x : x + 1, y, 'v']);
    }
  }
  return edges;
}

/** @param {import('../src/map/RegionOutline.js').OutlineEdge[]} edges */
const edgeKeys = (edges) =>
  edges.map((e) => (e.y1 === e.y2 ? [e.x1, e.y1, 'h'] : [e.x1, e.y1, 'v']));

/** The groups, outlines, and slots of a node equal the reference ones. */
function assertSameCaches(node) {
  const groups = findRegionGroups(node);
  const reference = referenceGroups(node);
  assert.deepEqual(groups, reference, node.id);
  for (const g of groups) assert.deepEqual(edgeKeys(groupOutline(g)), referenceOutline(g));
  assert.deepEqual([...regionSlots(groups)], [...referenceSlots(reference)]);
}

const palette = new TilePalette();

test('the example campaign gets the same groups, outlines, and slot rules', () => {
  const campaign = buildExampleCampaign(palette);
  for (const node of campaign.grid.nodes.values()) assertSameCaches(node);
});

test('a generated world tree gets the same groups, outlines, and slot rules', () => {
  let n = 0;
  const root = { id: 'w', name: 'W', kind: 'region', archetype: 'world', size: 'large' };
  const tree = expandTree(
    palette,
    { ...root, environ: null },
    { seed: 3, depth: 2, budget: 12 },
    () => `n${n++}`,
  );
  for (const t of tree.nodes) {
    assertSameCaches(withNodeTiles(createMapNode(t.id, t.name, null, t.width, t.height), t.tiles));
  }
});

test('random painted layouts get the same groups and outlines', () => {
  const rng = mulberry32(5);
  for (let round = 0; round < 20; round++) {
    const w = 3 + Math.floor(rng() * 12);
    const h = 3 + Math.floor(rng() * 12);
    const tiles = [];
    for (let i = 0; i < w * h; i++) {
      if (rng() < 0.1) continue;
      const pick = Math.floor(rng() * 4);
      tiles.push(
        createTile(tileIdAt(i % w, Math.floor(i / w)), 'g', {
          childNodeId: pick ? `c${pick}` : null,
        }),
      );
    }
    // Tile order decides which group comes first, so shuffle it.
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    assertSameCaches(withNodeTiles(createMapNode(`r${round}`, 'R', null, w, h), tiles));
  }
});

test('odd ids take the string path and still match the reference', () => {
  const linked = (id) => createTile(id, 'g', { childNodeId: 'a' });
  const base = [
    linked('1,1'),
    linked('2,1'),
    createTile('x', 'g', { childNodeId: 'a' }),
    createTile('3,3', 'g'),
  ];
  const cases = {
    'a non-canonical id': [...base, linked('01,2')],
    'a cell past the width': [...base, linked('9,1')],
    'two linked tiles with one id': [...base, linked('1,1')],
  };
  for (const [name, tiles] of Object.entries(cases)) {
    const node = withNodeTiles(createMapNode(name, name, null, 4, 4), tiles);
    assertSameCaches(node);
  }
  // An extent past the grid limit.
  const huge = withNodeTiles(createMapNode('huge', 'H', null, 2000, 2000), base.slice(0, 2));
  assertSameCaches(huge);
});

test('far apart groups fall back to keyed lookups for slots and outlines', () => {
  // A tile far past the extent makes the groups span more cells than the flat
  // grids allow, and an L of 2001 cells gives one group such a bounding box.
  let node = createMapNode('far', 'F', null, 4, 4);
  node = setTile(node, createTile('0,0', 'g', { childNodeId: 'a' }));
  node = setTile(node, createTile('1,0', 'g', { childNodeId: 'b' }));
  node = setTile(node, createTile('3000,3000', 'g', { childNodeId: 'c' }));
  assertSameCaches(node);
  const slots = regionSlots(findRegionGroups(node));
  assert.notEqual(slots.get('a'), slots.get('b'));

  const tiles = [];
  for (let i = 0; i <= 1000; i++) tiles.push(createTile(tileIdAt(i, 0), 'g', { childNodeId: 'l' }));
  for (let i = 1; i <= 1000; i++) tiles.push(createTile(tileIdAt(0, i), 'g', { childNodeId: 'l' }));
  const ell = withNodeTiles(createMapNode('ell', 'L', null, 1001, 1001), tiles);
  const [group] = findRegionGroups(ell);
  assert.deepEqual(edgeKeys(groupOutline(group)), referenceOutline(group));
});

test('gridCellOf reads only the ids that tileIdAt writes', () => {
  assert.equal(gridCellOf('3,2', 5, 5), 13);
  assert.equal(gridCellOf('0,0', 5, 5), 0);
  assert.equal(gridCellOf('10,0', 11, 1), 10);
  for (const id of [
    '01,2',
    '1,02',
    '1,2,3',
    '1,',
    ',2',
    'a,b',
    '1, 2',
    '1,-2',
    '',
    '1',
    '5,0',
    '0,5',
  ]) {
    assert.equal(gridCellOf(id, 5, 5), -1, id);
  }
});
