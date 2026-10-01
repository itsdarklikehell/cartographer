import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackNote, costNote, spellNote } from '../src/combat/SpentCost.js';
import { freshBudget } from '../src/combat/ActionBudget.js';

const spent = { ...freshBudget(), action: true };

test('costNote names a spent cost, and nothing for a free or absent cost', () => {
  assert.equal(costNote(spent, 'action'), 'Action spent');
  assert.equal(costNote(spent, 'bonus'), null);
  assert.equal(costNote(spent, null), null);
  assert.equal(costNote(spent, undefined), null);
});

test('attackNote speaks only once no swing is left', () => {
  assert.equal(attackNote(0), 'No attack left this turn');
  assert.equal(attackNote(1), null);
});

test('spellNote reads the cost from the casting time', () => {
  assert.equal(spellNote(spent, { castingTime: { kind: 'action' } }), 'Action spent');
  assert.equal(spellNote(spent, { castingTime: { kind: 'bonus' } }), null);
  assert.equal(spellNote(spent, { castingTime: { kind: 'minute', amount: 10 } }), null);
  assert.equal(spellNote(spent, {}), null);
});
