import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocked, keyHolder, lockMessage, readLock, unlockNode } from '../src/map/NodeLock.js';

const item = (/** @type {string} */ name) => ({
  id: name,
  name,
  quantity: 1,
  notes: '',
  type: 'gear',
});

test('readLock reads a lock, trims the key, and gives null for no lock', () => {
  assert.deepEqual(readLock({ requires: '  Warding Key ', open: true }), {
    requires: 'Warding Key',
    open: true,
  });
  assert.deepEqual(readLock({ requires: ' ', open: 'yes' }), { requires: null, open: false });
  assert.deepEqual(readLock({ requires: 5 }), { requires: null, open: false });
  assert.equal(readLock(null), null);
  assert.equal(readLock('locked'), null);
});

test('isLocked is true only for a lock that is not open', () => {
  assert.equal(isLocked(/** @type {any} */ ({ lock: { requires: null, open: false } })), true);
  assert.equal(isLocked(/** @type {any} */ ({ lock: { requires: null, open: true } })), false);
  assert.equal(isLocked(/** @type {any} */ ({})), false);
  assert.equal(isLocked(null), false);
});

test('keyHolder matches the item name across characters without regard to case', () => {
  const lock = { requires: 'Warding Key', open: false };
  const wren = /** @type {any} */ ({ name: 'Wren', inventory: [item('Rope')] });
  const aldric = /** @type {any} */ ({ name: 'Aldric', inventory: [item('warding key ')] });
  const bare = /** @type {any} */ ({ name: 'Bare' });
  assert.equal(keyHolder([bare, wren, aldric], lock), aldric);
  assert.equal(keyHolder([wren], lock), null);
  assert.equal(keyHolder([aldric], { requires: null, open: false }), null);
});

test('lockMessage names the key and who carries it', () => {
  const lock = { requires: 'warding key', open: false };
  assert.equal(
    lockMessage(lock, /** @type {any} */ ({ name: 'Aldric' })),
    'Locked. Requires the warding key; Aldric carries it.',
  );
  assert.equal(
    lockMessage(lock, null),
    'Locked. Requires the warding key; Nobody in the party carries it.',
  );
  assert.equal(lockMessage({ requires: null, open: false }, null), 'Locked.');
});

test('unlockNode opens the lock and leaves a node with no lock alone', () => {
  const node = /** @type {any} */ ({ id: 'b', lock: { requires: 'key', open: false } });
  assert.deepEqual(unlockNode(node).lock, { requires: 'key', open: true });
  const open = /** @type {any} */ ({ id: 'c' });
  assert.equal(unlockNode(open), open);
});

test('lockFields and readLockFields turn a lock into dialog fields and back', async () => {
  const { lockFields, readLockFields } = await import('../src/map/NodeLock.js');
  assert.deepEqual(
    lockFields({ requires: 'key', open: false }).map((f) => f.value),
    ['locked', 'key'],
  );
  assert.equal(lockFields({ requires: null, open: true })[0].value, 'open');
  assert.deepEqual(
    lockFields(undefined).map((f) => f.value),
    ['', ''],
  );
  assert.deepEqual(readLockFields({ lockState: 'open', lockRequires: ' key ' }), {
    requires: 'key',
    open: true,
  });
  assert.deepEqual(readLockFields({ lockState: 'locked', lockRequires: '' }), {
    requires: null,
    open: false,
  });
  assert.equal(readLockFields({ lockState: '', lockRequires: 'key' }), null);
});
