import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TerrainLayer,
  contains,
  intersect,
  nextValid,
  sameKey,
  subtract,
  terrainKey,
  torusPieces,
} from '../src/map/TerrainLayer.js';
import { createMapNode } from '../src/map/TileGrid.js';

/** @param {number} x @param {number} y @param {number} w @param {number} h */
const r = (x, y, w, h) => ({ x, y, w, h });

test('intersect gives the overlap, or null when the rects only touch', () => {
  assert.deepEqual(intersect(r(0, 0, 10, 10), r(5, 5, 10, 10)), r(5, 5, 5, 5));
  assert.equal(intersect(r(0, 0, 10, 10), r(10, 0, 5, 5)), null);
  assert.equal(intersect(r(0, 0, 10, 10), r(0, 10, 5, 5)), null);
});

test('contains needs every edge inside', () => {
  assert.equal(contains(r(0, 0, 10, 10), r(2, 2, 8, 8)), true);
  assert.equal(contains(r(0, 0, 10, 10), r(2, 2, 9, 8)), false);
  assert.equal(contains(r(0, 0, 10, 10), r(-1, 2, 5, 5)), false);
});

test('subtract splits the remainder into bands and side pieces', () => {
  assert.deepEqual(subtract(r(0, 0, 10, 10), r(20, 20, 5, 5)), [r(0, 0, 10, 10)]);
  assert.deepEqual(subtract(r(0, 0, 10, 10), r(0, 0, 10, 10)), []);
  assert.deepEqual(subtract(r(0, 0, 10, 10), r(2, 3, 4, 5)), [
    r(0, 0, 10, 3),
    r(0, 8, 10, 2),
    r(0, 3, 2, 5),
    r(6, 3, 4, 5),
  ]);
});

test('nextValid returns a rect that already covers the target', () => {
  const valid = r(0, 0, 100, 100);
  assert.equal(nextValid(valid, r(10, 10, 50, 50), 20, 140, 140), valid);
});

test('nextValid starts over when the target leaves the rect entirely', () => {
  assert.deepEqual(
    nextValid(r(0, 0, 100, 100), r(500, 0, 100, 100), 20, 140, 140),
    r(500, 0, 100, 100),
  );
});

test('nextValid runs a margin ahead of a pan and retains what the layer allows', () => {
  // Right: the old left part stays while the width fits the layer.
  assert.deepEqual(
    nextValid(r(0, 0, 100, 100), r(10, 0, 100, 100), 20, 140, 140),
    r(0, 0, 130, 100),
  );
  // Right again: the rect now drops its left end to stay within 140.
  assert.deepEqual(
    nextValid(r(0, 0, 130, 100), r(40, 0, 100, 100), 20, 140, 140),
    r(20, 0, 140, 100),
  );
  // Left and up together.
  assert.deepEqual(
    nextValid(r(0, 0, 100, 100), r(-5, -7, 100, 100), 20, 140, 140),
    r(-25, -27, 125, 127),
  );
  // Down, with the old rect taller than the layer allows past the margin.
  assert.deepEqual(
    nextValid(r(0, 0, 100, 130), r(0, 40, 100, 100), 20, 140, 140),
    r(0, 20, 100, 140),
  );
});

test('torusPieces splits a rect at the wrap lines', () => {
  assert.deepEqual(torusPieces(r(10, 20, 30, 40), 100, 100), [
    { x: 10, y: 20, w: 30, h: 40, lx: 10, ly: 20 },
  ]);
  assert.deepEqual(torusPieces(r(90, 0, 20, 10), 100, 100), [
    { x: 90, y: 0, w: 10, h: 10, lx: 90, ly: 0 },
    { x: 100, y: 0, w: 10, h: 10, lx: 0, ly: 0 },
  ]);
  assert.deepEqual(torusPieces(r(-5, -5, 10, 10), 100, 100), [
    { x: -5, y: -5, w: 5, h: 5, lx: 95, ly: 95 },
    { x: -5, y: 0, w: 5, h: 5, lx: 95, ly: 0 },
    { x: 0, y: -5, w: 5, h: 5, lx: 0, ly: 95 },
    { x: 0, y: 0, w: 5, h: 5, lx: 0, ly: 0 },
  ]);
});

/** A view over a 10x10 node of 50 px tiles (tileSize 50, scale 1). */
function view(overrides = {}) {
  return /** @type {any} */ ({
    node: NODE,
    regionGroups: GROUPS,
    revealAll: false,
    fogDim: false,
    markerRange: 4,
    partyTileId: '1,1',
    partyInNode: true,
    characterTokens: [],
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    canvasWidth: 200,
    canvasHeight: 120,
    ...overrides,
  });
}
const NODE = createMapNode('n', 'N', null, 10, 10);
const GROUPS = /** @type {any[]} */ ([]);

test('terrainKey compares node, fog mode, anchors, and token tiles', () => {
  const key = terrainKey(view());
  assert.equal(sameKey(null, key), false);
  assert.equal(sameKey(key, terrainKey(view())), true);
  assert.equal(sameKey(key, terrainKey(view({ offsetX: 99, selectedTileId: '2,2' }))), true);
  assert.equal(sameKey(key, terrainKey(view({ partyTileId: '2,2' }))), false);
  assert.equal(sameKey(key, terrainKey(view({ fogDim: undefined }))), true);
  assert.equal(sameKey(key, terrainKey(view({ partyInNode: undefined }))), true);
  const tokens = terrainKey(view({ characterTokens: [{ tileId: '3,3', name: 'A' }] }));
  assert.equal(
    sameKey(tokens, terrainKey(view({ characterTokens: [{ tileId: '3,3', name: 'B' }] }))),
    true,
  );
  assert.equal(sameKey(key, tokens), false);
});

/** A recording 2d context. */
function recordingCtx() {
  /** @type {unknown[][]} */
  const ops = [];
  const record =
    (/** @type {string} */ op) =>
    (/** @type {unknown[]} */ ...args) =>
      ops.push([op, ...args]);
  const ctx = /** @type {any} */ ({ ops });
  for (const op of [
    'save',
    'restore',
    'beginPath',
    'rect',
    'clip',
    'clearRect',
    'translate',
    'drawImage',
  ]) {
    ctx[op] = record(op);
  }
  return ctx;
}

/** A TerrainLayer over a fake canvas, with a paint spy. */
function harness() {
  /** @type {any[]} */
  const made = [];
  const layer = new TerrainLayer({
    createCanvas: (width, height) => {
      const canvas = /** @type {any} */ ({ width, height, ctx: recordingCtx() });
      canvas.getContext = () => canvas.ctx;
      made.push(canvas);
      return canvas;
    },
  });
  /** @type {any[]} */
  const paints = [];
  const paint = (/** @type {unknown} */ lctx, /** @type {any} */ v) =>
    paints.push({
      offsetX: v.offsetX,
      offsetY: v.offsetY,
      w: v.canvasWidth,
      h: v.canvasHeight,
      lctx,
    });
  const main = recordingCtx();
  /** @param {any} v */
  const draw = (v) => layer.draw(main, v, v.scale * 50, paint);
  return { layer, made, paints, main, draw };
}

test('a scale change draws direct, and the next frame paints the view into the layer', () => {
  const { made, paints, main, draw } = harness();
  assert.equal(draw(view()), false);
  assert.equal(made.length, 0);

  assert.equal(draw(view()), true);
  // Margin: a quarter of the shorter side, 30. Layer: 260 x 180.
  assert.equal(made[0].width, 260);
  assert.equal(made[0].height, 180);
  // The view is (0, 0, 200, 120) in map pixels. One cell of border is 52.
  assert.deepEqual(paints, [{ offsetX: 52, offsetY: 52, w: 304, h: 224, lctx: made[0].ctx }]);
  const lops = made[0].ctx.ops;
  assert.deepEqual(lops[3], ['clip']);
  assert.deepEqual(lops[4], ['clearRect', 0, 0, 200, 120]);
  assert.deepEqual(lops[5], ['translate', -52, -52]);
  assert.deepEqual(main.ops, [['drawImage', made[0], 0, 0, 200, 120, 0, 0, 200, 120]]);
});

test('a frame with nothing new copies the layer without painting', () => {
  const { paints, main, draw } = harness();
  draw(view());
  draw(view());
  draw(view());
  assert.equal(paints.length, 1);
  assert.equal(main.ops.length, 2);
});

test('a pan paints only the strip that comes into view, plus the margin', () => {
  const { paints, main, made, draw } = harness();
  draw(view());
  draw(view());
  draw(view({ offsetX: -10 }));
  // The valid rect grows from (0..200) to (0..240): the strip x 200..240.
  assert.deepEqual(paints[1], {
    offsetX: 52 - 200,
    offsetY: 52,
    w: 40 + 104,
    h: 224,
    lctx: made[0].ctx,
  });
  // The frame copies x 10..210 of map pixels to the screen at x 0.
  assert.deepEqual(main.ops.at(-1), ['drawImage', made[0], 10, 0, 200, 120, 0, 0, 200, 120]);
  // A further pan inside the margin paints nothing.
  draw(view({ offsetX: -40 }));
  assert.equal(paints.length, 2);
});

test('a key change or invalidate paints the whole view again', () => {
  const { layer, paints, draw } = harness();
  draw(view());
  draw(view());
  draw(view({ partyTileId: '2,2' }));
  assert.equal(paints.length, 2);
  assert.equal(paints[1].w, 304);
  layer.invalidate();
  draw(view({ partyTileId: '2,2' }));
  assert.equal(paints.length, 3);
});

test('a resize reuses the canvas at the new size and paints again', () => {
  const { made, paints, draw } = harness();
  draw(view());
  draw(view());
  draw(view({ canvasWidth: 240 }));
  assert.equal(made.length, 1);
  assert.equal(made[0].width, 300);
  assert.equal(paints.length, 2);
});

test('a view that shows none of the map draws nothing', () => {
  const { paints, main, draw } = harness();
  draw(view());
  assert.equal(draw(view({ offsetX: 5000 })), true);
  assert.equal(paints.length, 0);
  assert.equal(main.ops.length, 0);
});

test('without a node or a canvas the caller draws direct', () => {
  const { draw } = harness();
  assert.equal(draw(view({ node: null })), false);

  const none = new TerrainLayer({ createCanvas: () => null });
  const main = recordingCtx();
  none.draw(main, view(), 50, () => {});
  assert.equal(
    none.draw(main, view(), 50, () => {}),
    false,
  );
  assert.equal(none.available, false);
  assert.equal(
    none.draw(main, view(), 50, () => {}),
    false,
  );

  const noCtx = new TerrainLayer({
    createCanvas: () => /** @type {any} */ ({ getContext: () => null }),
  });
  noCtx.draw(main, view(), 50, () => {});
  assert.equal(
    noCtx.draw(main, view(), 50, () => {}),
    false,
  );
  assert.equal(new TerrainLayer().createCanvas(4, 4), null);
});
