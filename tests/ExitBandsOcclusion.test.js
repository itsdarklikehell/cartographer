import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avoidOccluders, edgeExitBand, exitBandGeometry } from '../src/map/ExitBands.js';
import { createMapNode } from '../src/map/TileGrid.js';

/** @typedef {import('../src/map/ExitBands.js').Rect} Rect */
/** @typedef {import('../src/types/map.js').ExitSide} ExitSide */

const geom = {
  width: 8,
  height: 8,
  tileSize: 48,
  offsetX: 250,
  offsetY: 250,
  scale: 1,
  canvasWidth: 900,
  canvasHeight: 800,
  alongCell: 3,
};

/** @param {ExitSide} side @param {Rect[]} [occluders] */
function band(side, occluders = []) {
  return edgeExitBand(
    { kind: 'edge', side, targetNodeId: 'region', targetName: 'Saltmere Coast' },
    { ...geom, occluders },
  );
}

/** Two rects overlap, edges touching excluded. @param {Rect} a @param {Rect} b */
function overlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('a band with nothing over it stays where it is', () => {
  const far = { x: 700, y: 20, w: 100, h: 100 };
  assert.deepEqual(band('west', [far]), band('west'));
});

test('a west band slides along its side to the nearer clear place', () => {
  const free = band('west');
  // An occluder whose lower edge is nearer the band than its upper edge.
  const cover = { x: 0, y: free.y - 30, w: 300, h: 60 };
  const moved = band('west', [cover]);
  assert.equal(moved.x, free.x, 'the band keeps its side');
  assert.equal(moved.y, cover.y + cover.h + 8);
  assert.equal(overlap(moved, cover), false);
});

test('a north band slides along x past the occluder', () => {
  const free = band('north');
  const cover = { x: free.x - 20, y: 0, w: free.w + 10, h: 400 };
  const moved = band('north', [cover]);
  assert.equal(moved.y, free.y);
  assert.equal(moved.x, cover.x + cover.w + 8);
  assert.equal(overlap(moved, cover), false);
});

test('a band skips a place that another occluder covers', () => {
  const free = band('west');
  const cover = { x: 0, y: free.y - 30, w: 300, h: 60 };
  const below = { x: 0, y: cover.y + cover.h, w: 300, h: 200 };
  const moved = band('west', [cover, below]);
  assert.equal(moved.y, cover.y - moved.h - 8);
  assert.equal(overlap(moved, cover) || overlap(moved, below), false);
});

test('a band stays put when no place on the canvas is clear', () => {
  const free = band('west');
  const wall = { x: 0, y: 0, w: 900, h: 800 };
  assert.deepEqual(band('west', [wall]), free);
});

test('avoidOccluders reads no occluders as none', () => {
  const rect = { x: 10, y: 10, w: 50, h: 20 };
  assert.equal(avoidOccluders(rect, 'north', geom), rect);
});

test('band geometry takes the occluders of the view', () => {
  const node = createMapNode('child', 'Thornhold', 'world', 8, 5);
  const view = { offsetX: 0, offsetY: 0, scale: 1, canvasWidth: 900, canvasHeight: 800 };
  const exit = /** @type {const} */ ({
    kind: 'edge',
    side: 'north',
    targetNodeId: 'region',
    targetName: 'Saltmere Coast',
  });
  const occluders = [{ x: 1, y: 2, w: 3, h: 4 }];
  const bare = exitBandGeometry(node, view, 48, exit).occluders ?? [];
  // The two coordinate strips are always kept out.
  assert.equal(bare.length, 2);
  const withHtml = exitBandGeometry(node, { ...view, occluders }, 48, exit).occluders ?? [];
  assert.deepEqual(withHtml, [...occluders, ...bare]);
  const withParty = exitBandGeometry(node, { ...view, partyTileId: '2,1' }, 48, exit);
  assert.deepEqual(withParty.occluders?.at(-1), { x: 96, y: 48, w: 48, h: 48 });
  assert.equal(withParty.pixelRatio, 1);
});

test('a band with no place along its side moves across it', () => {
  const free = band('north');
  // A strip along the whole north side, like the column digits.
  const strip = { x: 0, y: free.y - 4, w: 900, h: 30 };
  const moved = band('north', [strip]);
  assert.equal(moved.x, free.x);
  assert.equal(overlap(moved, strip), false);
});
