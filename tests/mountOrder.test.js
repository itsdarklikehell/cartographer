import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * `src/main.js` needs a document, so no suite can run the mount. This test
 * reads the source instead, and checks the order of the calls that a loaded
 * fight depends on. The reconcile of a saved fight logs through `logEvent`,
 * which `wireStory` registers, and leaves combat mode through `setMode`,
 * which `wireSessionControls` registers. A reconcile ahead of either call
 * throws while the app mounts, and every module after it stays unwired.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (/** @type {string} */ file) => readFileSync(join(SRC, file), 'utf8');

test('the saved fight reconciles after the modules it calls are wired', () => {
  const main = read('main.js');
  const at = (/** @type {string} */ call) => {
    const index = main.indexOf(call);
    assert.notEqual(index, -1, `main.js calls ${call}`);
    return index;
  };
  const sync = at('app.actions.syncCombatLocation();');
  assert.ok(at('wireStory(app);') < sync, 'logEvent is registered first');
  assert.ok(at('wireSessionControls(app);') < sync, 'setMode is registered first');
  assert.ok(sync < at("app.actions.setMode('combat');"), 'a dropped fight does not open');
});

test('wireEncounters does not reconcile the saved fight while it mounts', () => {
  const wiring = read('app/encounterWiring.js');
  assert.doesNotMatch(wiring, /^\s*app\.actions\.syncCombatLocation\(\);/m);
});
