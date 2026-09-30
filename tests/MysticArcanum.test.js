import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arcanaClaim,
  arcanumCast,
  arcanumLevels,
  arcanumOptions,
  arcanumSpellIds,
  getArcana,
  pendingArcana,
  setArcana,
  warlockCast,
} from '../src/entities/MysticArcanum.js';
import { applyWarlockPicks } from '../src/entities/InvocationLevelUp.js';
import { longRest } from '../src/entities/Character.js';
import { markInvocationUsed } from '../src/entities/Invocations.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

const warlock = (level, rest = {}) =>
  /** @type {any} */ ({
    id: 'w',
    name: 'Wren',
    classes: [{ classId: 'warlock', level }],
    level,
    resources: [],
    spellbook: { cantrips: [], known: [], prepared: [] },
    ...rest,
  });

test('arcanumLevels follows warlock levels 11, 13, 15, and 17', () => {
  assert.deepEqual(arcanumLevels(warlock(10)), []);
  assert.deepEqual(arcanumLevels(warlock(11)), [6]);
  assert.deepEqual(arcanumLevels(warlock(14)), [6, 7]);
  assert.deepEqual(arcanumLevels(warlock(20)), [6, 7, 8, 9]);
});

test('getArcana keeps the picks the level grants and drops a bad value', () => {
  const c = warlock(13, { mysticArcanum: { 6: 'circle-of-death', 7: 5, 8: 'power-word-stun' } });
  assert.deepEqual(getArcana(c), [{ level: 6, spellId: 'circle-of-death' }]);
  assert.deepEqual(pendingArcana(c), [7]);
  assert.deepEqual(arcanumSpellIds(c), ['circle-of-death']);
  assert.deepEqual(getArcana(warlock(11)), []);
});

test('arcanumOptions lists the warlock spells of exactly that level', () => {
  const ids = arcanumOptions(DEFAULT_SPELLS, 6).map((s) => s.id);
  assert.ok(ids.includes('circle-of-death'));
  assert.ok(ids.every((id) => DEFAULT_SPELLS.find((s) => s.id === id)?.level === 6));
  assert.ok(!arcanumOptions(DEFAULT_SPELLS, 7).some((s) => s.id === 'circle-of-death'));
});

test('setArcana merges picks for granted levels only', () => {
  const c = warlock(11, { mysticArcanum: { 6: 'circle-of-death' } });
  assert.equal(setArcana(c, { 7: 'finger-of-death', 6: '' }), c);
  const next = setArcana(c, { 6: 'true-seeing' });
  assert.deepEqual(next.mysticArcanum, { 6: 'true-seeing' });
  assert.deepEqual(setArcana(warlock(11), { 6: 'x' }).mysticArcanum, { 6: 'x' });
});

test('arcanumCast is once per long rest with no slot, and spends as arcanum-<level>', () => {
  const c = warlock(11, { mysticArcanum: { 6: 'circle-of-death' } });
  assert.equal(arcanumCast(c, 'fireball'), null);
  const via = arcanumCast(c, 'circle-of-death');
  assert.equal(via?.free, true);
  assert.equal(via?.oncePerRest, true);
  assert.equal(via?.spent, false);
  assert.equal(via?.invocation.level, 11);
  const spent = markInvocationUsed(c, 'arcanum-6');
  assert.equal(arcanumCast(spent, 'circle-of-death')?.spent, true);
  assert.equal(arcanumCast(longRest(spent), 'circle-of-death')?.spent, false);
});

test('warlockCast prefers an invocation over the arcanum', () => {
  const c = warlock(11, {
    invocations: ['armor-of-shadows'],
    mysticArcanum: { 6: 'circle-of-death' },
  });
  assert.equal(warlockCast(c, 'mage-armor')?.invocation.id, 'armor-of-shadows');
  assert.equal(warlockCast(c, 'circle-of-death')?.invocation.id, 'arcanum-6');
  assert.equal(warlockCast(c, 'fireball'), null);
});

test('applyWarlockPicks sets an arcanum only on a level with no pick', () => {
  const c = warlock(13, { mysticArcanum: { 6: 'circle-of-death' } });
  const next = applyWarlockPicks(c, {
    added: [],
    arcana: { 6: 'true-seeing', 7: 'finger-of-death', 8: 'power-word-stun' },
  });
  assert.deepEqual(next.mysticArcanum, { 6: 'circle-of-death', 7: 'finger-of-death' });
  assert.equal(applyWarlockPicks(c, { added: [], arcana: { 6: 'true-seeing' } }), c);
});

test('arcanaClaim claims the warlock level that granted a pick', () => {
  const c = warlock(13, { mysticArcanum: { 6: 'circle-of-death' } });
  assert.equal(arcanaClaim(c, 11), true);
  assert.equal(arcanaClaim(c, 12), false);
  assert.equal(arcanaClaim(warlock(13), 11), false);
});
