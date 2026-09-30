import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedParts, redoSummary, undoSummary } from '../src/storage/StepSummary.js';

/** @returns {import('../src/types/storage.js').CampaignState} */
function base() {
  return /** @type {any} */ ({
    version: 1,
    nodes: [{ id: 'root' }],
    party: { nodeId: 'root', tileId: '0,0' },
    entryTiles: {},
    characters: [{ id: 'a', hp: 10 }],
    creatures: [],
    travelog: [],
    quests: [],
    clock: null,
    handouts: [],
    bestiary: [],
    splitParty: false,
    combat: null,
  });
}

test('changedParts names nothing for two equal saves built from fresh objects', () => {
  assert.deepEqual(changedParts(base(), base()), []);
});

test('changedParts lists each changed part in a fixed order', () => {
  const after = { ...base(), clock: { day: 1, watch: 2 }, characters: [{ id: 'a', hp: 4 }] };
  assert.deepEqual(changedParts(base(), after), ['characters', 'the clock']);
});

test('changedParts ignores the version and the entry memory', () => {
  const after = { ...base(), version: 9, entryTiles: { party: { x: '1,1' } } };
  assert.deepEqual(changedParts(base(), after), []);
});

test('changedParts treats a missing field as null', () => {
  const before = /** @type {any} */ ({ ...base(), combat: undefined });
  assert.deepEqual(changedParts(before, base()), []);
});

test('undoSummary names one, two, or more parts', () => {
  const one = { ...base(), quests: [/** @type {any} */ ({ id: 'q' })] };
  assert.equal(undoSummary(base(), one), 'Undo restored quests from the previous save.');
  const two = { ...one, splitParty: true };
  assert.equal(
    undoSummary(base(), two),
    'Undo restored quests and party splitting from the previous save.',
  );
  const three = { ...two, nodes: [/** @type {any} */ ({ id: 'other' })] };
  assert.equal(
    undoSummary(base(), three),
    'Undo restored the map, quests, and party splitting from the previous save.',
  );
});

test('undoSummary and redoSummary fall back when nothing differs', () => {
  assert.equal(undoSummary(base(), base()), 'Restored the previous save.');
  assert.equal(redoSummary(base(), base()), 'Reapplied the undone change.');
});

test('redoSummary names the reapplied parts', () => {
  const after = { ...base(), party: { nodeId: 'root', tileId: '1,0' } };
  assert.equal(redoSummary(base(), after), 'Redo reapplied the change to the party position.');
});
