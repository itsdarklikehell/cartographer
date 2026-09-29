import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  holdSaves,
  loadTruncation,
  noteTruncation,
  releaseSaves,
  savesHeld,
} from '../src/storage/ShortenedLoad.js';
import { buildState, deserialize, serialize } from '../src/storage/SaveManager.js';
import { MAX_NODES, MAX_TOTAL_CELLS } from '../src/storage/TileCodec.js';
import { loadInitialCampaignSafe } from '../src/campaign/Campaigns.js';
import { createMapNode, TileGrid } from '../src/map/TileGrid.js';
import { installLocalStorage } from './helpers/env.js';

beforeEach(installLocalStorage);
afterEach(releaseSaves);

/**
 * A save whose encoded nodes declare 1000x1000 grids of one run each, so a
 * few of them pass the total cell limit.
 * @param {number} count
 */
function hugeSave(count) {
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    name: `N${i}`,
    parentId: null,
    width: 1000,
    height: 1000,
    refs: ['meadow'],
    cells: [[0, 1_000_000]],
  }));
  return JSON.stringify({ version: 8, nodes });
}

test('a report with nothing cut is not kept', () => {
  const state = {};
  noteTruncation(state, { dropped: 0, emptied: 0 });
  assert.equal(loadTruncation(state), null);
  assert.equal(loadTruncation(null), null);
  noteTruncation(state, { dropped: 1, emptied: 0 });
  assert.deepEqual(loadTruncation(state), { dropped: 1, emptied: 0 });
});

test('the hold turns on and off', () => {
  assert.equal(savesHeld(), false);
  holdSaves();
  assert.equal(savesHeld(), true);
  releaseSaves();
  assert.equal(savesHeld(), false);
});

test('deserialize reports the nodes the cell limit empties, off the state', () => {
  const count = MAX_TOTAL_CELLS / 1_000_000 + 1;
  const state = deserialize(hugeSave(count));
  assert.deepEqual(loadTruncation(state), { dropped: 0, emptied: 1 });
  assert.equal(state.nodes.at(-1)?.tiles.length, 0);
  assert.equal('truncation' in state, false);
  assert.deepEqual(
    Object.keys(state),
    Object.keys(deserialize(serialize(buildState({ grid: new TileGrid() })))),
    'the state has no field a whole load lacks',
  );
});

test('deserialize reports the nodes past the node limit', () => {
  const nodes = Array.from({ length: MAX_NODES + 3 }, (_, i) =>
    createMapNode(`n${i}`, `N${i}`, null, 1, 1),
  );
  const state = deserialize(JSON.stringify({ version: 8, nodes }));
  assert.deepEqual(loadTruncation(state), { dropped: 3, emptied: 0 });
});

test('a whole load reports nothing', () => {
  const grid = new TileGrid();
  grid.addNode(createMapNode('w', 'W', null, 2, 2));
  assert.equal(loadTruncation(deserialize(serialize(buildState({ grid })))), null);
});

test('the boot load passes on what a stored save left out', () => {
  assert.equal(loadInitialCampaignSafe().truncated, null, 'nothing stored');
  localStorage.setItem('campaign-builder:save', hugeSave(MAX_TOTAL_CELLS / 1_000_000 + 1));
  const boot = loadInitialCampaignSafe();
  assert.equal(boot.failed, false);
  assert.deepEqual(boot.truncated, { dropped: 0, emptied: 1 });
  localStorage.setItem('campaign-builder:save', '{"nodes":[]}');
  assert.equal(loadInitialCampaignSafe().truncated, null, 'a failed load reports no cut');
});
