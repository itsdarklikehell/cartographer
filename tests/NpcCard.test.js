import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTES_FOLD_LENGTH, foldsNotes, showsCombatBars } from '../src/view/NpcCard.js';

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

test('foldsNotes folds only notes past the fold length', () => {
  assert.equal(foldsNotes(undefined), false);
  assert.equal(foldsNotes('x'.repeat(NOTES_FOLD_LENGTH)), false);
  assert.equal(foldsNotes('x'.repeat(NOTES_FOLD_LENGTH + 1)), true);
});
