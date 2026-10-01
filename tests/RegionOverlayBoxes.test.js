import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellBoxes } from '../src/map/RegionOverlay.js';

test('cellBoxes turns tile ids into screen boxes and skips bad ids', () => {
  const view = /** @type {any} */ ({ offsetX: 5, offsetY: 10 });
  assert.deepEqual(cellBoxes(['2,1', 'nope'], view, 20), [{ x: 45, y: 30, w: 20, h: 20 }]);
});
