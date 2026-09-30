import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollHpPool, walkHpPool } from '../src/entities/HpPool.js';

/** A deterministic RNG that replays a queue of unit values, then returns 0. */
function seq(values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/** The rng value that makes a d`sides` roll come up `value`. */
const face = (sides, value) => (value - 1) / sides + 1e-9;

test('a pool rolls its dice and the dice each scaling increment adds', () => {
  const pool = rollHpPool({ count: 2, sides: 8, perStep: 2 }, 1, seq([face(8, 3), face(8, 5)]));
  assert.equal(pool.dice, '4d8');
  assert.deepEqual(pool.rolls, [3, 5, 1, 1]);
  assert.equal(pool.total, 10);
  assert.equal(rollHpPool({ count: 1, sides: 6 }, 3, seq([face(6, 6)])).dice, '1d6');
});

test('the walk takes the lowest HP first and leaves out a target that does not fit', () => {
  const walk = walkHpPool(
    [
      { id: 'ogre', hp: 30 },
      { id: 'kobold', hp: 5 },
      { id: 'goblin', hp: 7 },
      { id: 'imp', hp: 7 },
    ],
    20,
    'Unconscious',
  );
  assert.deepEqual(
    walk.map((w) => [w.target.id, w.affected, w.reason]),
    [
      ['kobold', true, 'within the pool'],
      ['goblin', true, 'within the pool'],
      ['imp', true, 'within the pool'],
      ['ogre', false, 'the pool runs out'],
    ],
  );
});

test('the walk passes over a downed, a sleeping, or an already affected target', () => {
  const blinded = [{ name: 'blinded' }];
  const walk = walkHpPool(
    [
      { id: 'unknown' },
      { id: 'down', hp: 0 },
      { id: 'asleep', hp: 2, conditions: [{ name: 'Unconscious' }] },
      { id: 'blind', hp: 3, conditions: blinded },
      { id: 'fresh', hp: 4, conditions: [{ name: 'Prone' }] },
    ],
    6,
    'Blinded',
  );
  assert.deepEqual(
    walk.map((w) => [w.target.id, w.affected, w.reason]),
    [
      ['down', false, 'at 0 HP'],
      ['asleep', false, 'already Unconscious'],
      ['blind', false, 'already Blinded'],
      ['fresh', true, 'within the pool'],
      ['unknown', true, 'HP unknown'],
    ],
  );
});

test('a pool that imposes no condition passes over only the downed and the sleeping', () => {
  const walk = walkHpPool([{ id: 'a', hp: 3, conditions: [{ name: 'Blinded' }] }], 5, undefined);
  assert.equal(walk[0].affected, true);
});
