import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateOptions } from '../src/entities/CreatureTemplate.js';

const t = (/** @type {string} */ id, /** @type {string} */ name) =>
  /** @type {any} */ ({ id, name, maxHP: 7 });
const campaign = [t('w', 'Wolf'), t('b', 'Bandit')];
const library = [t('w', 'Dire Wolf'), t('g', 'Goblin')];

test('templateOptions groups campaign before library and sorts each group', () => {
  assert.deepEqual(
    templateOptions(campaign, library).map((o) => [o.value, o.group]),
    [
      ['campaign:b', 'This campaign'],
      ['campaign:w', 'This campaign'],
      ['library:w', 'Library'],
      ['library:g', 'Library'],
    ],
  );
  assert.equal(templateOptions(campaign, [])[0].label, 'Bandit (7 HP)');
});

test('templateOptions keeps names that contain the query, ignoring case', () => {
  assert.deepEqual(
    templateOptions(campaign, library, '  WOLF ').map((o) => o.value),
    ['campaign:w', 'library:w'],
  );
  assert.deepEqual(templateOptions(campaign, library, 'zzz'), []);
});

test('templateOptions does not reorder its inputs', () => {
  templateOptions(campaign, library);
  assert.equal(campaign[0].name, 'Wolf');
});
