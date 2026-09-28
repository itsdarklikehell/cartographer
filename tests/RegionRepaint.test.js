import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGION_GROUND, repaintRegionBlock } from '../src/map/RegionRepaint.js';
import { regionFor } from '../src/map/GeneratorWorld.js';
import { BIOME_TERRAIN } from '../src/map/GeneratorTerrain.js';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { mulberry32 } from '../src/util/Rng.js';
import { gridTiles } from './helpers/grid.js';

const palette = new TilePalette();
const art = (/** @type {string} */ id) => /** @type {any} */ (palette.get(id)).imageRef;
const classOf = new Map([...palette.entries.values()].map((e) => [e.imageRef, e.type]));

/**
 * A 10x10 world of grass whose top eight rows link to the region `r`. Tile
 * 0,0 is water, 1,0 has a coast overlay, 2,0 is a point of interest, 3,0
 * has a span, 4,0 has a river overlay, and 5,0 links to another node.
 */
function world() {
  const tiles = gridTiles(10, 10, (id, x, y) => {
    const tile = createTile(id, art('grass-1'), y < 8 ? { childNodeId: 'r' } : {});
    const special = /** @type {Record<string, any>} */ ({
      '0,0': { imageRef: art('water-1') },
      '1,0': { overlayRef: art('coast-n') },
      '2,0': { metadata: { ...tile.metadata, poiType: 'landmark' } },
      '3,0': { span: 2 },
      '4,0': { overlayRef: art('river-h'), notes: 'a ford' },
      '5,0': { childNodeId: 'other' },
    })[id];
    return { ...tile, ...special, revealed: x === 6 };
  });
  return withNodeTiles(createMapNode('w', 'World', null, 10, 10), tiles);
}

/** @param {import('../src/types/map.js').MapNode} node */
const blockTypes = (node) =>
  node.tiles
    .filter((t) => t.childNodeId === 'r')
    .map((t) => {
      const type = /** @type {string} */ (classOf.get(t.imageRef));
      return BIOME_TERRAIN[type] ?? type;
    });

test('a repainted block reads as the new archetype', () => {
  for (const archetype of Object.keys(REGION_GROUND)) {
    if (archetype === 'wilderness') continue;
    const node = repaintRegionBlock(world(), 'r', archetype, palette, mulberry32(7));
    assert.equal(regionFor(blockTypes(node)).archetype, archetype);
  }
  const hills = world();
  const bare = withNodeTiles(
    hills,
    hills.tiles.map((t) => (t.childNodeId === 'r' ? { ...t, imageRef: art('hills-1') } : t)),
  );
  const wild = repaintRegionBlock(bare, 'r', 'wilderness', palette, mulberry32(7));
  assert.equal(regionFor(blockTypes(wild)).archetype, 'wilderness');
});

test('a repaint keeps water, coast, points of interest, spans, links, overlays, and fog', () => {
  const before = world();
  const after = repaintRegionBlock(before, 'r', 'desert', palette, mulberry32(3));
  const pick = (/** @type {any} */ n, /** @type {string} */ id) =>
    n.tiles.find((/** @type {any} */ t) => t.id === id);
  for (const id of ['0,0', '1,0', '2,0', '3,0', '5,0', '0,9']) {
    assert.equal(pick(after, id), pick(before, id), id);
  }
  const ford = pick(after, '4,0');
  assert.notEqual(ford.imageRef, art('grass-1'));
  assert.equal(ford.overlayRef, art('river-h'));
  assert.equal(ford.notes, 'a ford');
  assert.equal(ford.childNodeId, 'r');
  assert.equal(pick(after, '6,3').revealed, true);
  assert.equal(pick(after, '7,3').revealed, false);
});

test('a repaint leaves the node alone when nothing changes', () => {
  const node = world();
  assert.equal(repaintRegionBlock(node, 'r', 'town', palette, mulberry32(1)), node);
  assert.equal(repaintRegionBlock(node, 'none', 'desert', palette, mulberry32(1)), node);
  assert.equal(repaintRegionBlock(node, 'r', 'wilderness', palette, mulberry32(1)), node);
  const desert = repaintRegionBlock(node, 'r', 'desert', palette, mulberry32(1));
  assert.equal(repaintRegionBlock(desert, 'r', 'desert', palette, mulberry32(2)), desert);
  // A block of only kept tiles has nothing to repaint.
  const kept = withNodeTiles(node, [{ ...createTile('0,0', art('water-1')), childNodeId: 'r' }]);
  assert.equal(repaintRegionBlock(kept, 'r', 'desert', palette, mulberry32(1)), kept);
});

test('a custom image in the block counts as no climate', () => {
  const node = withNodeTiles(world(), [
    { ...createTile('0,0', 'data:image/png;base64,AA'), childNodeId: 'r' },
  ]);
  const after = repaintRegionBlock(node, 'r', 'frontier', palette, mulberry32(1));
  assert.notEqual(after.tiles[0].imageRef, node.tiles[0].imageRef);
});
