import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, expandFog, expandIndexRuns, fogRuns, indexRuns } from '../src/storage/RunLength.js';

test('indexRuns pairs a run of three and drops the trailing empty run', () => {
  assert.deepEqual(indexRuns([0, 0, 0, 1, 1, EMPTY, EMPTY]), [[0, 3], 1, 1]);
  assert.deepEqual(indexRuns([EMPTY, EMPTY]), []);
  assert.deepEqual(indexRuns([]), []);
});

test('expandIndexRuns reads a stream back and fills the rest with EMPTY', () => {
  assert.deepEqual([...expandIndexRuns([[0, 3], 1, 1], 7)], [0, 0, 0, 1, 1, -1, -1]);
  assert.deepEqual([...expandIndexRuns('nope', 2)], [-1, -1]);
  // A stream longer than the grid stops at the last position.
  assert.deepEqual([...expandIndexRuns([[2, 99], 3], 3)], [2, 2, 2]);
  // An unreadable run ends the stream.
  assert.deepEqual([...expandIndexRuns([1, [1, 'x'], 1], 3)], [1, -1, -1]);
});

test('expandIndexRuns reads an index outside the 32-bit range as EMPTY', () => {
  // 2^32 wraps to 0 in an Int32Array, which names a real palette slot.
  assert.deepEqual([...expandIndexRuns([2 ** 32, [-7, 2]], 3)], [-1, -1, -1]);
});

test('fog runs alternate from an unrevealed run and read back', () => {
  const bits = [false, true, true, false, false];
  const runs = fogRuns(bits);
  assert.deepEqual(runs, [1, 2]);
  assert.deepEqual([...expandFog(runs, 5)], [0, 1, 1, 0, 0]);
  assert.deepEqual(fogRuns([false, false]), []);
  assert.deepEqual(fogRuns([true, true]), [0, 2]);
  assert.deepEqual([...expandFog('x', 2)], [0, 0]);
  assert.deepEqual([...expandFog([0, 9], 2)], [1, 1]);
  assert.deepEqual([...expandFog([1, -1, 1], 3)], [0, 0, 0]);
});
