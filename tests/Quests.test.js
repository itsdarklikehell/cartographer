import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createQuest,
  setQuestStatus,
  toggleQuestStatus,
  toggleQuestRevealed,
  questRevealLine,
  visibleQuests,
  groupByStatus,
  playerQuestView,
} from '../src/quest/Quests.js';

test('createQuest defaults to active and hidden with empty notes, objectives, and links', () => {
  assert.deepEqual(createQuest('q1', 'Find the sword'), {
    id: 'q1',
    title: 'Find the sword',
    notes: '',
    status: 'active',
    revealed: false,
    objectives: [],
    links: [],
    unlocks: [],
  });
});

test('setQuestStatus returns a new quest without mutating the input', () => {
  const quest = createQuest('q1', 'A');
  const done = setQuestStatus(quest, 'completed');
  assert.equal(done.status, 'completed');
  assert.equal(quest.status, 'active');
});

test('toggleQuestStatus flips between active and completed', () => {
  const quest = createQuest('q1', 'A');
  const done = toggleQuestStatus(quest);
  assert.equal(done.status, 'completed');
  assert.equal(toggleQuestStatus(done).status, 'active');
});

test('groupByStatus splits into active and completed, preserving order', () => {
  const quests = [
    createQuest('q1', 'A'),
    createQuest('q2', 'B', '', 'completed'),
    createQuest('q3', 'C'),
  ];
  const { active, completed } = groupByStatus(quests);
  assert.deepEqual(
    active.map((q) => q.id),
    ['q1', 'q3'],
  );
  assert.deepEqual(
    completed.map((q) => q.id),
    ['q2'],
  );
});

test('toggleQuestRevealed flips visibility without mutating the input', () => {
  const quest = createQuest('q1', 'A');
  const shown = toggleQuestRevealed(quest);
  assert.equal(shown.revealed, true);
  assert.equal(quest.revealed, false);
  assert.equal(toggleQuestRevealed(shown).revealed, false);
});

test('visibleQuests shows a GM every quest and a player only revealed ones', () => {
  const quests = [
    createQuest('q1', 'A', 'lead', 'active', true),
    createQuest('q2', 'B'),
    createQuest('q3', 'C', '', 'completed', true),
  ];
  assert.equal(visibleQuests(quests, true), quests);
  assert.deepEqual(
    visibleQuests(quests, false).map((q) => q.id),
    ['q1', 'q3'],
  );
});

/**
 * A revealed quest with GM notes, one shared and one hidden objective, and links.
 * @returns {import('../src/types/quest.js').Quest}
 */
function secretQuest() {
  return {
    ...createQuest('q1', 'The Barrow', 'Ostrand is the true foe.', 'active', true),
    objectives: [
      { id: 'o1', text: 'Find the old tomb', done: true, hidden: false },
      { id: 'o2', text: 'Learn that Ostrand has risen', done: false, hidden: true },
    ],
    links: [
      { kind: 'place', nodeId: 'tomb-node', tileId: '3,4' },
      { kind: 'creature', creatureId: 'ostrand' },
    ],
  };
}

test('playerQuestView drops the notes, the hidden objectives, and the links', () => {
  assert.deepEqual(playerQuestView(secretQuest()), {
    id: 'q1',
    title: 'The Barrow',
    notes: '',
    status: 'active',
    revealed: true,
    objectives: [{ id: 'o1', text: 'Find the old tomb', done: true, hidden: false }],
    links: [],
    unlocks: [],
  });
});

test('no GM-only text of a quest reaches the rows a player tab draws', () => {
  const quests = [secretQuest(), createQuest('q2', 'Unrevealed', 'Spoiler notes')];
  const text = JSON.stringify(visibleQuests(quests, false));
  for (const secret of ['Ostrand', 'Spoiler', 'Unrevealed', 'tomb-node', 'ostrand', '3,4']) {
    assert.equal(text.includes(secret), false, `${secret} leaked`);
  }
});

test('playerQuestView leaves the quest itself whole', () => {
  const quest = secretQuest();
  playerQuestView(quest);
  assert.deepEqual(quest, secretQuest());
});

test('playerQuestView returns the same copy for the same quest', () => {
  const quest = secretQuest();
  assert.equal(playerQuestView(quest), playerQuestView(quest));
  assert.notEqual(playerQuestView(quest), playerQuestView({ ...quest }));
});

test('questRevealLine is public on reveal and GM-only on hide', () => {
  const quest = createQuest('q1', 'Find the sword');
  assert.deepEqual(questRevealLine({ ...quest, revealed: true }), [
    'The party learns of the quest Find the sword.',
    undefined,
  ]);
  assert.deepEqual(questRevealLine({ ...quest, revealed: false }), [
    'The quest Find the sword is hidden from players.',
    { gm: true },
  ]);
});
