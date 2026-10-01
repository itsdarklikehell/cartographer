import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserStorage, readFolds, toggleFold } from '../src/view/FoldMemory.js';

/** @returns {Storage} */
function memoryStorage() {
  const map = new Map();
  return /** @type {Storage} */ (
    /** @type {unknown} */ ({
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
    })
  );
}

const broken = /** @type {Storage} */ (
  /** @type {unknown} */ ({
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  })
);

test('readFolds gives the defaults when nothing is stored', () => {
  assert.deepEqual([...readFolds(memoryStorage(), 'k', ['Completed'])], ['Completed']);
  assert.deepEqual([...readFolds(null, 'k', ['a'])], ['a']);
});

test('readFolds gives the defaults when the read throws or the value is not a list', () => {
  assert.deepEqual([...readFolds(broken, 'k', ['a'])], ['a']);
  const storage = memoryStorage();
  storage.setItem('k', '{"a":1}');
  assert.deepEqual([...readFolds(storage, 'k', ['a'])], ['a']);
  storage.setItem('k', 'not json');
  assert.deepEqual([...readFolds(storage, 'k', ['a'])], ['a']);
});

test('toggleFold stores the set, and readFolds reads it back without stray entries', () => {
  const storage = memoryStorage();
  const folds = readFolds(storage, 'k', ['Completed']);
  assert.equal(toggleFold(storage, 'k', folds, 'Completed'), false);
  assert.equal(toggleFold(storage, 'k', folds, 'npcs'), true);
  assert.deepEqual([...readFolds(storage, 'k', ['Completed'])], ['npcs']);
  storage.setItem('k', '["x", 3]');
  assert.deepEqual([...readFolds(storage, 'k', [])], ['x']);
});

test('toggleFold changes the set in memory when the write throws', () => {
  const folds = new Set();
  assert.equal(toggleFold(broken, 'k', folds, 'a'), true);
  assert.ok(folds.has('a'));
  assert.equal(toggleFold(undefined, 'k', folds, 'a'), false);
});

test('browserStorage gives null where localStorage is missing or throws', () => {
  assert.equal(browserStorage(), globalThis.localStorage ?? null);
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('blocked');
    },
  });
  try {
    assert.equal(browserStorage(), null);
  } finally {
    if (desc) Object.defineProperty(globalThis, 'localStorage', desc);
    else delete globalThis.localStorage;
  }
});
