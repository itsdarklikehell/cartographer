import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRegionEntryTile, nearestOutwardDoor } from '../src/map/EntryPoint.js';
import { expandTree } from '../src/map/GeneratorTree.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { tileKind } from '../src/map/TileKinds.js';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { parseCoords, tileIdAt } from '../src/map/MapGeometry.js';
import { gridTiles } from './helpers/grid.js';

const INTERIOR = 'assets/tiles/interior/interior';

/**
 * A 5x5 hall with outward doors at 0,2 and 4,2, a door at 2,0 that leads
 * further in, and a door between two rooms at 2,2, which has floor on every
 * side and so does not open outward.
 */
function hall() {
  const doors = new Map([
    ['0,2', null],
    ['4,2', null],
    ['2,0', 'vault'],
    ['2,2', null],
  ]);
  const tiles = gridTiles(5, 5, (id) =>
    doors.has(id)
      ? createTile(id, `${INTERIOR}-door-v.svg`, { childNodeId: doors.get(id) ?? null })
      : createTile(id, `${INTERIOR}-floor-1.svg`),
  );
  return withNodeTiles(createMapNode('hall', 'Hall', 'world', 5, 5, { kind: 'interior' }), tiles);
}

test('nearestOutwardDoor picks the outward door nearest the tile', () => {
  const node = hall();
  assert.equal(nearestOutwardDoor(node, '1,4'), '0,2');
  assert.equal(nearestOutwardDoor(node, '4,4'), '4,2');
  // The door into the vault is nearest, but it leads further in.
  assert.equal(nearestOutwardDoor(node, '2,0'), '0,2');
  // An unreadable tile id measures from the origin.
  assert.equal(nearestOutwardDoor(node, 'bogus'), '0,2');
});

test('nearestOutwardDoor returns null for an interior with no door out', () => {
  const node = withNodeTiles(
    createMapNode('cell', 'Cell', 'world', 3, 3, { kind: 'interior' }),
    gridTiles(3, 3, (id) => createTile(id, `${INTERIOR}-floor-1.svg`)),
  );
  assert.equal(nearestOutwardDoor(node, '1,1'), null);
});

test('an interior is entered on its door, and a region on its approach side', () => {
  const parent = withNodeTiles(createMapNode('world', 'World', null, 6, 6), [
    ...gridTiles(6, 6, (id) => createTile(id, 'grass.svg')).filter((t) => t.id !== '2,2'),
    createTile('2,2', 'town.svg', { childNodeId: 'hall' }),
  ]);
  const party = { nodeId: 'world', tileId: '2,4' };
  assert.equal(computeRegionEntryTile(parent, hall(), 'hall', party), '0,2');
  const region = { ...hall(), kind: /** @type {const} */ ('region') };
  assert.equal(computeRegionEntryTile(parent, region, 'hall', party), '2,4');
  // With no outward door, the party lands on the nearest walkable tile.
  const shut = withNodeTiles(
    createMapNode('hall', 'Hall', 'world', 5, 5, { kind: 'interior' }),
    gridTiles(5, 5, (id) => createTile(id, `${INTERIOR}-floor-1.svg`)),
  );
  assert.equal(computeRegionEntryTile(parent, shut, 'hall', party), '2,4');
});

test('every approach to Elmere Barrow lands on its door', () => {
  // A medium wilderness from seed 0 has a dungeon, Elmere Barrow. The floor
  // tile nearest some approaches to it is far from its door and near its
  // stairs down.
  let n = 0;
  const { nodes } = expandTree(
    new TilePalette(),
    {
      id: 'root',
      name: 'Wilds',
      kind: 'region',
      environ: null,
      archetype: 'wilderness',
      size: 'medium',
    },
    { seed: 0, depth: 1 },
    () => `n${++n}`,
  );
  const toNode = (/** @type {typeof nodes[number]} */ t) =>
    withNodeTiles(
      createMapNode(t.id, t.name, t.parentId, t.width, t.height, {
        kind: t.kind,
        environ: t.environ,
      }),
      t.tiles,
    );
  const barrow = nodes.find((t) => t.name === 'Elmere Barrow');
  assert.ok(barrow, 'the wilderness has Elmere Barrow');
  const parent = toNode(nodes[0]);
  const child = toNode(barrow);
  const marker = /** @type {{ x: number, y: number }} */ (
    parseCoords(
      /** @type {import('../src/types/map.js').Tile} */ (
        parent.tiles.find((t) => t.childNodeId === barrow.id)
      ).id,
    )
  );
  let approaches = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tileId = tileIdAt(marker.x + dx, marker.y + dy);
      const from = parent.tiles.find((t) => t.id === tileId);
      if (!from || from.childNodeId) continue;
      approaches++;
      const landed = computeRegionEntryTile(parent, child, barrow.id, { nodeId: 'root', tileId });
      const tile = child.tiles.find((t) => t.id === landed);
      assert.equal(tile && tileKind(tile), 'door', `approach from ${tileId}`);
    }
  }
  assert.ok(approaches > 0);
});
