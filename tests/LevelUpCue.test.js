import { test } from 'node:test';
import assert from 'node:assert/strict';

import { levelUpCue } from '../src/view/LevelUpCue.js';

test('no pending step gives no banner', () => {
  assert.equal(levelUpCue({ levels: 0, improvements: 0, choices: 0 }), null);
});

test('one pending level reads in the singular', () => {
  assert.equal(
    levelUpCue({ levels: 1, improvements: 0, choices: 0 }),
    'Ready to level up: 1 level to assign.',
  );
});

test('every kind of step joins into one line, in the plural', () => {
  assert.equal(
    levelUpCue({ levels: 2, improvements: 2, choices: 2 }),
    'Ready to level up: 2 levels to assign, 2 improvements, 2 feature choices.',
  );
  assert.equal(
    levelUpCue({ levels: 0, improvements: 1, choices: 1 }),
    'Ready to level up: 1 improvement, 1 feature choice.',
  );
});
