import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toastPlace } from '../src/view/ToastPlace.js';

const row = { top: 74, bottom: 105, right: 1041, height: 31 };

test('toastPlace lines the stack up with the right end of the row', () => {
  assert.deepEqual(toastPlace(row, 300, 240, 1440, 900), { top: 74, right: 399 });
});

test('toastPlace moves the stack below the row when the trail leaves no room', () => {
  // A 390 px screen: the trail ends at 250 and the stack is 200 wide.
  const narrow = { top: 240, bottom: 270, right: 374, height: 30 };
  assert.deepEqual(toastPlace(narrow, 250, 200, 390, 844), { top: 278, right: 16 });
  assert.deepEqual(toastPlace(narrow, 166, 200, 390, 844), { top: 240, right: 16 });
});

test('toastPlace keeps a gap from the window edges', () => {
  assert.deepEqual(toastPlace({ ...row, top: -10, bottom: 21, right: 1440 }, 0, 240, 1440, 900), {
    top: 8,
    right: 8,
  });
});

test('toastPlace gives null for a hidden or scrolled-away row', () => {
  assert.equal(toastPlace({ ...row, height: 0 }, 0, 240, 1440, 900), null);
  assert.equal(toastPlace({ ...row, top: -40, bottom: 0 }, 0, 240, 1440, 900), null);
  assert.equal(toastPlace({ ...row, top: 900, bottom: 931 }, 0, 240, 1440, 900), null);
});
