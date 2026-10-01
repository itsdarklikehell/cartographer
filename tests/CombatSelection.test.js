import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heldTarget, turnKey } from '../src/view/CombatSelection.js';

const fight = (/** @type {number} */ round, /** @type {number} */ index) =>
  /** @type {any} */ ({
    round,
    index,
    order: [
      { id: 'mirelle', side: 'party' },
      { id: 'scout', side: 'foe' },
    ],
  });
const alive = () => false;

test('turnKey names the round and the index, or null with no fight', () => {
  assert.equal(turnKey(fight(2, 1)), '2:1');
  assert.equal(turnKey(null), null);
});

test('a target stays held on its own turn', () => {
  const next = heldTarget({
    selectedId: 'scout',
    heldTurn: '1:0',
    combat: fight(1, 0),
    gone: alive,
  });
  assert.deepEqual(next, { selectedId: 'scout', heldTurn: '1:0' });
});

test('a new turn, or a new round on the same index, releases the target', () => {
  for (const combat of [fight(1, 1), fight(2, 0)]) {
    const next = heldTarget({ selectedId: 'scout', heldTurn: '1:0', combat, gone: alive });
    assert.equal(next.selectedId, null);
    assert.equal(next.heldTurn, turnKey(combat));
  }
});

test('a gone target, one out of the order, or an ended fight is released', () => {
  const combat = fight(1, 0);
  assert.equal(
    heldTarget({ selectedId: 'scout', heldTurn: '1:0', combat, gone: () => true }).selectedId,
    null,
  );
  assert.equal(
    heldTarget({ selectedId: 'ghost', heldTurn: '1:0', combat, gone: alive }).selectedId,
    null,
  );
  assert.deepEqual(
    heldTarget({ selectedId: 'scout', heldTurn: '1:0', combat: null, gone: alive }),
    {
      selectedId: null,
      heldTurn: null,
    },
  );
});

test('with no target, the refresh only records the turn', () => {
  assert.deepEqual(
    heldTarget({ selectedId: null, heldTurn: null, combat: fight(3, 1), gone: alive }),
    {
      selectedId: null,
      heldTurn: '3:1',
    },
  );
});

test('a target held with no fight running is released', () => {
  const next = heldTarget({ selectedId: 'scout', heldTurn: null, combat: null, gone: alive });
  assert.equal(next.selectedId, null);
});
