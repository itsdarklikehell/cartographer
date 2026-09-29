import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile, updateTileMetadata } from '../src/map/TileGrid.js';
import { findRegionGroups, groupImageChunks } from '../src/map/RegionGroups.js';
import { paintRegion, paintTile } from '../src/map/TilePaint.js';
import { revealAround, setTileRevealed } from '../src/map/FogOfWar.js';

/** A 4x4 node whose left half links to `west`, with a marker on 0,0. */
function twoBlocks() {
  let node = createMapNode('n', 'Node', null, 4, 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const childNodeId = x < 2 ? 'west' : null;
      node = setTile(node, createTile(`${x},${y}`, 'grass.svg', { childNodeId }));
    }
  }
  return updateTileMetadata(node, '0,0', { poiType: 'landmark' });
}

test('a fog reveal keeps the groups and their image chunks', () => {
  const node = twoBlocks();
  const groups = findRegionGroups(node);
  const chunks = groupImageChunks(node, groups[0]);
  const revealed = revealAround(setTileRevealed(node, '3,3', true), '1,1', 2);
  assert.equal(findRegionGroups(revealed), groups);
  assert.equal(groupImageChunks(revealed, groups[0]), chunks);
});

test('a terrain paint keeps the groups and rebuilds the chunks', () => {
  const node = twoBlocks();
  const groups = findRegionGroups(node);
  const chunks = groupImageChunks(node, groups[0]);
  const painted = paintTile(node, '0,0', 'water.svg');
  assert.equal(findRegionGroups(painted), groups);
  const rebuilt = groupImageChunks(painted, groups[0]);
  assert.notEqual(rebuilt, chunks);
  assert.equal(rebuilt[0].imageRef, 'water.svg');
});

test('a region paint makes new groups', () => {
  const node = twoBlocks();
  const groups = findRegionGroups(node);
  const linked = paintRegion(node, '2,0', 'west');
  const next = findRegionGroups(linked);
  assert.notEqual(next, groups);
  assert.equal(next[0].tileIds.length, 9);
});
