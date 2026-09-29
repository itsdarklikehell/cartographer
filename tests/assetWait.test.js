import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAssetWait } from '../src/app/assetWait.js';

test('a result with no pending put goes on at once', () => {
  const wait = createAssetWait();
  let runs = 0;
  assert.equal(
    wait.after(undefined, () => (runs += 1)),
    false,
  );
  assert.equal(wait.waiting(), false);
  assert.equal(runs, 0);
});

test('a pending put runs the action again once it settles', async () => {
  const wait = createAssetWait();
  /** @type {(ok: boolean) => void} */
  let settle = () => {};
  const pending = new Promise((resolve) => {
    settle = resolve;
  });
  let runs = 0;
  let waitingDuringRun = true;
  assert.equal(
    wait.after(pending, () => {
      runs += 1;
      waitingDuringRun = wait.waiting();
    }),
    true,
  );
  assert.equal(wait.waiting(), true);
  settle(false);
  await pending;
  await Promise.resolve();
  assert.equal(runs, 1);
  assert.equal(waitingDuringRun, false, 'the rerun is not blocked by its own wait');
});
