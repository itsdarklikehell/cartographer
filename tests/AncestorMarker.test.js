import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ancestorMarkerTile } from '../src/map/AncestorMarker.js';

/**
 * @param {string} id
 * @param {{ id: string, childNodeId?: string }[]} [tiles]
 * @returns {any}
 */
const node = (id, tiles = []) => ({
  id,
  tiles: tiles.map((t) => ({ childNodeId: null, ...t })),
});

const town = node('town');
const region = node('region', [{ id: '0,0' }, { id: '2,3', childNodeId: 'town' }]);
const world = node('world', [
  { id: '0,0', childNodeId: 'region' },
  { id: '1,0', childNodeId: 'region' },
  { id: '2,0', childNodeId: 'region' },
  { id: 'bad', childNodeId: 'region' },
  { id: '5,5', childNodeId: 'other' },
]);
const path = [world, region, town];

test('ancestorMarkerTile marks the tile that links down toward the party', () => {
  assert.equal(ancestorMarkerTile(path, region), '2,3');
});

test('ancestorMarkerTile picks the linked tile nearest the middle of a block', () => {
  assert.equal(ancestorMarkerTile(path, world), '1,0');
});

test('ancestorMarkerTile is null on the party map, off the path, or with no link', () => {
  assert.equal(ancestorMarkerTile(path, town), null, 'the party map has its own marker');
  assert.equal(ancestorMarkerTile(path, node('elsewhere')), null);
  assert.equal(ancestorMarkerTile([node('world'), region], node('world')), null);
});
