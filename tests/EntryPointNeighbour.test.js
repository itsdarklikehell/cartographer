import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeParentReturnTile, resolveReturnTile } from '../src/map/EntryPoint.js';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { gridTiles } from './helpers/grid.js';

/**
 * A 10x10 town with an inn block at columns 4..5, rows 4..5 and a shop block
 * right under it at columns 3..5, rows 6..7.
 * @param {(x: number, y: number) => string | null} [link]
 */
function town(link = (x, y) => (x >= 4 && x <= 5 && y >= 4 && y <= 5 ? 'inn' : null)) {
  const shop = (/** @type {number} */ x, /** @type {number} */ y) =>
    x >= 3 && x <= 5 && y >= 6 && y <= 7 ? 'shop' : null;
  return {
    ...createMapNode('town', 'Briarwick', null, 10, 10),
    tiles: gridTiles(10, 10, (id, x, y) =>
      createTile(id, 'grass.svg', { childNodeId: link(x, y) ?? shop(x, y) }),
    ),
  };
}

const inn = {
  ...createMapNode('inn', 'Inn', 'town', 8, 8, { kind: 'interior' }),
  tiles: gridTiles(8, 8),
};

test('a door that faces the next block leads out onto plain ground beside it', () => {
  const exit = /** @type {import('../src/types/map.js').MapExit} */ ({
    kind: 'tile',
    tileId: '3,7',
    via: 'door',
    targetNodeId: 'town',
    targetName: 'Briarwick',
  });
  const back = computeParentReturnTile(town(), inn, exit, { nodeId: 'inn', tileId: '3,7' });
  // The projection lands on 4,6, which is the shop block. The nearest plain
  // tile is 3,5, the corner cell west of the inn.
  assert.equal(back, '3,5');
});

test('a link tile stands when no plain tile lies near the spot', () => {
  // Every tile links somewhere, as on a world map that regions cover.
  const world = town((x, y) => (x >= 4 && x <= 5 && y >= 4 && y <= 5 ? 'inn' : 'wild'));
  assert.equal(resolveReturnTile(world, '4,6', 'inn'), '4,6');
  // A plain tile far away does not pull the party across the map.
  world.tiles = world.tiles.map((t) => (t.id === '0,0' ? { ...t, childNodeId: null } : t));
  assert.equal(resolveReturnTile(world, '4,6', 'inn'), '4,6');
});

test('the first tile stands when no candidate id parses', () => {
  const odd = {
    ...createMapNode('town', 'Briarwick', null, 4, 4),
    tiles: [createTile('bogus', 'grass.svg')],
  };
  assert.equal(resolveReturnTile(odd, '1,1', 'inn'), 'bogus');
});

test('leaving The Wandering Kettle by its door lands on plain ground', () => {
  const { grid } = buildExampleCampaign(new TilePalette());
  const nodes = [...grid.nodes.values()];
  const kettle = nodes.find((n) => n.name === 'The Wandering Kettle');
  const parent = nodes.find((n) => n.id === kettle?.parentId);
  assert.ok(kettle && parent);
  const doors = kettle.tiles.filter((t) => t.imageRef.includes('door'));
  assert.ok(doors.length > 0);
  for (const door of doors) {
    const exit = /** @type {import('../src/types/map.js').MapExit} */ ({
      kind: 'tile',
      tileId: door.id,
      via: 'door',
      targetNodeId: parent.id,
      targetName: parent.name,
    });
    const back = computeParentReturnTile(parent, kettle, exit, {
      nodeId: kettle.id,
      tileId: door.id,
    });
    assert.equal(parent.tiles.find((t) => t.id === back)?.childNodeId ?? null, null, door.id);
  }
});
