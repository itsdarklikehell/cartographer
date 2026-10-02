import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  avoidOccluders,
  edgeExitBand,
  edgeExitBands,
  exitBandGeometry,
  insideBand,
} from '../src/map/ExitBands.js';
import { tileIdAt } from '../src/map/MapGeometry.js';
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

test('a band that clears no place still keeps off the party tile', () => {
  const narrow = { ...geom, canvasWidth: 220, offsetX: 40 };
  const strip = { x: 0, y: 0, w: 30, h: 800 }; // row digits, the whole height
  const free = edgeExitBand(
    { kind: 'edge', side: 'east', targetNodeId: 'region', targetName: 'Graypeak Highlands' },
    { ...narrow, occluders: [strip] },
  );
  assert.ok(overlap(free, strip), 'the band is too wide to miss the digits');
  const party = { x: free.x + 20, y: free.y, w: 48, h: 48 };
  const placed = avoidOccluders(free, 'east', {
    ...narrow,
    occluders: [strip, party],
    required: [party],
  });
  assert.ok(!overlap(placed, party));
  assert.ok(overlap(placed, strip), 'the band gives up the digits, not the token');
});

test('a band off the required rects stays put when no place clears every occluder', () => {
  const narrow = { ...geom, canvasWidth: 220, offsetX: 40 };
  const strip = { x: 0, y: 0, w: 30, h: 800 };
  const free = edgeExitBand(
    { kind: 'edge', side: 'east', targetNodeId: 'region', targetName: 'Graypeak Highlands' },
    { ...narrow, occluders: [strip] },
  );
  assert.ok(overlap(free, strip));
  const far = { x: 0, y: 0, w: 10, h: 10 };
  assert.deepEqual(
    avoidOccluders(free, 'east', { ...narrow, occluders: [strip], required: [far] }),
    free,
  );
});

test('the geometry lists the HTML and the party tile as required', () => {
  const node = createMapNode({ id: 'n', name: 'N', width: 6, height: 6 });
  const view = { offsetX: 100, offsetY: 100, scale: 1, canvasWidth: 800, canvasHeight: 600 };
  const html = { x: 0, y: 0, w: 50, h: 50 };
  const exit = /** @type {any} */ ({
    kind: 'edge',
    side: 'east',
    targetNodeId: 'x',
    targetName: 'X',
  });
  const geomOut = exitBandGeometry(
    node,
    { ...view, occluders: [html], partyTileId: '2,1' },
    48,
    exit,
  );
  assert.deepEqual(geomOut.required, [html, { x: 196, y: 148, w: 48, h: 48 }]);
  assert.deepEqual(exitBandGeometry(node, view, 48, exit).required, []);
});

test('edgeExitBands moves a later band off an earlier one', () => {
  const node = createMapNode('vale', 'Briarwick Vale', 'world', 10, 10);
  const view = {
    offsetX: 20,
    offsetY: 20,
    scale: 1,
    canvasWidth: 400,
    canvasHeight: 500,
    partyTileId: tileIdAt(8, 9),
  };
  /** @type {import('../src/types/map.js').MapExit[]} */
  const exits = [
    { kind: 'edge', side: 'east', targetNodeId: 'peaks', targetName: 'Graypeak Highlands' },
    { kind: 'edge', side: 'south', targetNodeId: 'reach', targetName: 'The Ashen Reach' },
    { kind: 'node', targetNodeId: 'world', targetName: 'The Marches' },
  ];
  const alone = exits
    .slice(0, 2)
    .map((exit) => edgeExitBand(exit, exitBandGeometry(node, view, 48, exit)));
  assert.ok(overlap(alone[0], alone[1]), 'the corner layout collides without the pass');
  const placed = edgeExitBands(node, view, 48, exits);
  assert.deepEqual(
    placed.map((p) => p.exit.kind === 'edge' && p.exit.side),
    ['east', 'south'],
  );
  assert.deepEqual(placed[0].band, alone[0]);
  assert.ok(!overlap(placed[0].band, placed[1].band));
});

test('insideBand includes the edges of the rect', () => {
  const rect = { x: 10, y: 10, w: 20, h: 10 };
  assert.equal(insideBand(rect, 10, 20), true);
  assert.equal(insideBand(rect, 31, 15), false);
  assert.equal(insideBand(rect, 15, 9), false);
});
