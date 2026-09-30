import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelSize } from '../src/map/CanvasText.js';
import { COORD_SCALE, coordLabelLayout } from '../src/map/CoordLabels.js';
import { edgeExitBand, exitBandDepth, exitBandGeometry } from '../src/map/ExitBands.js';
import { fitSides, fitToExtent } from '../src/map/MapGeometry.js';
import { createMapNode } from '../src/map/TileGrid.js';

const view = { offsetX: 100, offsetY: 120, scale: 1, canvasWidth: 900, canvasHeight: 800 };
const node = { width: 10, height: 12 };

test('labelSize keeps its bounds in CSS px on a dense screen', () => {
  const scale = { factor: 0.3, min: 14, max: 42 };
  assert.equal(labelSize(20, scale), 14);
  assert.equal(labelSize(20, scale, 2), 28);
  assert.equal(labelSize(1000, scale, 2), 84);
});

test('coordLabelLayout returns null with no node or tiny tiles', () => {
  assert.equal(coordLabelLayout({ ...view, node: null }, 48), null);
  assert.equal(coordLabelLayout({ ...view, node, scale: 0.3 }, 48), null);
});

test('coordLabelLayout places the digits off the top and left edges', () => {
  const layout = coordLabelLayout({ ...view, node }, 48);
  assert.ok(layout);
  assert.equal(layout.fontSize, labelSize(48, COORD_SCALE));
  assert.equal(layout.colPinned, false);
  assert.equal(layout.rowPinned, false);
  assert.ok(layout.colY < view.offsetY);
  assert.ok(layout.rowX < view.offsetX);
  assert.deepEqual(layout.strips, [layout.columns, layout.rows]);
  assert.equal(layout.columns?.w, 480);
  assert.equal(layout.rows?.h, 576);
});

test('coordLabelLayout pins the digits and drops a strip off the canvas', () => {
  const pinned = coordLabelLayout({ ...view, node, offsetX: -2000, offsetY: 0 }, 48);
  assert.ok(pinned);
  assert.equal(pinned.colPinned, true);
  assert.equal(pinned.rowPinned, true);
  assert.equal(pinned.columns, null);
  assert.deepEqual(pinned.strips, [pinned.rows]);
  const below = coordLabelLayout({ ...view, node, offsetY: 900 }, 48);
  assert.equal(below?.rows, null);
});

test('a north or west band clears the coordinate digits', () => {
  const map = createMapNode('child', 'Thornhold', 'world', 10, 12);
  // The west gutter is wide enough for the band beside the row digits.
  const wide = { ...view, offsetX: 300 };
  for (const side of /** @type {const} */ (['north', 'west'])) {
    const exit = { kind: 'edge', side, targetNodeId: 'r', targetName: 'Saltmere' };
    const geom = exitBandGeometry(map, wide, 48, /** @type {any} */ (exit));
    const band = edgeExitBand(/** @type {any} */ (exit), geom);
    const layout = coordLabelLayout({ ...wide, node: map }, 48);
    const strip = side === 'north' ? layout?.columns : layout?.rows;
    assert.ok(strip);
    if (side === 'north') assert.ok(band.y + band.h <= strip.y);
    else assert.ok(band.x + band.w <= strip.x);
  }
});

test('a band with tiny tiles skips the digit gap', () => {
  const map = createMapNode('child', 'Thornhold', 'world', 10, 12);
  const exit = /** @type {const} */ ({
    kind: 'edge',
    side: 'north',
    targetNodeId: 'r',
    targetName: 'Saltmere',
  });
  const small = { ...view, scale: 0.3 };
  const band = edgeExitBand(exit, exitBandGeometry(map, small, 48, exit));
  assert.equal(band.y, view.offsetY - 10 - 26);
});

test('a band takes its sizes in CSS px on a dense screen', () => {
  const map = createMapNode('child', 'Thornhold', 'world', 10, 12);
  const exit = /** @type {const} */ ({
    kind: 'edge',
    side: 'south',
    targetNodeId: 'r',
    targetName: 'Saltmere',
  });
  const dense = exitBandGeometry(map, { ...view, scale: 0.3, pixelRatio: 2 }, 48, exit);
  const band = edgeExitBand(exit, dense);
  assert.equal(band.h, 52);
  assert.equal(band.fontSize, 24);
  assert.equal(exitBandDepth(), 26);
  assert.equal(exitBandDepth(2), 52);
});

test('fitSides adds room for north and south bands only', () => {
  const sides = fitSides({
    lead: 64,
    trail: 16,
    exitSides: ['north', 'south', 'east', 'west'],
    bandDepth: 26,
    canvasWidth: 900,
  });
  assert.deepEqual(sides, { top: 98, right: 16, bottom: 50, left: 64 });
  assert.deepEqual(fitSides({ lead: 64, trail: 16, canvasWidth: 900 }), {
    top: 64,
    right: 16,
    bottom: 16,
    left: 64,
  });
});

test('fitSides keeps the map clear of chrome at the top of the canvas', () => {
  const miniMap = { x: 12, y: 12, w: 150, h: 170 };
  const toolbar = { x: 600, y: 8, w: 290, h: 40 };
  const rightPanel = { x: 780, y: 10, w: 110, h: 200 };
  const low = { x: 12, y: 500, w: 150, h: 170 };
  const middle = { x: 300, y: 10, w: 50, h: 200 };
  const sides = fitSides({
    lead: 64,
    trail: 16,
    occluders: [miniMap, toolbar, rightPanel, low, middle],
    canvasWidth: 900,
  });
  assert.deepEqual(sides, { top: 80, right: 128, bottom: 16, left: 170 });
});

test('fitToExtent uses the sides it is given', () => {
  const sides = { top: 100, right: 10, bottom: 50, left: 200 };
  const fitted = fitToExtent(100, 100, 610, 450, { sides, maxScale: 10 });
  assert.equal(fitted.scale, 3);
  assert.equal(fitted.offsetX, 250);
  assert.equal(fitted.offsetY, 100);
});
