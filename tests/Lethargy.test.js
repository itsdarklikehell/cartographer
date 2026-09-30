import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LETHARGIC, endedEffects, withLethargy } from '../src/entities/Lethargy.js';
import { losesTurn, canAct } from '../src/entities/ConditionEffects.js';
import { createCondition } from '../src/entities/Conditions.js';

const source = (casterId) => ({ spellId: 'haste', spellName: 'Haste', casterId });
const haste = (casterId = 'mage', rounds = 10) =>
  createCondition('Haste', rounds, { source: source(casterId), mods: { extraAction: true } });

test('endedEffects lists the chips the second list no longer has', () => {
  const prone = createCondition('Prone');
  const list = [haste(), prone];
  assert.deepEqual(endedEffects(list, list), []);
  assert.deepEqual(endedEffects(list, [prone]), [list[0]]);
  assert.deepEqual(endedEffects(list, [haste('mage', 9), prone]), [], 'a count-down is no end');
  assert.deepEqual(endedEffects(list, [haste('other'), prone]), [list[0]]);
});

test('withLethargy adds the chip only when a Haste chip ends', () => {
  const prone = createCondition('Prone');
  const timing = { rounds: 1 };
  const same = [prone];
  assert.equal(withLethargy([prone], same, timing), same, 'no Haste ended');
  const next = withLethargy([haste(), prone], same, timing);
  assert.deepEqual(
    next.map((c) => [c.name, c.rounds]),
    [
      ['Prone', null],
      [LETHARGIC, 1],
    ],
  );
  assert.equal(withLethargy([haste(), ...next], next, timing), next, 'already lethargic');
  const expires = { who: 'hero', at: /** @type {const} */ ('end'), count: 2 };
  const keyed = withLethargy([haste()], [], { rounds: null, expires });
  assert.deepEqual(keyed[0].expires, expires);
});

test('Lethargic takes the turn but leaves the holder able to act otherwise', () => {
  const chip = [createCondition(LETHARGIC, 1)];
  assert.equal(losesTurn(chip), true);
  assert.equal(canAct(chip), true, 'concentration and reactions stay');
  assert.equal(losesTurn([createCondition('Stunned')]), true);
  assert.equal(losesTurn([createCondition('Prone')]), false);
});
