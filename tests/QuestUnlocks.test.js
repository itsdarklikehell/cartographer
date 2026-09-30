import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuest } from '../src/quest/Quests.js';
import { dropMissingUnlocks, hiddenUnlocks, parseUnlocks } from '../src/quest/QuestUnlocks.js';

const quest = (
  /** @type {string} */ id,
  unlocks = /** @type {string[]} */ ([]),
  revealed = false,
) => ({
  ...createQuest(id, id, '', 'active', revealed),
  unlocks,
});

test('parseUnlocks drops blanks, repeats, and the quest itself', () => {
  assert.deepEqual(parseUnlocks('b, a,,b,self', 'self'), ['b', 'a']);
  assert.deepEqual(parseUnlocks(undefined, null), []);
});

test('hiddenUnlocks lists the hidden quests that still exist, in list order', () => {
  const all = [quest('a', ['c', 'gone', 'b', 'd']), quest('b'), quest('c'), quest('d', [], true)];
  assert.deepEqual(
    hiddenUnlocks(all, all[0]).map((q) => q.id),
    ['c', 'b'],
  );
});

test('dropMissingUnlocks removes deleted ids and keeps identity otherwise', () => {
  const kept = quest('b', ['a']);
  const all = [quest('a', ['b', 'gone']), kept];
  const next = dropMissingUnlocks(all);
  assert.deepEqual(next[0].unlocks, ['b']);
  assert.equal(next[1], kept);
  assert.equal(dropMissingUnlocks(next), next);
});
