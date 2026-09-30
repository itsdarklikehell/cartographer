import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingTarget, targetValues } from '../src/app/spellTargets.js';

const spell = (/** @type {string} */ kind) => /** @type {any} */ ({ effect: { kind } });
const targets = /** @type {any[]} */ ([{ id: 'ogre' }, { id: 'wolf' }]);

test('targetValues reads only the target fields the dialog has', () => {
  const fields = [{ name: 'slot' }, { name: 'targets' }];
  assert.deepEqual(
    targetValues(fields, (name) => `v-${name}`),
    { targets: 'v-targets' },
  );
  assert.deepEqual(
    targetValues([{ name: 'allocation' }, { name: 'target' }], () => ''),
    {
      allocation: '',
      target: '',
    },
  );
});

test('missingTarget is true only for a targeted spell with nobody picked', () => {
  assert.equal(missingTarget(spell('save'), targets, { targets: '' }), true);
  assert.equal(missingTarget(spell('save'), targets, { targets: 'wolf' }), false);
  assert.equal(missingTarget(spell('attack'), targets, { allocation: 'ogre:0' }), true);
  assert.equal(missingTarget(spell('utility'), targets, {}), false);
});
