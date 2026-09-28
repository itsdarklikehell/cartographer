import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapTravel } from '../src/app/mapTravel.js';
import { TileGrid, createMapNode, createTile } from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { townWallArt } from '../src/map/TileKinds.js';
import { MapNavigator } from '../src/map/MapNavigator.js';
import { PartyTracker } from '../src/party/PartyTracker.js';
import { createCharacter } from '../src/entities/Character.js';
import { gridTiles } from './helpers/grid.js';
import { stubApp } from './helpers/app.js';

/**
 * A 5x5 revealed town whose wall ring closes in the tile 2,2, with the party
 * at 0,0. Tile 4,4 links to a child map, and a second copy of the ring sits
 * in that child, so a test can put the party in another node. `toasts`
 * records every toast message.
 * @param {{ role?: 'gm' | 'player', splitParty?: boolean, characters?: any[], selected?: string | null }} [opts]
 */
function town({ role = 'gm', splitParty = false, characters = [], selected = null } = {}) {
  const ring = ['.....', '.###.', '.#.#.', '.###.', '.....'];
  const tiles = gridTiles(5, 5, (id, x, y) => ({
    ...createTile(id, ring[y][x] === '#' ? townWallArt('wall-v') : 'grass.svg'),
    revealed: true,
    ...(id === '4,4' ? { childNodeId: 'inn' } : {}),
  }));
  const grid = new TileGrid();
  grid.addNode(withNodeTiles(createMapNode('town', 'Town', null, 5, 5), tiles));
  grid.addNode(withNodeTiles(createMapNode('inn', 'Inn', 'town', 5, 5), tiles));
  const navigator = new MapNavigator(grid, 'town');
  const partyTracker = new PartyTracker(grid, { nodeId: 'town', tileId: '0,0' });
  /** @type {string[]} */
  const toasts = [];
  const app = stubApp({
    grid,
    navigator,
    partyTracker,
    toasts: { show: (/** @type {string} */ m) => toasts.push(m) },
    state: { role, splitParty, characters },
    actions: {
      getSelectedCharacterId: () => selected,
      getBoundCharacterId: () => selected,
    },
  });
  const noop = () => {};
  const env = /** @type {any} */ ({
    goToNode: (/** @type {string} */ id) => navigator.goTo(id),
    mapCanvas: { setNode: noop, refreshNode: noop },
    breadcrumb: { update: noop },
    worldTree: { update: noop },
    regionTree: { update: noop },
    syncPartyMarker: noop,
    syncExits: noop,
  });
  const travel = createMapTravel(app, env);
  /** @param {string} tileId */
  const click = (tileId) => {
    const [x, y] = tileId.split(',').map(Number);
    travel.onCellClick(x, y, navigator.getCurrentNode().tiles.find((t) => t.id === tileId) ?? null);
  };
  return { app, state: app.state, navigator, partyTracker, toasts, click };
}

test('a GM click moves the party along an open path', () => {
  const w = town();
  w.click('4,0');
  assert.deepEqual(w.partyTracker.getPosition(), { nodeId: 'town', tileId: '4,0' });
});

test('a player click cannot take a token across a wall, and says why', () => {
  const hero = createCharacter('hero', 'Hero');
  const w = town({ role: 'player', splitParty: true, characters: [hero], selected: 'hero' });
  w.click('2,2');
  assert.equal(w.state.characters[0].location, null, 'the token stays with the party');
  assert.deepEqual(w.toasts, ['Walls or obstacles block every path to that tile.']);
  w.click('1,1');
  assert.equal(w.state.characters[0].location, null, 'no token stands on a wall');
  w.click('4,2');
  assert.deepEqual(w.state.characters[0].location, { nodeId: 'town', tileId: '4,2' });
});

test('a player walks through revealed tiles only', () => {
  const hero = createCharacter('hero', 'Hero');
  const w = town({ role: 'player', splitParty: true, characters: [hero], selected: 'hero' });
  const node = w.navigator.getCurrentNode();
  // Fog on the whole top row and left column leaves no revealed way from 0,0.
  w.app.grid.updateNode({
    ...node,
    tiles: node.tiles.map((t) =>
      /^0,|,0$/.test(t.id) && t.id !== '0,0' ? { ...t, revealed: false } : t,
    ),
  });
  w.click('4,4');
  assert.equal(w.navigator.getCurrentNode().id, 'town', 'the link to the inn stays shut');
  assert.equal(w.toasts.length, 1);
});

test('a spectator click and a mover in another node skip the walk check', () => {
  const spectator = town({ role: 'player' });
  spectator.click('2,2');
  assert.deepEqual(spectator.toasts, []);

  // The party stands in the inn while the GM views the town. A click on the
  // inn link only brings the view in.
  const gm = town();
  gm.partyTracker.moveTo('inn', '2,2');
  gm.click('4,4');
  assert.equal(gm.navigator.getCurrentNode().id, 'inn');
  assert.deepEqual(gm.partyTracker.getPosition(), { nodeId: 'inn', tileId: '2,2' });
});
