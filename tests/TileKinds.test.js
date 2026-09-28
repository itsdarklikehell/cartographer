import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { createTile } from '../src/map/TileGrid.js';
import { interiorArt, isBlocked, kindOf, tileKind, townWallArt } from '../src/map/TileKinds.js';

test('kindOf reports what an interior piece means to the rules', () => {
  const palette = new TilePalette();
  /** @param {string} id */
  const kindOfPiece = (id) => kindOf(palette.getInteriorPiece(id).imageRef);
  assert.equal(kindOfPiece('wall-h'), 'wall');
  assert.equal(kindOfPiece('wall-corner-ne'), 'wall');
  assert.equal(kindOfPiece('wall-cross'), 'wall');
  assert.equal(kindOfPiece('door-v'), 'door');
  assert.equal(kindOfPiece('stairs-up'), 'stairs-up');
  assert.equal(kindOfPiece('stairs-down'), 'stairs-down');
  assert.equal(kindOfPiece('floor-2'), 'floor');
});

test('kindOf calls everything outside the interior set plain', () => {
  const palette = new TilePalette();
  assert.equal(kindOf(palette.get('grass-1').imageRef), 'plain');
  assert.equal(kindOf(palette.get('castle').imageRef), 'plain');
  assert.equal(kindOf(palette.getRoadPiece('cross').imageRef), 'plain');
  assert.equal(kindOf('data:image/png;base64,abc'), 'plain');
  assert.equal(kindOf(''), 'plain');
});

test('kindOf reads the whole reference, not a substring of it', () => {
  // A GM's own art named after a piece is still their art: it must not pick up
  // the piece's rules, or a file name would decide where the party can stand.
  assert.equal(kindOf('assets/tiles/custom/interior-wall-h.svg'), 'plain');
  assert.equal(kindOf('my-stairs-down.png'), 'plain');
});

test('kindOf gives the cave pieces and the furnishings their meanings', () => {
  assert.equal(kindOf(interiorArt('cave-floor-2')), 'floor');
  assert.equal(kindOf(interiorArt('cave-wall')), 'wall');
  assert.equal(kindOf(interiorArt('cave-mouth-v')), 'door');
  for (const kind of ['pillar', 'table', 'bed', 'bookshelf']) {
    assert.equal(kindOf(interiorArt(kind)), 'obstacle', kind);
  }
  assert.equal(kindOf(interiorArt('trapdoor')), 'stairs-down');
  assert.equal(kindOf(interiorArt('chest')), 'plain');
});

test('tileKind lets the topmost overlay with a meaning decide', () => {
  const floor = createTile('1,1', interiorArt('floor-1'));
  assert.equal(tileKind(floor), 'floor');
  assert.equal(tileKind({ ...floor, overlayRef: interiorArt('trapdoor') }), 'stairs-down');
  assert.equal(tileKind({ ...floor, overlayRef: interiorArt('barrel') }), 'floor');
  const stack = [interiorArt('pillar'), interiorArt('trapdoor'), interiorArt('rubble')];
  assert.equal(tileKind({ ...floor, overlayRef: stack }), 'stairs-down');
});

test('isBlocked keeps the party off walls and obstacles only', () => {
  const floor = createTile('1,1', interiorArt('floor-1'));
  assert.equal(isBlocked(floor), false);
  assert.equal(isBlocked({ ...floor, overlayRef: interiorArt('table') }), true);
  assert.equal(isBlocked({ ...floor, overlayRef: interiorArt('chest') }), false);
  assert.equal(isBlocked(createTile('0,0', interiorArt('cave-wall'))), true);
  assert.equal(isBlocked(createTile('0,1', interiorArt('door-h'))), false);
});

test('a town wall blocks the party, and its gates let the party through', () => {
  const palette = new TilePalette();
  const grass = createTile('3,3', /** @type {any} */ (palette.get('grass-1')).imageRef);
  /** @param {string} piece */
  const on = (piece) => ({
    ...grass,
    overlayRef: /** @type {any} */ (palette.getTownWallPiece(piece)).imageRef,
  });
  for (const piece of ['wall-h', 'wall-v', 'wall-corner-ne', 'wall-corner-sw']) {
    assert.equal(tileKind(on(piece)), 'wall', piece);
    assert.equal(isBlocked(on(piece)), true, piece);
  }
  for (const piece of ['gate-h', 'gate-v', 'water-gate-h', 'water-gate-v']) {
    assert.equal(isBlocked(on(piece)), false, piece);
  }
  assert.equal(kindOf(townWallArt('wall-corner-se')), 'wall');
});
