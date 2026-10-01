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

test('spellNote reads the repeat cost of a held spell', () => {
  const sword = {
    castingTime: { kind: 'action' },
    repeat: { cost: /** @type {const} */ ('bonus') },
  };
  assert.equal(spellNote(spent, sword, true), null);
  assert.equal(spellNote({ ...freshBudget(), bonus: true }, sword, true), 'Bonus action spent');
  assert.equal(spellNote(spent, sword), 'Action spent');
  // A held repeat that names no cost costs what the casting time costs.
  const bolt = { castingTime: { kind: 'action' }, repeat: {} };
  assert.equal(spellNote(spent, bolt, true), 'Action spent');
});
