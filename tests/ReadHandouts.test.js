import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  READ_HANDOUTS_KEY,
  forgetReadHandouts,
  recordReadHandouts,
} from '../src/view/ReadHandouts.js';

function memoryStorage() {
  /** @type {Map<string, string>} */
  const items = new Map();
  let writes = 0;
  return {
    items,
    writes: () => writes,
    getItem: (/** @type {string} */ key) => items.get(key) ?? null,
    setItem: (/** @type {string} */ key, /** @type {string} */ value) => {
      writes += 1;
      items.set(key, value);
    },
    removeItem: (/** @type {string} */ key) => void items.delete(key),
  };
}

const known = new Set(['map', 'letter', 'song']);

test('handouts listed before come back after a reload', () => {
  const storage = memoryStorage();
  assert.deepEqual([...recordReadHandouts(storage, 'wren', ['map'], known)], ['map']);
  const seen = recordReadHandouts(storage, 'wren', ['letter'], known);
  assert.deepEqual([...seen].sort(), ['letter', 'map']);
});

test('each viewer has its own list, and a spectator uses the empty key', () => {
  const storage = memoryStorage();
  recordReadHandouts(storage, 'wren', ['map'], known);
  recordReadHandouts(storage, null, ['song'], known);
  assert.deepEqual([...recordReadHandouts(storage, 'aldric', [], known)], []);
  assert.deepEqual(JSON.parse(storage.items.get(READ_HANDOUTS_KEY) ?? ''), {
    wren: ['map'],
    '': ['song'],
  });
});

test('an unchanged list is not written again', () => {
  const storage = memoryStorage();
  recordReadHandouts(storage, 'wren', ['map'], known);
  recordReadHandouts(storage, 'wren', ['map'], known);
  assert.equal(storage.writes(), 1);
});

test('ids of handouts no longer in the campaign are pruned', () => {
  const storage = memoryStorage();
  storage.items.set(READ_HANDOUTS_KEY, JSON.stringify({ wren: ['map', 'gone', 3] }));
  assert.deepEqual([...recordReadHandouts(storage, 'wren', [], known)], ['map']);
  assert.deepEqual(JSON.parse(storage.items.get(READ_HANDOUTS_KEY) ?? ''), { wren: ['map'] });
});

test('an unreadable or wrong-type record reads as empty', () => {
  const storage = memoryStorage();
  for (const raw of ['{not json', '[1]', 'null', JSON.stringify({ wren: 'map' })]) {
    storage.items.set(READ_HANDOUTS_KEY, raw);
    assert.deepEqual([...recordReadHandouts(storage, 'wren', [], known)], []);
  }
});

test('forgetReadHandouts removes the record', () => {
  const storage = memoryStorage();
  recordReadHandouts(storage, 'wren', ['map'], known);
  forgetReadHandouts(storage);
  assert.equal(storage.items.size, 0);
});

test('a storage that throws gives the listed ids and does not throw', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  assert.deepEqual([...recordReadHandouts(broken, 'wren', ['map'], known)], ['map']);
  assert.doesNotThrow(() => forgetReadHandouts(broken));
});
