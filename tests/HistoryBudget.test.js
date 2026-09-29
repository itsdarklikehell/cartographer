import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newestSnapshot,
  olderSnapshotRoom,
  recordsToDrop,
  snapshotFits,
} from '../src/storage/HistoryBudget.js';

/** @param {number} bytes */
const delta = (bytes) => ({ bytes, snapshot: false });
/** @param {number} bytes */
const snap = (bytes) => ({ bytes, snapshot: true });

test('recordsToDrop keeps a log that fits both budgets', () => {
  assert.equal(recordsToDrop([delta(10), snap(500), delta(10)], 100, 0), 0);
  assert.equal(recordsToDrop([], 100, 0), 0);
});

test('recordsToDrop drops the oldest deltas until the rest fit the cap', () => {
  assert.equal(recordsToDrop([delta(60), delta(30), delta(30), delta(30)], 100, 0), 1);
  assert.equal(recordsToDrop([delta(60), delta(60), delta(60)], 100, 0), 2);
});

test('recordsToDrop does not count the newest snapshot against the cap or the room', () => {
  assert.equal(recordsToDrop([delta(10), snap(10_000), delta(10), delta(10)], 100, 0), 0);
});

test('recordsToDrop drops an older snapshot, and every older record, when it passes the room', () => {
  const records = [delta(10), snap(700), delta(10), snap(900), delta(10)];
  assert.equal(recordsToDrop(records, 100, 699), 2);
  assert.equal(recordsToDrop(records, 100, 700), 0);
});

test('recordsToDrop drops the newest snapshot when later deltas pass the cap', () => {
  assert.equal(recordsToDrop([snap(900), delta(80), delta(80)], 100, 0), 2);
});

test('recordsToDrop always keeps the newest record', () => {
  assert.equal(recordsToDrop([delta(500), delta(500)], 100, 0), 1);
  assert.equal(recordsToDrop([snap(500), snap(500)], 100, -1), 1);
});

test('newestSnapshot finds the last snapshot record', () => {
  assert.equal(newestSnapshot([snap(1), delta(1), snap(1), delta(1)]), 2);
  assert.equal(newestSnapshot([delta(1)]), -1);
});

test('olderSnapshotRoom subtracts the cap, the other keys, and the newest snapshot', () => {
  assert.equal(olderSnapshotRoom({ quota: 1000, cap: 100, outside: 300, newest: 200 }), 400);
  assert.equal(olderSnapshotRoom({ quota: 1000, cap: 100, outside: 800, newest: 200 }), -100);
});

test('snapshotFits compares the snapshot and the other keys with the quota', () => {
  assert.equal(snapshotFits({ quota: 1000, outside: 600, snapshot: 400 }), true);
  assert.equal(snapshotFits({ quota: 1000, outside: 600, snapshot: 401 }), false);
});
