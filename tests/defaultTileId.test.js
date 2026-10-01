import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultTileId } from '../src/app/locationFields.js';

test('defaultTileId keeps the selected tile', () => {
  assert.equal(defaultTileId({ width: 22, height: 22 }, '4,5'), '4,5');
});

test('defaultTileId falls back to the middle tile of the map', () => {
  assert.equal(defaultTileId({ width: 22, height: 14 }, null), '10,6');
  assert.equal(defaultTileId({ width: 1, height: 1 }, null), '0,0');
  assert.equal(defaultTileId({ width: 0, height: 0 }, null), '0,0');
});
