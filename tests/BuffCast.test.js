import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buffOutcomes, castMods, rollTempHP } from '../src/entities/BuffCast.js';

/** The cast of a buff with the fields given. */
const buff = (fields) => /** @type {any} */ ({ kind: 'buff', ...fields });

test('castMods scales the HP raise with the slot and stamps the turn grant', () => {
  const aid = buff({ mods: { maxHP: 5 }, modsPerStep: { maxHP: 5 } });
  assert.deepEqual(castMods(aid, 0, 3), { maxHP: 5 });
  assert.deepEqual(castMods(aid, 2, 3), { maxHP: 15 });
  const heroism = buff({ mods: { immune: ['Frightened'] }, tempEachTurn: true });
  assert.deepEqual(castMods(heroism, 0, 4), { immune: ['Frightened'], tempHPEachTurn: 4 });
  assert.deepEqual(castMods(heroism, 0, 0), { immune: ['Frightened'] });
  assert.equal(castMods(buff({}), 0, 3), null);
});

test('rollTempHP adds the dice, the flat amount, and the slot growth', () => {
  const temp = { count: 1, sides: 4, flat: 4, flatPerStep: 5 };
  assert.deepEqual(
    rollTempHP(temp, 0, () => 0.99),
    { total: 8, text: '1d4 [4] + 4' },
  );
  assert.deepEqual(
    rollTempHP(temp, 1, () => 0),
    { total: 10, text: '1d4 [1] + 9' },
  );
  assert.deepEqual(
    rollTempHP({ count: 0, sides: 4, flat: 6 }, 0, () => 0),
    {
      total: 6,
      text: '6',
    },
  );
  assert.deepEqual(
    rollTempHP({ count: 2, sides: 6, flat: 0 }, 0, () => 0),
    {
      total: 2,
      text: '2d6 [1, 1]',
    },
  );
});

test('buffOutcomes rolls temporary HP per target', () => {
  const spell = /** @type {any} */ ({ name: 'False Life', effect: {} });
  const effect = buff({ tempHP: { count: 1, sides: 4, flat: 4 } });
  const targets = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ];
  const [a, b] = buffOutcomes(spell, effect, /** @type {any} */ (targets), {
    steps: 0,
    spellModifier: 3,
    rng: () => 0,
  });
  assert.equal(a.condition, 'False Life');
  assert.deepEqual([a.tempHP?.total, b.tempHP?.total], [5, 5]);
  assert.equal(a.mods, null);
  const plain = buffOutcomes(spell, buff({}), /** @type {any} */ (targets), {
    steps: 0,
    spellModifier: 3,
    rng: () => 0,
  });
  assert.equal('tempHP' in plain[0], false);
});
