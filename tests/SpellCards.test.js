import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spellCardLine, levelSlotText } from '../src/view/SpellCards.js';

const pool = (/** @type {string} */ id, /** @type {number} */ current, /** @type {number} */ max) =>
  /** @type {any} */ ({ id, name: id, kind: 'mana', current, max });

test('a spell card line names school, casting time, and range', () => {
  const spell = /** @type {any} */ ({
    school: 'abjuration',
    castingTime: { kind: 'reaction', trigger: 'which you take when you are hit' },
    range: 'Self',
  });
  assert.equal(spellCardLine(spell), 'Abjuration, 1 reaction, Self');
});

test('a level heading counts the free slots of that level', () => {
  const pools = [pool('slots-1', 2, 4), pool('slots-2', 0, 1), pool('slots-3', 1, 1)];
  assert.equal(levelSlotText(pools, 1), '2 of 4 slots');
  assert.equal(levelSlotText(pools, 2), '0 of 1 slot');
  assert.equal(levelSlotText(pools, 3), '1 of 1 slot');
  assert.equal(levelSlotText(pools, 0), '');
  assert.equal(levelSlotText(pools, 5), '');
});

test('pact slots count under their level and every lower one', () => {
  const pools = [pool('slots-1', 2, 4), pool('pact-2', 1, 2)];
  assert.equal(levelSlotText(pools, 1), '2 of 4 slots, 1 of 2 pact slots');
  assert.equal(levelSlotText(pools, 2), '1 of 2 pact slots');
  assert.equal(levelSlotText(pools, 3), '');
  assert.equal(levelSlotText([pool('pact-1', 0, 1)], 1), '0 of 1 pact slot');
});
