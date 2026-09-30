import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spendablePools, spendRestDice } from '../src/entities/RestHitDice.js';
import { getHitDicePools, withHitDice } from '../src/entities/HitDice.js';
import { createCharacter, getHP, spendResource, withHP } from '../src/entities/Character.js';

/** A Fighter 2 / Wizard 2 with 30 max HP, down to `hp`. @param {number} hp */
function hurt(hp) {
  const base = {
    ...createCharacter('c1', 'Bron', { CON: 14 }),
    classes: [
      { classId: 'fighter', level: 2 },
      { classId: 'wizard', level: 2 },
    ],
    level: 4,
  };
  return spendResource(withHitDice(withHP(base, 30)), 'hp', 30 - hp);
}

/** @param {import('../src/types/entities.js').Character} c */
const left = (c) => getHitDicePools(c).map((p) => `${p.id} ${p.current}`);

test('every pool with a die left is spendable, and a dead character spends none', () => {
  assert.deepEqual(
    spendablePools(hurt(5)).map((p) => p.id),
    ['hit-dice-d10', 'hit-dice-d6'],
  );
  const dead = { ...hurt(0), deathSaves: { successes: 0, failures: 3 } };
  assert.deepEqual(spendablePools(dead), []);
});

test('the chosen counts roll that many dice of each pool', () => {
  // Each die rolls its midpoint plus 1: d10 -> 6, d6 -> 4, plus CON +2.
  const out = spendRestDice(hurt(5), { 'hit-dice-d10': 1, 'hit-dice-d6': 2 }, () => 0.5);
  assert.deepEqual(out.rolls, [6, 4, 4]);
  assert.equal(out.healed, 20);
  assert.equal(getHP(out.character).current, 25);
  assert.deepEqual(left(out.character), ['hit-dice-d10 1', 'hit-dice-d6 0']);
});

test('spending stops at full HP and at the dice left, and ignores bad counts', () => {
  const nearly = spendRestDice(hurt(28), { 'hit-dice-d10': 2 }, () => 0.5);
  assert.deepEqual(nearly.rolls, [6]);
  assert.equal(getHP(nearly.character).current, 30);
  const many = spendRestDice(hurt(1), { 'hit-dice-d6': 9, 'hit-dice-d10': -2 }, () => 0);
  assert.deepEqual(many.rolls, [1, 1]);
  const none = spendRestDice(hurt(1), {});
  assert.deepEqual(none.rolls, []);
  assert.equal(getHP(none.character).current, 1);
});

test('a character without an HP pool still spends its dice', () => {
  const noHP = { ...hurt(10), resources: hurt(10).resources.filter((r) => r.id !== 'hp') };
  const out = spendRestDice(noHP, { 'hit-dice-d10': 1 }, () => 0);
  assert.deepEqual(out.rolls, [1]);
});
