import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureChildLink, refreshChildMarker } from '../src/map/TilePaint.js';
import { createMapNode, createTile, getTile, setTile } from '../src/map/TileGrid.js';

const GENERIC = new Set(['dungeon.svg', 'cave-entrance.svg', 'castle.svg', 'settlement.svg']);

/**
 * A parent with one marker tile at 1,1 that links to `crypt`.
 * @param {string} ref @param {import('../src/types/map.js').POIType} poiType
 * @param {number} [span]
 */
function parentWith(ref, poiType, span) {
  const node = createMapNode('world', 'World', null, 4, 4);
  const marker = createTile('1,1', ref, {
    childNodeId: 'crypt',
    metadata: { poiType, discoverable: false, discovered: true, notes: 'old gate' },
  });
  return setTile(node, span ? { ...marker, span } : marker);
}

test('a dungeon marker becomes a cave marker when its child is a cave', () => {
  const node = parentWith('dungeon.svg', 'dungeon');
  const art = {
    markerRef: 'cave-entrance.svg',
    createRef: 'grass.svg',
    poiType: /** @type {const} */ ('dungeon'),
    genericRefs: GENERIC,
  };
  const result = ensureChildLink(node, 'crypt', art);
  assert.equal(result.tileId, null, 'the link already exists');
  const tile = getTile(result.node, '1,1');
  assert.equal(tile.imageRef, 'cave-entrance.svg');
  assert.equal(tile.metadata.poiType, 'dungeon');
  assert.equal(tile.metadata.notes, 'old gate', 'the notes stay');
  assert.equal(tile.childNodeId, 'crypt');
});

test('a marker of another type takes the new marker and type', () => {
  const node = parentWith('village.svg', 'settlement', 2);
  const result = refreshChildMarker(node, 'crypt', {
    markerRef: 'castle.svg',
    createRef: 'grass.svg',
    poiType: 'landmark',
    genericRefs: GENERIC,
  });
  const tile = getTile(result, '1,1');
  assert.equal(tile.imageRef, 'castle.svg');
  assert.equal(tile.metadata.poiType, 'landmark');
  assert.equal(tile.span, 2, 'a marker keeps its span');
});

test('the art of a particular place stays when the type matches', () => {
  const node = parentWith('inn.svg', 'settlement', 2);
  const art = { markerRef: 'settlement.svg', createRef: 'grass.svg', poiType: 'settlement' };
  assert.equal(refreshChildMarker(node, 'crypt', { ...art, genericRefs: GENERIC }), node);
  // With no generic list, only the type decides.
  assert.equal(refreshChildMarker(node, 'crypt', art), node);
  const same = parentWith('settlement.svg', 'settlement');
  assert.equal(refreshChildMarker(same, 'crypt', { ...art, genericRefs: GENERIC }), same);
});

test('a child with no marker turns the old marker into plain art', () => {
  const node = parentWith('settlement.svg', 'settlement', 2);
  const result = refreshChildMarker(node, 'crypt', {
    markerRef: null,
    createRef: 'grass.svg',
    poiType: null,
    genericRefs: GENERIC,
  });
  const tile = getTile(result, '1,1');
  assert.equal(tile.imageRef, 'grass.svg');
  assert.equal(tile.metadata.poiType, null);
  assert.equal(tile.span, undefined);
  assert.equal(tile.childNodeId, 'crypt');
  // With no art given at all, the same holds.
  const bare = refreshChildMarker(node, 'crypt', { createRef: 'grass.svg' });
  assert.equal(getTile(bare, '1,1').imageRef, 'grass.svg');
});

test('stairs, doors, other links, and plain link tiles never change', () => {
  let node = createMapNode('keep', 'Keep', null, 4, 4, { kind: 'interior' });
  const poi = { poiType: /** @type {const} */ ('dungeon'), discoverable: false, discovered: false };
  node = setTile(
    node,
    createTile('0,0', 'assets/tiles/interior/interior-stairs-down.svg', {
      childNodeId: 'crypt',
      metadata: { ...poi, notes: '' },
    }),
  );
  node = setTile(node, createTile('1,0', 'grass.svg', { childNodeId: 'crypt' }));
  node = setTile(
    node,
    createTile('2,0', 'dungeon.svg', { childNodeId: 'other', metadata: { ...poi, notes: '' } }),
  );
  const art = {
    markerRef: 'castle.svg',
    createRef: 'grass.svg',
    poiType: /** @type {const} */ ('landmark'),
  };
  assert.equal(refreshChildMarker(node, 'crypt', { ...art, genericRefs: GENERIC }), node);
});
