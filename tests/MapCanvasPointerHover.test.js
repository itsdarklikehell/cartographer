import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapCanvasPointer } from '../src/map/MapCanvasPointer.js';

test('resetHover forgets the hovered cell and reports that no cell is hovered', () => {
  /** @type {unknown[][]} */
  const calls = [];
  const host = /** @type {any} */ ({ onCellHover: (...args) => calls.push(args) });
  const pointer = new MapCanvasPointer(host);
  pointer._hoverCellId = '3,4';
  pointer.resetHover();
  assert.equal(pointer._hoverCellId, null);
  assert.deepEqual(calls, [[null, 0, 0]]);
});

test('resetHover works on a host with no hover handler', () => {
  const pointer = new MapCanvasPointer(/** @type {any} */ ({}));
  pointer._hoverCellId = '1,1';
  pointer.resetHover();
  assert.equal(pointer._hoverCellId, null);
});
