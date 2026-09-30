import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hpTargetId } from '../src/view/CombatHpTarget.js';

const HP = { current: 5, max: 10, bonus: 0 };

/** A view of three rows, with the turn on `turnIndex`. */
function view(turnIndex = 0, rows = ['boss', 'mirelle', 'wolf']) {
  return /** @type {any} */ ({
    turnIndex,
    rows: rows.map((id) => ({ id, hp: id === 'nohp' ? null : HP })),
  });
}

test('a pick in the box wins over every other candidate', () => {
  const ids = { picked: 'wolf', selectedId: 'mirelle', inspectedId: 'boss' };
  assert.equal(hpTargetId(view(), ids), 'wolf');
});

test('the selected card wins over the inspected row and the current turn', () => {
  assert.equal(hpTargetId(view(), { selectedId: 'mirelle', inspectedId: 'wolf' }), 'mirelle');
});

test('the inspected row wins when nothing is selected', () => {
  assert.equal(hpTargetId(view(), { inspectedId: 'wolf' }), 'wolf');
});

test('with no other candidate, the box targets the current turn', () => {
  assert.equal(hpTargetId(view(1), {}), 'mirelle');
});

test('a stale id falls through to the next candidate', () => {
  assert.equal(hpTargetId(view(), { picked: 'gone', selectedId: 'wolf' }), 'wolf');
});

test('a row without HP is never the target', () => {
  assert.equal(hpTargetId(view(0, ['nohp', 'wolf']), { selectedId: 'nohp' }), 'wolf');
  assert.equal(hpTargetId(view(0, ['nohp']), {}), null);
  assert.equal(hpTargetId(view(5, ['nohp', 'wolf']), {}), 'wolf');
});
