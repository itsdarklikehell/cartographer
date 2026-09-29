import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEntry,
  appendEntry,
  entriesAfter,
  isoTimestamp,
  TRAVELOG_LIMIT,
  TRAVELOG_FIGHT_LIMIT,
} from '../src/log/Travelogue.js';

test('createEntry builds an entry with the given fields', () => {
  const entry = createEntry('e1', 'travel', 'Entered the Keep.', 1000);
  assert.deepEqual(entry, { id: 'e1', kind: 'travel', message: 'Entered the Keep.', at: 1000 });
});

test('appendEntry adds to the end, keeping oldest-first order', () => {
  let log = [];
  log = appendEntry(log, createEntry('e1', 'travel', 'A', 1));
  log = appendEntry(log, createEntry('e2', 'combat', 'B', 2));
  assert.deepEqual(
    log.map((e) => e.id),
    ['e1', 'e2'],
  );
});

test('appendEntry does not mutate the input list', () => {
  const log = [createEntry('e1', 'travel', 'A', 1)];
  const next = appendEntry(log, createEntry('e2', 'travel', 'B', 2));
  assert.equal(log.length, 1);
  assert.equal(next.length, 2);
});

test('appendEntry trims the oldest entries once past the limit', () => {
  let log = [];
  for (let i = 0; i < TRAVELOG_LIMIT + 5; i++) {
    log = appendEntry(log, createEntry(`e${i}`, 'travel', `m${i}`, i));
  }
  assert.equal(log.length, TRAVELOG_LIMIT);
  // The five oldest (e0..e4) were dropped; the newest is retained.
  assert.equal(log[0].id, 'e5');
  assert.equal(log[log.length - 1].id, `e${TRAVELOG_LIMIT + 4}`);
});

test('appendEntry honors a custom limit', () => {
  let log = [];
  for (let i = 0; i < 4; i++) log = appendEntry(log, createEntry(`e${i}`, 'note', 'x', i), 2);
  assert.deepEqual(
    log.map((e) => e.id),
    ['e2', 'e3'],
  );
});

test('entriesAfter returns the whole log when nothing was rendered yet', () => {
  const log = [createEntry('e1', 'travel', 'A', 1), createEntry('e2', 'combat', 'B', 2)];
  assert.deepEqual(entriesAfter(log, null), log);
  assert.deepEqual(entriesAfter([], null), []);
});

test('entriesAfter returns only the entries newer than the given id', () => {
  const log = ['e1', 'e2', 'e3'].map((id, i) => createEntry(id, 'note', id, i));
  assert.deepEqual(
    entriesAfter(log, 'e1').map((e) => e.id),
    ['e2', 'e3'],
  );
  assert.deepEqual(entriesAfter(log, 'e3'), []);
});

test('entriesAfter still finds the id after older entries were trimmed away', () => {
  let log = [];
  for (let i = 0; i < 5; i++) log = appendEntry(log, createEntry(`e${i}`, 'note', 'x', i), 3);
  // e2 survived the trim to ['e2','e3','e4'].
  assert.deepEqual(
    entriesAfter(log, 'e2').map((e) => e.id),
    ['e3', 'e4'],
  );
});

test('entriesAfter returns null when the id is gone, signalling a rebuild', () => {
  const log = [createEntry('e9', 'note', 'x', 9)];
  assert.equal(entriesAfter(log, 'e1'), null);
  assert.equal(entriesAfter([], 'e1'), null);
});

test('isoTimestamp formats a real date and gives null for one it cannot read', () => {
  assert.equal(isoTimestamp(0), '1970-01-01T00:00:00.000Z');
  assert.equal(isoTimestamp(Number.NaN), null);
  assert.equal(isoTimestamp(8.64e15 + 1), null, 'past the largest date a Date can hold');
});

test('a running fight keeps its own entries past the limit', () => {
  /** @type {import('../src/types/log.js').LogEntry[]} */
  let log = [];
  const add = (i, keepSince) => {
    log = appendEntry(log, createEntry(`e${i}`, 'combat', `m${i}`, i), 3, keepSince);
  };
  for (let i = 0; i < 3; i++) add(i, null);
  // The fight starts at time 2, so e2 onward belongs to it.
  for (let i = 3; i < 6; i++) add(i, 2);
  assert.deepEqual(
    log.map((e) => e.id),
    ['e2', 'e3', 'e4', 'e5'],
    'only the entries older than the fight are trimmed',
  );
  add(6, null);
  assert.equal(log.length, 3, 'the first append after the fight trims back to the limit');
  add(7, 99);
  assert.deepEqual(
    log.map((e) => e.id),
    ['e5', 'e6', 'e7'],
    'a fight start later than every entry still trims to the limit',
  );
});

test('a fight that never ends stops growing at the fight limit', () => {
  /** @type {import('../src/types/log.js').LogEntry[]} */
  let log = [];
  for (let i = 0; i < TRAVELOG_FIGHT_LIMIT + 5; i++) {
    log = appendEntry(log, createEntry(`e${i}`, 'combat', `m${i}`, i), TRAVELOG_LIMIT, 0);
  }
  assert.equal(log.length, TRAVELOG_FIGHT_LIMIT);
  assert.equal(log[0].id, 'e5');
});
