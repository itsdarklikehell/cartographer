import test from 'node:test';
import assert from 'node:assert/strict';

import { completeQuest, questDetailCallbacks } from '../src/app/questDetail.js';
import { createQuest } from '../src/quest/Quests.js';
import { addObjective } from '../src/quest/Objectives.js';
import { stubApp } from './helpers/app.js';

/** @typedef {import('../src/types/quest.js').Quest} Quest */

/**
 * A stub app with one quest of two objectives: o1 open to players, o2 GM
 * only. `toasts` collects each toast.
 * @param {boolean} [revealed]
 */
function fakeApp(revealed = true) {
  let rumors = createQuest('q1', 'Rumors', '', 'active', revealed);
  rumors = addObjective(addObjective(rumors, 'Find Bram'), 'Name Odo', true);
  const app = stubApp({ state: { quests: [rumors] } });
  /** @type {string[]} */
  const toasts = [];
  app.toasts = /** @type {any} */ ({ show: (/** @type {string} */ m) => toasts.push(m) });
  return { app, toasts };
}

/**
 * The callbacks with a confirm dialog that gives `answers` in turn and
 * records each message.
 * @param {ReturnType<typeof fakeApp>['app']} app
 * @param {boolean[]} answers
 */
function wire(app, answers) {
  /** @type {{ message: string, confirmLabel?: string }[]} */
  const asked = [];
  const callbacks = questDetailCallbacks(app, {
    confirm: async (message, options) => {
      asked.push({ message, confirmLabel: options?.confirmLabel });
      return answers.shift() ?? false;
    },
  });
  return { callbacks, asked };
}

const quest = (/** @type {ReturnType<typeof fakeApp>['app']} */ app) =>
  /** @type {Quest} */ (app.state.quests[0]);

test('completeQuest completes the quest with a toast and a travelogue line', () => {
  const { app, toasts } = fakeApp();
  assert.equal(completeQuest(app, quest(app)), true);
  assert.equal(quest(app).status, 'completed');
  assert.deepEqual(toasts, ['Completed Rumors.']);
  assert.deepEqual(app.log, ['The party completes the quest Rumors.']);
  assert.deepEqual(app.playerLog, app.log);
  assert.equal(completeQuest(app, quest(app)), false, 'already completed');
  assert.equal(completeQuest(app, createQuest('gone', 'Gone')), false, 'deleted');
  assert.equal(app.log.length, 1);
});

test('completeQuest keeps the line of a hidden quest off the Player tab', () => {
  const { app } = fakeApp(false);
  completeQuest(app, quest(app));
  assert.equal(app.log.length, 1);
  assert.deepEqual(app.playerLog, []);
});

test('onToggleObjective checks an open objective with no question', async () => {
  const { app } = fakeApp();
  const { callbacks, asked } = wire(app, []);
  assert.equal(await callbacks.onToggleObjective(quest(app), 'o1'), true);
  assert.equal(quest(app).objectives[0].done, true);
  assert.deepEqual(asked, []);
  // Clearing the check asks nothing either.
  assert.equal(await callbacks.onToggleObjective(quest(app), 'o1'), true);
  assert.equal(quest(app).objectives[0].done, false);
  assert.deepEqual(asked, []);
});

test('onToggleObjective offers to reveal a done GM-only objective', async () => {
  const { app } = fakeApp();
  const { callbacks, asked } = wire(app, [true]);
  await callbacks.onToggleObjective(quest(app), 'o2');
  assert.equal(asked[0].confirmLabel, 'Reveal to players');
  assert.equal(quest(app).objectives[1].hidden, false);
  assert.equal(asked.length, 1, 'o1 is still open, so no completion offer');
});

test('onToggleObjective keeps a GM-only objective hidden on a decline', async () => {
  const { app } = fakeApp();
  await wire(app, [false]).callbacks.onToggleObjective(quest(app), 'o2');
  assert.equal(quest(app).objectives[1].hidden, true);
});

test('onToggleObjective skips the reveal offer while the quest is hidden', async () => {
  const { app } = fakeApp(false);
  const { callbacks, asked } = wire(app, []);
  await callbacks.onToggleObjective(quest(app), 'o2');
  assert.deepEqual(asked, []);
});

test('onToggleObjective offers to complete the quest after the last objective', async () => {
  const { app, toasts } = fakeApp(false);
  const { callbacks, asked } = wire(app, [true]);
  await callbacks.onToggleObjective(quest(app), 'o1');
  assert.deepEqual(asked, []);
  await callbacks.onToggleObjective(quest(app), 'o2');
  assert.equal(asked[0].confirmLabel, 'Complete quest');
  assert.equal(quest(app).status, 'completed');
  assert.deepEqual(toasts, ['Completed Rumors.']);
});

test('onToggleObjective asks to reveal and then to complete', async () => {
  const { app } = fakeApp();
  const { callbacks, asked } = wire(app, [true, true]);
  await callbacks.onToggleObjective(quest(app), 'o1');
  await callbacks.onToggleObjective(quest(app), 'o2');
  assert.deepEqual(
    asked.map((a) => a.confirmLabel),
    ['Reveal to players', 'Complete quest'],
  );
  assert.equal(quest(app).objectives[1].hidden, false);
  assert.equal(quest(app).status, 'completed');
});

test('onToggleObjective leaves the quest active when the GM says not yet', async () => {
  const { app } = fakeApp(false);
  const { callbacks, asked } = wire(app, [false]);
  await callbacks.onToggleObjective(quest(app), 'o1');
  assert.deepEqual(asked, []);
  await callbacks.onToggleObjective(quest(app), 'o2');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].confirmLabel, 'Complete quest');
  assert.equal(quest(app).status, 'active');
});

test('onToggleObjective reports a deleted quest or objective as no change', async () => {
  const { app, toasts } = fakeApp();
  const { callbacks } = wire(app, []);
  assert.equal(await callbacks.onToggleObjective(quest(app), 'gone'), false);
  const stale = quest(app);
  app.state.quests = [];
  assert.equal(await callbacks.onToggleObjective(stale, 'o1'), false);
  assert.deepEqual(toasts, ['That quest was deleted.']);
});

test('the reveal offer does not hide an objective another tab revealed meanwhile', async () => {
  const { app } = fakeApp();
  const callbacks = questDetailCallbacks(app, {
    confirm: async () => {
      // Another tab reveals the objective while the dialog waits.
      const q = quest(app);
      app.state.quests = [{ ...q, objectives: q.objectives.map((o) => ({ ...o, hidden: false })) }];
      return true;
    },
  });
  await callbacks.onToggleObjective(quest(app), 'o2');
  assert.equal(quest(app).objectives[1].hidden, false);
});
