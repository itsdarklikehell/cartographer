import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlankMap } from '../src/map/BlankMap.js';

test('isBlankMap is true until one cell has tile art, and caches per node', () => {
  const blank = { tiles: [null, { imageRef: null }] };
  assert.equal(isBlankMap(blank), true);
  assert.equal(isBlankMap(blank), true);
  assert.equal(isBlankMap({ tiles: [null, { imageRef: 'grass' }] }), false);
});
