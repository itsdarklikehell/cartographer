import { test } from 'node:test';
import assert from 'node:assert/strict';
import { showsCombatBars } from '../src/view/NpcCard.js';
import { HANDOUT_FOLD_LENGTH, NOTES_FOLD_LENGTH, foldsText } from '../src/view/TextFold.js';

/** @returns {any} */
const npc = (extra = {}) => ({ id: 'n', name: 'Dorn', ...extra });

test('showsCombatBars shows the bars in a fight', () => {
  assert.equal(showsCombatBars(npc(), true), true);
  assert.equal(showsCombatBars(npc(), false), false);
  assert.equal(showsCombatBars(npc({ conditions: [], exhaustion: 0 }), false), false);
});

test('showsCombatBars keeps the bars while a condition or exhaustion stays', () => {
  assert.equal(showsCombatBars(npc({ conditions: [{ name: 'Poisoned' }] }), false), true);
  assert.equal(showsCombatBars(npc({ exhaustion: 2 }), false), true);
});

test('foldsText folds only text past the limit', () => {
  assert.equal(foldsText(undefined, NOTES_FOLD_LENGTH), false);
  assert.equal(foldsText('x'.repeat(NOTES_FOLD_LENGTH), NOTES_FOLD_LENGTH), false);
  assert.equal(foldsText('x'.repeat(NOTES_FOLD_LENGTH + 1), NOTES_FOLD_LENGTH), true);
  assert.equal(foldsText('x'.repeat(HANDOUT_FOLD_LENGTH + 1), HANDOUT_FOLD_LENGTH), true);
});
