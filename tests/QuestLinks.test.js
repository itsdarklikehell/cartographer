import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuest } from '../src/quest/Quests.js';
import {
  addLink,
  creatureLink,
  linkKey,
  linksAfterShrink,
  linksIn,
  liveLinks,
  placeLink,
  removeLink,
  restoreLinks,
  unlinkMissingCreatures,
  unlinkNodes,
} from '../src/quest/QuestLinks.js';

/** @typedef {import('../src/types/quest.js').Quest} Quest */

/**
 * A quest with the given links.
 * @param {string} id
 * @param {import('../src/types/quest.js').QuestLink[]} links
 * @returns {Quest}
 */
function questWith(id, links) {
  return { ...createQuest(id, id), links };
}

test('placeLink defaults to the whole map, and each link has one key', () => {
  assert.deepEqual(placeLink('world'), { kind: 'place', nodeId: 'world', tileId: null });
  assert.equal(linkKey(placeLink('world')), 'place:world:');
  assert.equal(linkKey(placeLink('world', '2,3')), 'place:world:2,3');
  assert.equal(linkKey(creatureLink('bram')), 'creature:bram');
});

test('addLink appends a link and skips one to a target already linked', () => {
  const quest = addLink(createQuest('q1', 'A'), creatureLink('bram'));
  assert.deepEqual(quest.links, [creatureLink('bram')]);
  assert.equal(addLink(quest, creatureLink('bram')), quest);
  assert.equal(addLink(quest, placeLink('world')).links.length, 2);
});

test('removeLink drops the link with the key and keeps a quest without it', () => {
  const quest = questWith('q1', [creatureLink('bram'), placeLink('world')]);
  assert.deepEqual(removeLink(quest, 'creature:bram').links, [placeLink('world')]);
  assert.equal(removeLink(quest, 'creature:nobody'), quest);
});

test('liveLinks keeps only the links whose node or creature exists', () => {
  const links = [placeLink('world'), placeLink('gone'), creatureLink('bram'), creatureLink('x')];
  const live = liveLinks(
    links,
    (id) => id === 'world',
    (id) => id === 'bram',
  );
  assert.deepEqual(live, [placeLink('world'), creatureLink('bram')]);
});

test('unlinkNodes removes the place links to the nodes and keeps the rest', () => {
  const quests = [
    questWith('q1', [placeLink('cave', '1,1'), creatureLink('cave'), placeLink('world')]),
    questWith('q2', [placeLink('world')]),
  ];
  const next = unlinkNodes(quests, new Set(['cave']));
  assert.deepEqual(next[0].links, [creatureLink('cave'), placeLink('world')]);
  assert.equal(next[1], quests[1]);
  assert.equal(unlinkNodes(quests, new Set(['elsewhere'])), quests);
});

test('restoreLinks puts the links from linksIn back where they were', () => {
  const quests = [
    questWith('q1', [placeLink('cave'), creatureLink('bram'), placeLink('cave', '2,2')]),
    questWith('q2', [placeLink('world')]),
  ];
  const doomed = new Set(['cave']);
  const refs = linksIn(quests, doomed);
  assert.deepEqual(refs, [
    { questId: 'q1', index: 0, link: placeLink('cave') },
    { questId: 'q1', index: 2, link: placeLink('cave', '2,2') },
  ]);
  const restored = restoreLinks(unlinkNodes(quests, doomed), refs);
  assert.deepEqual(restored[0].links, quests[0].links);
  assert.equal(restored[1], quests[1]);
});

test('restoreLinks skips a quest that is gone and a link the quest has again', () => {
  const quests = [questWith('q1', [placeLink('cave')])];
  const refs = [
    { questId: 'q1', index: 0, link: placeLink('cave') },
    { questId: 'gone', index: 0, link: placeLink('cave') },
  ];
  const restored = restoreLinks(quests, refs);
  assert.equal(restored[0], quests[0]);
  assert.equal(restoreLinks(quests, []), quests);
});

test('restoreLinks appends a link whose position is past the end', () => {
  const quests = [questWith('q1', [])];
  const restored = restoreLinks(quests, [{ questId: 'q1', index: 5, link: placeLink('cave') }]);
  assert.deepEqual(restored[0].links, [placeLink('cave')]);
});

test('unlinkMissingCreatures drops the links to creatures that are gone', () => {
  const quests = [
    questWith('q1', [creatureLink('bram'), creatureLink('dead'), placeLink('dead')]),
    questWith('q2', [creatureLink('bram')]),
  ];
  const next = unlinkMissingCreatures(quests, new Set(['bram']));
  assert.deepEqual(next[0].links, [creatureLink('bram'), placeLink('dead')]);
  assert.equal(next[1], quests[1]);
  assert.equal(unlinkMissingCreatures(quests, new Set(['bram', 'dead'])), quests);
});

test('linksAfterShrink turns a tile link outside the bounds into a whole-map link', () => {
  const quests = [
    questWith('q1', [placeLink('town', '1,1'), placeLink('town', '8,2'), placeLink('keep', '9,9')]),
  ];
  const next = linksAfterShrink(quests, 'town', 5, 5);
  assert.deepEqual(next[0].links, [
    placeLink('town', '1,1'),
    placeLink('town'),
    placeLink('keep', '9,9'),
  ]);
  assert.equal(linksAfterShrink(quests, 'town', 10, 10), quests);
});

test('linksAfterShrink keeps one whole-map link when the quest has one already', () => {
  const quests = [questWith('q1', [placeLink('town'), placeLink('town', '8,8')])];
  assert.deepEqual(linksAfterShrink(quests, 'town', 4, 4)[0].links, [placeLink('town')]);
});
