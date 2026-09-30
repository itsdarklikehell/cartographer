import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightWarning } from '../src/time/NightWalk.js';

const path = ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0'];

test('a walk that ends before Night raises no warning', () => {
  assert.equal(nightWarning({ day: 1, watch: 4, minutes: 60 }, 30, 5, path), null);
  assert.equal(nightWarning({ day: 1, watch: 4 }, 0, 5, path), null, 'a free walk');
  assert.equal(nightWarning({ day: 1, watch: 5 }, 30, 5, path), null, 'already Night');
});

test('a walk into Night offers to stop at the last step before it', () => {
  const warning = nightWarning({ day: 2, watch: 4, minutes: 170 }, 30, 5, path);
  assert.deepEqual(warning, {
    night: 2,
    message: 'The walk takes 2 hours 30 minutes, and Night falls on the way.',
    stop: ['0,0', '1,0', '2,0'],
  });
});

test('the stop is empty when the first step reaches Night or no path exists', () => {
  const late = { day: 3, watch: 4, minutes: 230 };
  assert.equal(nightWarning(late, 30, 5, path)?.stop, null);
  assert.equal(nightWarning({ day: 3, watch: 4 }, 240, 2, null)?.stop, null, 'forced move');
});

test('a walk from Dusk into the next day names the day Night falls on', () => {
  assert.equal(nightWarning({ day: 4, watch: 3 }, 240, 3, null)?.night, 4);
});
