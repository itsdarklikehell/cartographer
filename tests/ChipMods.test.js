import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  heldBoost,
  hasExtraAction,
  heldMods,
  immunityTo,
  modsSummary,
  normalizeChipMods,
  withChipAC,
} from '../src/entities/ChipMods.js';
import { createCondition } from '../src/entities/Conditions.js';

test('normalizeChipMods keeps the fields that change something', () => {
  assert.equal(normalizeChipMods(null), null);
  assert.equal(normalizeChipMods('fast'), null);
  assert.equal(normalizeChipMods({ ac: 0, acBase: '', acMin: -4 }), null);
  assert.deepEqual(normalizeChipMods({ ac: '5' }), { ac: 5 });
  assert.deepEqual(normalizeChipMods({ ac: -2, acBase: 13, acMin: 16 }), {
    ac: -2,
    acBase: 13,
    acMin: 16,
  });
  assert.deepEqual(normalizeChipMods({ ac: 99, acBase: 99 }), { ac: 30, acBase: 30 });
});

test('heldMods adds the flat bonuses and keeps the highest base and floor', () => {
  assert.deepEqual(heldMods(undefined), { ac: 0, acBase: 0, acMin: 0 });
  const chips = [
    createCondition('Shield', 1, { mods: { ac: 5 } }),
    createCondition('Shield of Faith', 100, { mods: { ac: 2, acMin: 12 } }),
    createCondition('Mage Armor', 100, { mods: { acBase: 13 } }),
    createCondition('Barkskin', 100, { mods: { acMin: 16 } }),
    createCondition('Prone'),
  ];
  assert.deepEqual(heldMods(chips), { ac: 7, acBase: 13, acMin: 16 });
});

test('withChipAC applies the floor after the bonus', () => {
  assert.equal(withChipAC(12, { ac: 2, acMin: 16 }), 16);
  assert.equal(withChipAC(15, { ac: 2, acMin: 16 }), 17);
  assert.equal(withChipAC(12, { ac: 0, acMin: 0 }), 12);
});

test('modsSummary names each change', () => {
  assert.equal(modsSummary(undefined), '');
  assert.equal(modsSummary({}), '');
  assert.equal(modsSummary({ ac: 5 }), '+5 AC');
  assert.equal(modsSummary({ ac: -1 }), '-1 AC');
  assert.equal(
    modsSummary({ acBase: 13, acMin: 16 }),
    'base AC 13 + DEX without armor, AC at least 16',
  );
});

test('normalizeChipMods keeps the HP fields and the immunities', () => {
  assert.deepEqual(
    normalizeChipMods({
      maxHP: '5',
      immune: [' Frightened ', 'frightened', '', 3],
      tempHPEachTurn: 4,
    }),
    { maxHP: 5, immune: ['Frightened'], tempHPEachTurn: 4 },
  );
  assert.equal(normalizeChipMods({ maxHP: 0, immune: 'Frightened', tempHPEachTurn: -1 }), null);
  assert.deepEqual(normalizeChipMods({ maxHP: 500 }), { maxHP: 100 });
});

test('heldBoost keeps the highest raise of each spell, and immunityTo finds the chip', () => {
  const src = (casterId) => ({ spellId: 'aid', spellName: 'Aid', casterId });
  const aid = createCondition('Aid', 10, { source: src('a'), mods: { maxHP: 5 } });
  const big = createCondition('Aid', 10, { source: src('b'), mods: { maxHP: 10 } });
  const other = createCondition('Blessing', 10, { mods: { maxHP: 3 } });
  const hero = createCondition('Heroism', 10, { mods: { immune: ['Frightened'] } });
  assert.equal(heldBoost(undefined), 0);
  assert.equal(heldBoost([aid, big, hero]), 10);
  assert.equal(heldBoost([aid, big, other]), 13);
  assert.equal(immunityTo([aid, hero], 'frightened'), hero);
  assert.equal(immunityTo([aid], 'Frightened'), undefined);
  assert.equal(immunityTo(undefined, 'Frightened'), undefined);
});

test('modsSummary names the HP fields', () => {
  assert.equal(
    modsSummary({ maxHP: 5, immune: ['Frightened', 'Charmed'], tempHPEachTurn: 3 }),
    '+5 max HP, immune to Frightened and Charmed, 3 temp HP each turn',
  );
});

test('normalizeChipMods keeps the save advantage and the extra action of Haste', () => {
  assert.deepEqual(
    normalizeChipMods({ saveAdvantage: ['wis', ' dex ', 'LUCK', 'DEX', 3], extraAction: true }),
    { saveAdvantage: ['DEX', 'WIS'], extraAction: true },
  );
  assert.equal(normalizeChipMods({ saveAdvantage: 'DEX', extraAction: 'yes' }), null);
});

test('hasExtraAction finds a chip that gives one', () => {
  const haste = { ...createCondition('Haste', 10), mods: { extraAction: true } };
  assert.equal(hasExtraAction([createCondition('Bless', 10), haste]), true);
  assert.equal(hasExtraAction([createCondition('Bless', 10)]), false);
  assert.equal(hasExtraAction(undefined), false);
});

test('modsSummary names the save advantage and the extra action', () => {
  assert.equal(
    modsSummary({ ac: 2, saveAdvantage: ['DEX'], extraAction: true }),
    '+2 AC, advantage on DEX saves, an extra action for one weapon attack',
  );
});
