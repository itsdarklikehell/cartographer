import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveStatusText } from '../src/view/SaveStatus.js';

const MIN = 60_000;

test('saveStatusText names unsaved changes first', () => {
  assert.equal(saveStatusText(true, 0, 10 * MIN), 'Unsaved changes');
});

test('saveStatusText reads no unsaved changes before the first write', () => {
  assert.equal(saveStatusText(false, null, 0), 'No unsaved changes');
});

test('saveStatusText counts the time since the last write', () => {
  assert.equal(saveStatusText(false, 1000, 500), 'Saved just now');
  assert.equal(saveStatusText(false, 0, 59_999), 'Saved just now');
  assert.equal(saveStatusText(false, 0, 5 * MIN), 'Saved 5 min ago');
  assert.equal(saveStatusText(false, 0, 59 * MIN), 'Saved 59 min ago');
  assert.equal(saveStatusText(false, 0, 125 * MIN), 'Saved 2 h ago');
});
