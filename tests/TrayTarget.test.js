import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTarget, rollTarget } from '../src/dice/TrayTarget.js';

test('parseTarget reads a number and treats a blank or bad field as none', () => {
  assert.equal(parseTarget('15'), 15);
  assert.equal(parseTarget(''), null);
  assert.equal(parseTarget('  '), null);
  assert.equal(parseTarget('abc'), null);
});

test('a borrowed roll uses the typed target, and ignores the one it passed', () => {
  assert.equal(rollTarget(13, '15', true), 15);
  assert.equal(rollTarget(null, '', true), null);
});

test('any other roll uses the target it passed, for that roll only', () => {
  assert.equal(rollTarget(13, '15', false), 13);
  assert.equal(rollTarget(null, '15', false), null);
});
