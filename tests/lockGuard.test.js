import test from 'node:test';
import assert from 'node:assert/strict';

import { passLock } from '../src/app/lockGuard.js';
import { stubApp } from './helpers/app.js';

/** @param {'gm' | 'player'} role */
function fakeApp(role = 'gm', inventory = [{ id: 'k', name: 'Warding Key' }]) {
  const barrow = {
    id: 'barrow',
    name: 'the Barrow',
    lock: { requires: 'warding key', open: false },
  };
  /** @type {Map<string, any>} */
  const nodes = new Map([['barrow', barrow]]);
  /** @type {string[]} */
  const toasts = [];
  const app = stubApp({
    state: { role, characters: /** @type {any} */ ([{ name: 'Aldric', inventory }]) },
    grid: /** @type {any} */ ({
      getNode: (/** @type {string} */ id) => nodes.get(id),
      updateNode: (/** @type {any} */ n) => nodes.set(n.id, n),
    }),
  });
  app.toasts = /** @type {any} */ ({ show: (/** @type {string} */ m) => toasts.push(m) });
  return { app, barrow, nodes, toasts };
}

test('passLock lets a move into an open or unlocked map go on', async () => {
  const { app } = fakeApp();
  assert.equal(await passLock(app, /** @type {any} */ ({ id: 'x', name: 'X' })), true);
});

test('passLock in a Player tab shows a toast and stops the move', async () => {
  const { app, barrow, toasts } = fakeApp('player');
  assert.equal(await passLock(app, /** @type {any} */ (barrow)), false);
  assert.deepEqual(toasts, ['The way into the Barrow is locked.']);
});

test('passLock asks the GM, and Unlock opens the lock with a line', async () => {
  const { app, barrow, nodes } = fakeApp();
  /** @type {any[]} */
  const asked = [];
  const confirm = async (/** @type {string} */ m, /** @type {any} */ o) => {
    asked.push([m, o.confirmLabel]);
    return true;
  };
  assert.equal(
    await passLock(app, /** @type {any} */ (barrow), { confirm: /** @type {any} */ (confirm) }),
    true,
  );
  assert.deepEqual(asked, [['Locked. Requires the warding key; Aldric carries it.', 'Unlock']]);
  assert.equal(nodes.get('barrow').lock.open, true);
  assert.deepEqual(app.log, ['Aldric unlocks the way into the Barrow.']);
});

test('passLock offers Unlock anyway with no key, and a decline stops the move', async () => {
  const { app, barrow, nodes } = fakeApp('gm', []);
  /** @type {string[]} */
  const labels = [];
  const answers = [false, true];
  const confirm = async (/** @type {string} */ _m, /** @type {any} */ o) => {
    labels.push(o.confirmLabel);
    return answers.shift() ?? false;
  };
  const opts = { confirm: /** @type {any} */ (confirm) };
  assert.equal(await passLock(app, /** @type {any} */ (barrow), opts), false);
  assert.equal(nodes.get('barrow').lock.open, false);
  nodes.delete('barrow');
  assert.equal(await passLock(app, /** @type {any} */ (barrow), opts), true);
  assert.deepEqual(labels, ['Unlock anyway', 'Unlock anyway']);
  assert.deepEqual(app.log, ['The way into the Barrow opens.']);
  assert.equal(nodes.get('barrow').lock.open, true);
});
