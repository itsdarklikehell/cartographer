import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapTravel } from '../src/app/mapTravel.js';
import { TileGrid, createMapNode, createTile } from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { townWallArt } from '../src/map/TileKinds.js';
import { MapNavigator } from '../src/map/MapNavigator.js';
import { PartyTracker } from '../src/party/PartyTracker.js';
import { createCharacter } from '../src/entities/Character.js';
import { advanceMinutes } from '../src/time/GameClock.js';
import { gridTiles } from './helpers/grid.js';
import { stubApp } from './helpers/app.js';
import { settle, walkDialogs } from './helpers/walkDialogs.js';

/**
 * A revealed 8x3 world map, where a step costs a watch, with the party at
 * 0,0. The clock starts at Day 1, Afternoon, so the second step lands on
 * Night. Walls close in tile 1,2, which no walk reaches, for a forced move. The
 * stand-in passTravelTime moves the clock, so a test reads the time spent.
 * @param {{ answer?: Parameters<typeof walkDialogs>[0], clock?: any, split?: boolean }} [opts]
 */
function line({ answer, clock = { day: 1, watch: 3 }, split = false } = {}) {
  const tiles = gridTiles(8, 3, (id) => ({
    ...createTile(id, ['0,2', '2,2', '1,1'].includes(id) ? townWallArt('wall-v') : 'grass.svg'),
    revealed: true,
  }));
  const grid = new TileGrid();
  grid.addNode(withNodeTiles(createMapNode('world', 'World', null, 8, 3), tiles));
  const navigator = new MapNavigator(grid, 'world');
  const partyTracker = new PartyTracker(grid, { nodeId: 'world', tileId: '0,0' });
  const hero = createCharacter('hero', 'Hero');
  const app = stubApp({
    grid,
    navigator,
    partyTracker,
    state: { clock, splitParty: split, characters: [hero] },
    actions: {
      getSelectedCharacterId: () => 'hero',
      passTravelTime: (/** @type {number} */ minutes) => {
        app.state.clock = advanceMinutes(app.state.clock, minutes);
      },
    },
  });
  const noop = () => {};
  const env = /** @type {any} */ ({
    mapCanvas: { setNode: noop, refreshNode: noop },
    syncPartyMarker: noop,
    syncExits: noop,
    regionTree: { update: noop },
  });
  const dialogs = walkDialogs(answer);
  const travel = createMapTravel(app, env, dialogs);
  /** @param {string} tileId */
  const click = (tileId) => {
    const [x, y] = tileId.split(',').map(Number);
    travel.onCellClick(x, y, navigator.getCurrentNode().tiles.find((t) => t.id === tileId) ?? null);
  };
  const at = () => partyTracker.getPosition().tileId;
  return { app, dialogs, click, at };
}

test('cancel on the Night warning leaves the party and the clock alone', async () => {
  const w = line({ answer: { choice: 'cancel' } });
  w.click('5,0');
  await settle();
  assert.equal(w.at(), '0,0');
  assert.deepEqual(w.app.state.clock, { day: 1, watch: 3 });
  assert.deepEqual(w.dialogs.asked, [
    {
      message: 'The walk takes 20 hours, and Night falls on the way.',
      choices: ['walk', 'stop'],
    },
  ]);
});

test('Walk on takes the whole walk into Night', async () => {
  const w = line();
  w.click('5,0');
  await settle();
  assert.equal(w.at(), '5,0');
  assert.deepEqual(w.app.state.clock, { day: 2, watch: 2 });
});

test('Stop at Dusk cuts the walk at the last step before Night', async () => {
  const w = line({ answer: { choice: 'stop' } });
  w.click('5,0');
  await settle();
  assert.equal(w.at(), '1,0');
  assert.deepEqual(w.app.state.clock, { day: 1, watch: 4 });
});

test('the stop choice is hidden when the first step reaches Night', async () => {
  const w = line({ answer: { choice: 'cancel' }, clock: { day: 1, watch: 4 } });
  w.click('3,0');
  await settle();
  assert.deepEqual(w.dialogs.asked[0].choices, ['walk']);
});

test('a walk that ends before Night and a walk inside Night ask nothing', () => {
  const short = line();
  short.click('1,0');
  assert.equal(short.at(), '1,0');
  const late = line({ clock: { day: 1, watch: 5 } });
  late.click('3,0');
  assert.equal(late.at(), '3,0');
  assert.deepEqual([...short.dialogs.asked, ...late.dialogs.asked], []);
});

test("Don't ask again tonight lets later walks into the same Night go ahead", async () => {
  const w = line({ answer: { choice: 'cancel', checked: true } });
  w.click('5,0');
  await settle();
  w.click('4,0');
  assert.equal(w.at(), '4,0', 'moves at once, with no dialog');
  assert.equal(w.dialogs.asked.length, 1);
});

test('a split-party move spends no time and never warns', () => {
  const w = line({ split: true });
  w.click('5,0');
  assert.deepEqual(w.dialogs.asked, []);
  assert.deepEqual(w.app.state.clock, { day: 1, watch: 3 });
});

test('a forced move adds the Night warning to its own confirm', async () => {
  const w = line({ answer: { choice: 'cancel' } });
  w.click('1,2');
  await settle();
  assert.equal(w.dialogs.asked.length, 1);
  assert.match(
    w.dialogs.asked[0].message,
    /^Walls, obstacles, .* anyway\? The walk takes 12 hours/,
  );
  assert.deepEqual(w.dialogs.asked[0].choices, ['walk'], 'a forced move has no path to cut');
  assert.equal(w.at(), '0,0');
});

test('a forced move short of Night asks only the move confirm', async () => {
  const w = line({ clock: { day: 1, watch: 0 } });
  w.click('1,2');
  await settle();
  assert.deepEqual(w.dialogs.asked[0].choices, ['confirm']);
  assert.equal(w.at(), '1,2');
});
