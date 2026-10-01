import { test } from 'node:test';
import assert from 'node:assert/strict';

import { switcherIndex } from '../src/view/SheetSwitcher.js';

test('Left and Right step through the switcher and wrap', () => {
  assert.equal(switcherIndex('ArrowRight', 0, 4), 1);
  assert.equal(switcherIndex('ArrowRight', 3, 4), 0);
  assert.equal(switcherIndex('ArrowLeft', 0, 4), 3);
  assert.equal(switcherIndex('ArrowLeft', 2, 4), 1);
});

test('Home and End jump to the ends', () => {
  assert.equal(switcherIndex('Home', 2, 4), 0);
  assert.equal(switcherIndex('End', 0, 4), 3);
});

test('other keys and an empty switcher give no move', () => {
  assert.equal(switcherIndex('Enter', 1, 4), null);
  assert.equal(switcherIndex('ArrowRight', 0, 0), null);
});
