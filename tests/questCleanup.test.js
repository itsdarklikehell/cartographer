import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pruneCreatureLinks,
  pruneUnlocks,
  shrinkNodeLinks,
  unlinkRemovedNodes,
} from '../src/app/questCleanup.js';
import { commitCreatures } from '../src/app/combatants.js';
import { createQuest } from '../src/quest/Quests.js';
import { creatureLink, placeLink, restoreLinks } from '../src/quest/QuestLinks.js';
import { stubApp } from './helpers/app.js';

/**
 * A stub app whose one quest has the given links.
 * @param {import('../src/types/quest.js').QuestLink[]} links
 * @param {string[]} [creatureIds]
 */
function fakeApp(links, creatureIds = []) {
  return stubApp({
    state: {
      quests: [{ ...createQuest('q1', 'Rumors'), links }],
      creatures: /** @type {any} */ (creatureIds.map((id) => ({ id, name: id }))),
    },
  });
}

test('pruneCreatureLinks drops links to deleted creatures and refreshes the log', () => {
  const app = fakeApp([creatureLink('bram'), creatureLink('gone'), placeLink('world')], ['bram']);
  pruneCreatureLinks(app);
  assert.deepEqual(app.state.quests[0].links, [creatureLink('bram'), placeLink('world')]);
  assert.deepEqual(app.refreshes, ['questPanel']);
});

test('pruneCreatureLinks leaves the quests alone when no link changes', () => {
  const app = fakeApp([creatureLink('bram')], ['bram']);
  const before = app.state.quests;
  pruneCreatureLinks(app);
  assert.equal(app.state.quests, before);
  const placeOnly = fakeApp([placeLink('world')]);
  const quests = placeOnly.state.quests;
  pruneCreatureLinks(placeOnly);
  assert.equal(placeOnly.state.quests, quests);
  assert.deepEqual(app.refreshes.concat(placeOnly.refreshes), []);
});

test('every creature commit prunes the links, so every delete path does', () => {
  const app = fakeApp([creatureLink('gone')]);
  commitCreatures(app);
  assert.deepEqual(app.state.quests[0].links, []);
});

test('unlinkRemovedNodes removes links to the nodes and returns them for undo', () => {
  const app = fakeApp([placeLink('world'), placeLink('cave', '1,1')]);
  const original = app.state.quests;
  const refs = unlinkRemovedNodes(app, new Set(['cave']));
  assert.deepEqual(app.state.quests[0].links, [placeLink('world')]);
  assert.deepEqual(app.refreshes, ['questPanel']);
  assert.deepEqual(restoreLinks(app.state.quests, refs), original);
  assert.deepEqual(unlinkRemovedNodes(app, new Set(['elsewhere'])), []);
  assert.deepEqual(app.refreshes, ['questPanel']);
});

test('shrinkNodeLinks turns a link to a removed tile into a whole-map link', () => {
  const app = fakeApp([placeLink('town', '6,6')]);
  shrinkNodeLinks(app, 'town', 3, 3);
  assert.deepEqual(app.state.quests[0].links, [placeLink('town')]);
});

test('pruneUnlocks drops the ids of deleted quests and refreshes the log', () => {
  const app = stubApp({
    state: {
      quests: [{ ...createQuest('a', 'A'), unlocks: ['gone', 'a2'] }, createQuest('a2', 'B')],
    },
  });
  pruneUnlocks(app);
  assert.deepEqual(app.state.quests[0].unlocks, ['a2']);
  assert.deepEqual(app.refreshes, ['questPanel']);
  pruneUnlocks(app);
  assert.deepEqual(app.refreshes, ['questPanel']);
});
