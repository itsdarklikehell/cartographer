import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foeTiles } from '../src/combat/FightMarkers.js';

/**
 * @param {string} disposition
 * @param {number} currentHP
 * @param {{ nodeId: string, tileId: string } | null} location
 */
const creature = (disposition, currentHP, location) =>
  /** @type {any} */ ({ kind: 'creature', entity: { disposition, currentHP, location } });

const at = (/** @type {string} */ tileId, nodeId = 'town') => ({ nodeId, tileId });

/** @type {Record<string, any>} */
const cast = {
  wolf: creature('hostile', 7, at('3,4')),
  wolf2: creature('hostile', 5, at('3,4')),
  goblin: creature('hostile', 0, at('5,5')),
  dorn: creature('friendly', 9, at('2,2')),
  bandit: creature('hostile', 4, at('1,1', 'wilds')),
  lost: creature('hostile', 4, null),
  mirelle: { kind: 'character', entity: { id: 'mirelle' } },
};
const order = [...Object.keys(cast), 'deleted'].map((id) => ({ id }));
const resolve = (/** @type {string} */ id) => cast[id] ?? null;

test('foeTiles marks each tile of a standing hostile creature once', () => {
  assert.deepEqual(foeTiles(order, 'town', resolve), ['3,4']);
});

test('foeTiles skips allies, defeated foes, other nodes, and unplaced foes', () => {
  assert.deepEqual(foeTiles(order, 'wilds', resolve), ['1,1']);
  assert.deepEqual(foeTiles([{ id: 'dorn' }, { id: 'goblin' }], 'town', resolve), []);
});
