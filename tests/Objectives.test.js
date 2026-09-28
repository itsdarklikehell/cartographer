import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuest } from '../src/quest/Quests.js';
import {
  addObjective,
  editObjective,
  moveObjective,
  nextObjectiveId,
  objectiveProgress,
  removeObjective,
  toggleObjectiveDone,
  toggleObjectiveHidden,
} from '../src/quest/Objectives.js';

/** A quest with three objectives, o1 to o3. */
function questOfThree() {
  let quest = createQuest('q1', 'The Barrow');
  for (const text of ['Find the key', 'Open the door', 'End the king']) {
    quest = addObjective(quest, text);
  }
  return quest;
}

const ids = (/** @type {import('../src/types/quest.js').Quest} */ quest) =>
  quest.objectives.map((o) => o.id);

test('nextObjectiveId counts up from the highest o-number and skips other ids', () => {
  assert.equal(nextObjectiveId([]), 'o1');
  const objectives = [
    { id: 'o2', text: '', done: false, hidden: false },
    { id: 'custom', text: '', done: false, hidden: false },
    { id: 'o7', text: '', done: false, hidden: false },
  ];
  assert.equal(nextObjectiveId(objectives), 'o8');
});

test('addObjective appends a not-done objective and keeps the input', () => {
  const quest = createQuest('q1', 'A');
  const next = addObjective(quest, 'Find the key', true);
  assert.deepEqual(next.objectives, [
    { id: 'o1', text: 'Find the key', done: false, hidden: true },
  ]);
  assert.deepEqual(quest.objectives, []);
  assert.equal(addObjective(next, 'Open the door').objectives[1].hidden, false);
});

test('editObjective sets the text and the hidden flag of one objective', () => {
  const quest = questOfThree();
  const next = editObjective(quest, 'o2', { text: 'Break the door', hidden: true });
  assert.deepEqual(next.objectives[1], {
    id: 'o2',
    text: 'Break the door',
    done: false,
    hidden: true,
  });
  assert.equal(next.objectives[0], quest.objectives[0]);
});

test('toggleObjectiveDone and toggleObjectiveHidden flip one flag each', () => {
  const quest = questOfThree();
  const done = toggleObjectiveDone(quest, 'o1');
  assert.equal(done.objectives[0].done, true);
  assert.equal(toggleObjectiveDone(done, 'o1').objectives[0].done, false);
  const hidden = toggleObjectiveHidden(quest, 'o3');
  assert.equal(hidden.objectives[2].hidden, true);
  assert.equal(quest.objectives[2].hidden, false);
});

test('an edit to an objective that is gone returns the same quest', () => {
  const quest = questOfThree();
  assert.equal(toggleObjectiveDone(quest, 'missing'), quest);
  assert.equal(editObjective(quest, 'missing', { text: 'x', hidden: false }), quest);
  assert.equal(removeObjective(quest, 'missing'), quest);
  assert.equal(moveObjective(quest, 'missing', 1), quest);
});

test('moveObjective swaps with the neighbor and stops at either end', () => {
  const quest = questOfThree();
  assert.deepEqual(ids(moveObjective(quest, 'o2', -1)), ['o2', 'o1', 'o3']);
  assert.deepEqual(ids(moveObjective(quest, 'o2', 1)), ['o1', 'o3', 'o2']);
  assert.equal(moveObjective(quest, 'o1', -1), quest);
  assert.equal(moveObjective(quest, 'o3', 1), quest);
  assert.deepEqual(ids(quest), ['o1', 'o2', 'o3']);
});

test('removeObjective drops one objective and a later add does not reuse a live id', () => {
  const quest = removeObjective(questOfThree(), 'o2');
  assert.deepEqual(ids(quest), ['o1', 'o3']);
  assert.deepEqual(ids(addObjective(quest, 'More')), ['o1', 'o3', 'o4']);
});

test('objectiveProgress counts the done objectives', () => {
  const quest = toggleObjectiveDone(questOfThree(), 'o3');
  assert.deepEqual(objectiveProgress(quest.objectives), { done: 1, total: 3 });
  assert.deepEqual(objectiveProgress([]), { done: 0, total: 0 });
});
