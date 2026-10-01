import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { expandTree } from '../src/map/GeneratorTree.js';
import { worldStart } from '../src/map/WorldStart.js';
import { tileKind } from '../src/map/TileKinds.js';

/** @param {string} id @param {string} imageRef @param {string | null} [childNodeId] */
const tile = (id, imageRef, childNodeId = null) => ({
  id,
  imageRef,
  overlayRef: null,
  metadata: { poiType: null, discoverable: false, discovered: false, notes: '' },
  revealed: false,
  childNodeId,
});
const GRASS = 'assets/tiles/grass/grass-1.svg';

/** @param {string} id @param {string | null} parentId @param {'region' | 'interior'} kind @param {any[]} tiles */
const node = (id, parentId, kind, tiles = []) => ({
  id,
  parentId,
  name: id,
  kind,
  environ: null,
  width: 3,
  height: 3,
  tiles,
  entry: '0,0',
});

test('a generated world starts the party on open land next to a town', () => {
  let n = 0;
  const { nodes } = expandTree(
    new TilePalette(),
    { id: 'root', name: 'World', kind: 'region', archetype: 'world', size: 'medium' },
    { seed: 7, depth: 9 },
    () => `n${n++}`,
  );
  const start = worldStart(nodes);
  assert.ok(start);
  const region = nodes.find((x) => x.id === start.nodeId);
  assert.equal(region?.parentId, 'root');
  const at = region?.tiles.find((t) => t.id === start.tileId);
  assert.ok(at && !at.childNodeId);
  assert.notEqual(tileKind(at), 'wall');
});

test('the start skips water, walls, and links, and prefers a side over a corner', () => {
  const nodes = [
    node('root', null, 'region'),
    node('vale', 'root', 'region', [
      tile('1,1', GRASS, 'town'),
      tile('1,0', 'assets/tiles/water/water-1.svg'),
      tile('2,1', 'assets/tiles/deep-water/deep-water-1.svg'),
      tile('1,2', GRASS, 'cave'),
      tile('2,0', GRASS),
    ]),
    node('town', 'vale', 'region'),
    node('cave', 'vale', 'interior'),
  ];
  assert.deepEqual(worldStart(nodes), { nodeId: 'vale', tileId: '2,0' });
  nodes[1].tiles.push(tile('0,1', GRASS));
  assert.deepEqual(worldStart(nodes), { nodeId: 'vale', tileId: '0,1' });
});

test('no start without a town, or with no tree at all', () => {
  assert.equal(worldStart([]), null);
  const nodes = [
    node('root', null, 'region'),
    node('keep', 'root', 'interior', [tile('0,0', GRASS, 'x')]),
    node('vale', 'root', 'region', [tile('0,0', GRASS, 'cave'), tile('1,0', GRASS)]),
    node('cave', 'vale', 'interior'),
    node('far', 'vale', 'region', []),
  ];
  assert.equal(worldStart(nodes), null);
  nodes[2].tiles = [tile('0,0', GRASS, 'far')];
  assert.equal(worldStart(nodes), null);
});
