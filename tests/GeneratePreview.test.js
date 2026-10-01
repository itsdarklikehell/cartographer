import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewFrame, previewRegionTiles } from '../src/map/GeneratePreview.js';
import { createTile } from '../src/map/TileGrid.js';

test('previewFrame leaves a gutter on the top and left for the labels', () => {
  const { tileSize, offsetX, offsetY } = previewFrame(480, 14, 14);
  assert.ok(tileSize >= 20);
  assert.ok(offsetX >= 26 && offsetY >= 26, `${offsetX}, ${offsetY}`);
  assert.ok(offsetX + 14 * tileSize <= 480);
});

test('previewFrame centres a map that is wider than tall', () => {
  const { tileSize, offsetX, offsetY } = previewFrame(480, 14, 7);
  assert.ok(offsetY > offsetX);
  assert.ok(offsetY + 7 * tileSize <= 480);
});

test('previewFrame fills the canvas when the tiles get too small for labels', () => {
  assert.deepEqual(previewFrame(480, 48, 48), { tileSize: 10, offsetX: 0, offsetY: 0 });
});

test('previewRegionTiles links the tiles of each site to its own id', () => {
  const tiles = [
    createTile('0,0', 'a.svg'),
    createTile('1,0', 'a.svg'),
    createTile('2,0', 'a.svg'),
  ];
  const site = (/** @type {string[]} */ tileIds) =>
    /** @type {import('../src/types/map.js').GeneratedSite} */ ({
      tileIds,
      archetype: 'wilderness',
      kind: 'region',
      environ: 'forest',
      size: 'small',
      label: 'wilderness',
    });
  const linked = previewRegionTiles(tiles, [site(['0,0', '1,0']), site(['2,0'])]);
  assert.deepEqual(
    linked.map((t) => t.childNodeId),
    ['preview-site-0', 'preview-site-0', 'preview-site-1'],
  );
  assert.equal(tiles[0].childNodeId, null);
  assert.equal(previewRegionTiles(tiles), tiles);
  assert.equal(previewRegionTiles(tiles, []), tiles);
});
