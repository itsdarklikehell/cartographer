import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepViewForReload, startingCharacterId, takeReloadView } from '../src/view/ReloadView.js';

function memoryStorage() {
  /** @type {Map<string, string>} */
  const items = new Map();
  return {
    items,
    getItem: (/** @type {string} */ key) => items.get(key) ?? null,
    setItem: (/** @type {string} */ key, /** @type {string} */ value) => void items.set(key, value),
    removeItem: (/** @type {string} */ key) => void items.delete(key),
  };
}

test('a kept view comes back once, then the record is gone', () => {
  const storage = memoryStorage();
  keepViewForReload(storage, {
    characterId: 'wren',
    tabs: ['tab-log', 'tab-inventory'],
    mode: 'build',
  });
  assert.deepEqual(takeReloadView(storage), {
    characterId: 'wren',
    tabs: ['tab-log', 'tab-inventory'],
    mode: 'build',
  });
  assert.equal(takeReloadView(storage), null);
});

test('takeReloadView drops fields of the wrong type', () => {
  const storage = memoryStorage();
  storage.setItem(
    'campaign-builder:reload-view',
    JSON.stringify({ characterId: 3, tabs: [1, 'a'], mode: 'combat' }),
  );
  assert.deepEqual(takeReloadView(storage), { characterId: null, tabs: ['a'], mode: null });
  storage.setItem('campaign-builder:reload-view', JSON.stringify({ tabs: 'x' }));
  assert.deepEqual(takeReloadView(storage), { characterId: null, tabs: [], mode: null });
  storage.setItem('campaign-builder:reload-view', 'null');
  assert.deepEqual(takeReloadView(storage), { characterId: null, tabs: [], mode: null });
});

test('takeReloadView gives null for unreadable text and clears it', () => {
  const storage = memoryStorage();
  storage.setItem('campaign-builder:reload-view', '{not json');
  assert.equal(takeReloadView(storage), null);
  assert.equal(storage.items.size, 0);
});

test('a storage that throws gives no view and does not throw', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
    removeItem: () => {},
  };
  assert.doesNotThrow(() => keepViewForReload(broken, { characterId: null, tabs: [], mode: null }));
  assert.equal(takeReloadView(broken), null);
});

test('startingCharacterId keeps a stored character only while it is in the roster', () => {
  const roster = [{ id: 'aldric' }, { id: 'wren' }];
  const view = { characterId: 'wren', tabs: [], mode: null };
  assert.equal(startingCharacterId(view, roster, 'aldric'), 'wren');
  assert.equal(startingCharacterId(view, [{ id: 'aldric' }], 'aldric'), 'aldric');
  assert.equal(
    startingCharacterId({ characterId: null, tabs: [], mode: null }, roster, 'aldric'),
    'aldric',
  );
  assert.equal(startingCharacterId(null, roster, null), null);
});
