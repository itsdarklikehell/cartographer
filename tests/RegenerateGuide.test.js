import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockSize, reshapeParent } from '../src/map/RegenerateNode.js';
import { expandTree } from '../src/map/GeneratorTree.js';
import { generateNodeTiles } from '../src/map/MapGenerator.js';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { mulberry32 } from '../src/util/Rng.js';
import { gridTiles } from './helpers/grid.js';

const palette = new TilePalette();
const art = (/** @type {string} */ id) => /** @type {any} */ (palette.get(id)).imageRef;

/**
 * A 6x6 map of grass whose left three columns link to the region `r`. The
 * right three columns are water, so the block has a coast on the east.
 */
function coast() {
  const tiles = gridTiles(6, 6, (id, x) =>
    x < 3 ? createTile(id, art('grass-1'), { childNodeId: 'r' }) : createTile(id, art('water-1')),
  );
  return withNodeTiles(createMapNode('w', 'World', null, 6, 6), tiles);
}

/** A generated world, as a node, with its region sites. */
function generatedWorld() {
  const gen = generateNodeTiles(palette, { archetype: 'world', size: 'large' }, mulberry32(3));
  const [site] = gen.sites;
  const own = new Set(site.tileIds);
  const tiles = gen.tiles.map((t) => (own.has(t.id) ? { ...t, childNodeId: 'r' } : t));
  const node = withNodeTiles(createMapNode('w', 'World', null, gen.width, gen.height), tiles);
  return { node, site };
}

test('reshapeParent reads the linked block into a guide', () => {
  const parent = coast();
  const out = reshapeParent({
    parent,
    nodeId: 'r',
    archetype: 'wilderness',
    palette,
    rng: mulberry32(1),
  });
  assert.equal(out.tileId, null);
  assert.equal(out.node, parent, 'a block of grass already reads as wilderness');
  const guide = /** @type {import('../src/types/map.js').TerrainGuide} */ (out.guide);
  assert.equal(guide.width, 3);
  assert.equal(guide.height, 6);
  assert.ok(guide.block.every(Boolean));
  assert.ok(guide.biomes.every((b) => b === 'grass'));
});

test('reshapeParent guides the new map by the repainted block', () => {
  const out = reshapeParent({
    parent: coast(),
    nodeId: 'r',
    archetype: 'desert',
    palette,
    rng: mulberry32(1),
  });
  const biomes = /** @type {import('../src/types/map.js').TerrainGuide} */ (out.guide).biomes;
  assert.ok(biomes.includes('desert'));
  assert.ok(biomes.every((b) => b === 'desert' || b === 'grass'));
});

test('reshapeParent gives the same parent and guide for the same seed', () => {
  /** @param {number} seed */
  const run = (seed) =>
    reshapeParent({
      parent: coast(),
      nodeId: 'r',
      archetype: 'wetlands',
      palette,
      rng: mulberry32(seed),
    });
  assert.deepEqual(run(4), run(4));
});

test('reshapeParent stamps a link when no tile leads to the node, and guides by it', () => {
  const parent = withNodeTiles(createMapNode('w', 'World', null, 5, 5), gridTiles(5, 5));
  const out = reshapeParent({
    parent,
    nodeId: 'r',
    archetype: 'highlands',
    palette,
    rng: mulberry32(2),
  });
  assert.equal(out.tileId, '2,2');
  const guide = /** @type {import('../src/types/map.js').TerrainGuide} */ (out.guide);
  assert.ok(guide.block.every(Boolean));
  assert.equal(guide.block.length, out.node.tiles.filter((t) => t.childNodeId === 'r').length);
});

test('reshapeParent gives no guide when the parent has no room for a link', () => {
  const parent = withNodeTiles(createMapNode('w', 'World', null, 1, 1), [
    createTile('0,0', art('grass-1'), { childNodeId: 'other' }),
  ]);
  const out = reshapeParent({
    parent,
    nodeId: 'r',
    archetype: 'wilderness',
    palette,
    rng: mulberry32(1),
  });
  assert.equal(out.tileId, null);
  assert.equal(out.guide, undefined);
});

test('a regenerated world region follows its block, the same as world generation', () => {
  const { node, site } = generatedWorld();
  const out = reshapeParent({
    parent: node,
    nodeId: 'r',
    archetype: site.archetype,
    palette,
    rng: mulberry32(9),
  });
  assert.deepEqual(out.guide, site.guide);
  const root = {
    id: 'r',
    name: 'Region',
    kind: /** @type {const} */ ('region'),
    environ: site.environ,
    archetype: site.archetype,
    size: site.size,
    guide: out.guide,
  };
  let n = 0;
  const [top] = expandTree(palette, root, { seed: 11, depth: 0 }, () => `n${n++}`).nodes;
  const direct = generateNodeTiles(
    palette,
    { archetype: site.archetype, size: site.size, environ: site.environ, guide: site.guide },
    mulberry32(11),
  );
  assert.deepEqual(top.tiles, direct.tiles);
  assert.ok(top.tiles.length < top.width * top.height, 'the land of a neighbor stays blank');
});

test('blockSize fits the block, and is undefined with no link', () => {
  const { node, site } = generatedWorld();
  assert.equal(blockSize(node, 'r'), site.size);
  assert.equal(blockSize(coast(), 'r'), 'medium');
  assert.equal(blockSize(coast(), 'nobody'), undefined);
});

test('reshapeParent marks a new link with the marker of the archetype', () => {
  const parent = withNodeTiles(createMapNode('w', 'World', null, 5, 5), gridTiles(5, 5));
  const out = reshapeParent({
    parent,
    nodeId: 'r',
    archetype: 'town',
    palette,
    rng: mulberry32(2),
  });
  const tile = out.node.tiles.find((t) => t.id === out.tileId);
  assert.equal(tile?.imageRef, art('settlement'));
  assert.equal(tile?.metadata.poiType, 'settlement');
});

test('reshapeParent links with plain art when the palette has no marker', () => {
  const bare = Object.assign(Object.create(palette), { get: () => undefined });
  const parent = withNodeTiles(createMapNode('w', 'World', null, 5, 5), gridTiles(5, 5));
  const out = reshapeParent({
    parent,
    nodeId: 'r',
    archetype: 'town',
    palette: bare,
    rng: mulberry32(2),
  });
  const tile = out.node.tiles.find((t) => t.id === out.tileId);
  assert.equal(tile?.imageRef, 'grass.svg');
});
