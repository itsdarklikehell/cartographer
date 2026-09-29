import test from 'node:test';
import assert from 'node:assert/strict';
import {
  artStamp,
  fogStamp,
  linkStamp,
  tileAt,
  withTileAppended,
  withTileReplaced,
  withTilesReplaced,
  withNodeTiles,
} from '../src/map/TileIndex.js';
import { createMapNode, createTile, setTile, updateTileMetadata } from '../src/map/TileGrid.js';
import { setTileRevealed } from '../src/map/FogOfWar.js';

function nodeWith(...ids) {
  let node = createMapNode('n', 'Node', null, 8, 8);
  for (const id of ids) node = setTile(node, createTile(id, 'grass.png'));
  return node;
}

/** The stamps of a node, read after its layout exists. */
const stamps = (node) => ({ links: linkStamp(node), art: artStamp(node) });

test('a fog change keeps both stamps', () => {
  const node = nodeWith('0,0', '1,0');
  const before = stamps(node);
  const after = stamps(setTileRevealed(node, '1,0', true));
  assert.equal(after.links, before.links);
  assert.equal(after.art, before.art);
});

test('a notes edit keeps both stamps', () => {
  const node = nodeWith('0,0');
  const before = stamps(node);
  const after = stamps(updateTileMetadata(node, '0,0', { notes: 'a well' }));
  assert.equal(after.links, before.links);
  assert.equal(after.art, before.art);
});

test('a repaint keeps the link stamp and makes a new art stamp', () => {
  const node = nodeWith('0,0');
  const before = stamps(node);
  const after = stamps(setTile(node, createTile('0,0', 'water.png')));
  assert.equal(after.links, before.links);
  assert.notEqual(after.art, before.art);
});

test('a new point of interest type makes a new art stamp', () => {
  const node = nodeWith('0,0');
  const before = stamps(node);
  const after = stamps(updateTileMetadata(node, '0,0', { poiType: 'landmark' }));
  assert.equal(after.links, before.links);
  assert.notEqual(after.art, before.art);
});

test('a new link makes a new link stamp and keeps the art stamp', () => {
  const node = nodeWith('0,0', '1,0');
  const before = stamps(node);
  const pos = 1;
  const linked = { ...node.tiles[pos], childNodeId: 'child' };
  const one = stamps(withTileReplaced(node, pos, linked));
  assert.notEqual(one.links, before.links);
  assert.equal(one.art, before.art);
  const many = stamps(withTilesReplaced(node, new Map([[pos, linked]])));
  assert.notEqual(many.links, before.links);
});

test('a replacement under another id leaves the new node to build its own layout', () => {
  const node = nodeWith('0,0', '1,0');
  const before = stamps(node);
  const moved = withTileReplaced(node, 1, createTile('5,5', 'grass.png'));
  assert.equal(tileAt(moved, '5,5')?.imageRef, 'grass.png');
  assert.equal(tileAt(moved, '1,0'), undefined);
  assert.notEqual(linkStamp(moved), before.links);
});

test('an append keeps the link stamp only for a tile with no link', () => {
  // A node built whole, so the append stays under the flatten threshold and
  // passes the layout forward.
  const tiles = Array.from({ length: 16 }, (_, i) => createTile(`${i % 4},${i >> 2}`, 'g.png'));
  const node = withNodeTiles(createMapNode('n', 'Node', null, 8, 8), tiles);
  const before = stamps(node);
  const plain = stamps(withTileAppended(node, createTile('4,4', 'grass.png')));
  assert.equal(plain.links, before.links);
  assert.notEqual(plain.art, before.art);
  const linked = withTileAppended(node, createTile('4,4', 'grass.png', { childNodeId: 'c' }));
  assert.notEqual(linkStamp(linked), before.links);
});

test('the fog stamp changes with a revealed flag and nothing else', () => {
  const node = nodeWith('0,0', '1,0');
  const before = fogStamp(node);
  assert.equal(fogStamp(setTile(node, createTile('0,0', 'water.png'))), before);
  assert.notEqual(fogStamp(setTileRevealed(node, '0,0', true)), before);
  const tiles = Array.from({ length: 16 }, (_, i) => createTile(`${i % 4},${i >> 2}`, 'g.png'));
  const whole = withNodeTiles(createMapNode('n', 'Node', null, 8, 8), tiles);
  const fog = fogStamp(whole);
  assert.equal(fogStamp(withTileAppended(whole, createTile('4,4', 'g.png'))), fog);
  const shown = createTile('4,4', 'g.png', { revealed: true });
  assert.notEqual(fogStamp(withTileAppended(whole, shown)), fog);
});
