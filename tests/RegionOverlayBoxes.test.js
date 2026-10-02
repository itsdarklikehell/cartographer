import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellBoxes, mapAreaEdge } from '../src/map/RegionOverlay.js';

test('cellBoxes turns tile ids into screen boxes and skips bad ids', () => {
  const view = /** @type {any} */ ({ offsetX: 5, offsetY: 10 });
  assert.deepEqual(cellBoxes(['2,1', 'nope'], view, 20), [{ x: 45, y: 30, w: 20, h: 20 }]);
});

const view = (/** @type {number} */ offset) => ({
  node: { width: 30, height: 30 },
  offsetX: offset,
  offsetY: offset,
  scale: 1,
  canvasWidth: 800,
  canvasHeight: 600,
});

test('mapAreaEdge starts a name past the digit strips pinned to the canvas edge', () => {
  const edge = mapAreaEdge(view(-200), 40);
  // The pinned digits use a 14 px font, centred 12.6 px in from each edge.
  assert.ok(edge.x > 20 && edge.x < 30, `x ${edge.x}`);
  assert.ok(edge.y > 20 && edge.y < 30, `y ${edge.y}`);
});

test('mapAreaEdge ignores digit strips that sit off the map beside it', () => {
  const edge = mapAreaEdge(view(100), 40);
  assert.ok(edge.x < 100 && edge.y < 100, JSON.stringify(edge));
});

test('mapAreaEdge falls back to the canvas edge with no digits', () => {
  assert.deepEqual(mapAreaEdge({ ...view(-200), node: null }, 40), { x: 0, y: 0 });
  assert.deepEqual(mapAreaEdge({ ...view(-200), scale: 0.1 }, 40), { x: 0, y: 0 });
});
