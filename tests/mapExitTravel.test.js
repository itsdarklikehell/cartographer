import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapTravel } from '../src/app/mapTravel.js';
import { TileGrid, createMapNode, createTile, getTile, setTile } from '../src/map/TileGrid.js';
import { MapNavigator } from '../src/map/MapNavigator.js';
import { PartyTracker } from '../src/party/PartyTracker.js';
import { createCharacter } from '../src/entities/Character.js';
import { entryFor } from '../src/map/EntryMemory.js';
import { fillTiles, gridTiles } from './helpers/grid.js';
import { stubApp } from './helpers/app.js';

/**
 * An 8x4 "World" split down the middle into two painted regions that share a
 * border: "Westmarch" links the cells at x 0-3 and "Eastmarch" the cells at
 * x 4-7. Each region is a 4x4 map. The party stands in Westmarch at `at`.
 * @param {{
 *   at?: string,
 *   role?: 'gm' | 'player',
 *   splitParty?: boolean,
 *   characters?: any[],
 *   selected?: string | null,
 *   eastKind?: 'region' | 'interior',
 *   revealed?: boolean,
 * }} [opts]
 */
function borderWorld({
  at = '3,1',
  role = 'gm',
  splitParty = false,
  characters = [],
  selected = null,
  eastKind = 'region',
  revealed = false,
} = {}) {
  const grid = new TileGrid();
  grid.addNode(
    fillTiles(createMapNode('world', 'World', null, 8, 4), (id, x) => ({
      ...createTile(id, 'grass.svg', { childNodeId: x < 4 ? 'west' : 'east' }),
      revealed,
    })),
  );
  grid.addNode({ ...createMapNode('west', 'Westmarch', 'world', 4, 4), tiles: gridTiles(4, 4) });
  grid.addNode({
    ...createMapNode('east', 'Eastmarch', 'world', 4, 4, { kind: eastKind }),
    tiles: gridTiles(4, 4),
  });
  const navigator = new MapNavigator(grid, 'west');
  const partyTracker = new PartyTracker(grid, { nodeId: 'west', tileId: at });
  const app = stubApp({
    grid,
    navigator,
    partyTracker,
    state: { role, mode: 'play', splitParty, characters },
    actions: {
      getSelectedCharacterId: () => selected,
      getBoundCharacterId: () => selected,
      maybeTriggerEncounter: (/** @type {any} */ where, /** @type {string} */ who) => {
        app.triggers.push({ where: where ?? null, who: who ?? null });
      },
    },
  });
  app.triggers = [];
  const env = /** @type {any} */ ({
    goToNode: (/** @type {string} */ id) => navigator.goTo(id),
    mapCanvas: { setNode() {}, refreshNode() {}, markerVisible: () => true },
    breadcrumb: { update() {} },
    worldTree: { update() {} },
    regionTree: { update() {} },
    syncPartyMarker() {},
    syncExits() {},
    tileTooltip: { show() {}, hide() {} },
  });
  const travel = createMapTravel(app, env);
  return { app, grid, navigator, partyTracker, state: app.state, travel, log: app.log };
}

/** @param {ReturnType<typeof borderWorld>} w */
function eastExit(w) {
  const exit = w.travel.currentExits().find((e) => e.kind === 'edge' && e.side === 'east');
  assert.ok(exit, 'expected an east exit');
  return exit;
}

test('the side that borders another region crosses into it', () => {
  const w = borderWorld();
  assert.deepEqual(w.travel.currentExits(), [
    {
      kind: 'edge',
      side: 'east',
      targetNodeId: 'east',
      targetName: 'Eastmarch',
      crossTileId: '4,1',
      along: 1,
    },
  ]);
});

test('crossing moves the party to the matching spot of the next region', () => {
  const w = borderWorld();
  w.travel.exitToParent(eastExit(w));
  assert.deepEqual(w.partyTracker.getPosition(), { nodeId: 'east', tileId: '0,1' });
  assert.equal(w.navigator.getCurrentNode().id, 'east');
  assert.equal(w.log.at(-1), 'Discovered Eastmarch.');
  assert.equal(getTile(w.grid.getNode('world'), '4,1')?.revealed, true);
  assert.equal(getTile(w.grid.getNode('east'), '0,1')?.revealed, true);
  assert.equal(entryFor(w.state.entryTiles, 'party', 'east'), '4,1');
  assert.equal(w.app.dirty > 0, true);
  assert.deepEqual(w.app.triggers, [{ where: null, who: null }]);
  // The new region's west side leads back across the same border.
  const back = w.travel.currentExits();
  assert.deepEqual(
    back.map((e) => e.targetNodeId),
    ['west'],
  );
});

test('a second crossing into a visited region is not a discovery', () => {
  const w = borderWorld();
  w.travel.exitToParent(eastExit(w));
  const [back] = w.travel.currentExits();
  w.travel.exitToParent(back);
  assert.equal(w.partyTracker.getPosition().nodeId, 'west');
  w.travel.exitToParent(eastExit(w));
  assert.equal(w.log.at(-1), 'The party crosses into Eastmarch.');
});

test('a split-party crossing moves only the selected character', () => {
  const hero = createCharacter('hero', 'Hero');
  const w = borderWorld({ splitParty: true, characters: [hero], selected: 'hero' });
  w.travel.exitToParent(eastExit(w));
  assert.deepEqual(w.state.characters[0].location, { nodeId: 'east', tileId: '0,1' });
  assert.deepEqual(w.partyTracker.getPosition(), { nodeId: 'west', tileId: '3,1' });
  assert.equal(getTile(w.grid.getNode('east'), '0,1')?.revealed, true);
  assert.equal(entryFor(w.state.entryTiles, 'c:hero', 'east'), '4,1');
  assert.equal(w.log.at(-1), 'Hero discovers Eastmarch.');
  assert.deepEqual(w.app.triggers, [{ where: { nodeId: 'east', tileId: '0,1' }, who: 'Hero' }]);
});

test('a lone character crossing into a visited region logs a crossing', () => {
  const hero = createCharacter('hero', 'Hero');
  const w = borderWorld({ splitParty: true, characters: [hero], selected: 'hero' });
  w.grid.updateNode({
    ...w.grid.getNode('east'),
    tiles: gridTiles(4, 4, (id) => ({ ...createTile(id, 'grass.svg'), revealed: true })),
  });
  w.travel.exitToParent(eastExit(w));
  assert.equal(w.log.at(-1), 'Hero crosses into Eastmarch.');
});

test('the exit band follows the traveler, and the crossing follows the row', () => {
  const w = borderWorld({ at: '3,3' });
  assert.deepEqual(eastExit(w), {
    kind: 'edge',
    side: 'east',
    targetNodeId: 'east',
    targetName: 'Eastmarch',
    crossTileId: '4,3',
    along: 3,
  });
});

test('an interior beside a region is not a crossing target', () => {
  const w = borderWorld({ eastKind: 'interior' });
  const exit = eastExit(w);
  assert.equal(exit.targetNodeId, 'world');
  assert.equal(exit.kind === 'edge' && exit.crossTileId, undefined);
});

test('a stale crossing only moves the view to the parent', () => {
  const w = borderWorld();
  const exit = eastExit(w);
  const worldNode = /** @type {any} */ (w.grid.getNode('world'));
  w.grid.updateNode(setTile(worldNode, createTile('4,1', 'grass.svg')));
  w.travel.exitToParent(exit);
  assert.equal(w.navigator.getCurrentNode().id, 'world');
  assert.deepEqual(w.partyTracker.getPosition(), { nodeId: 'west', tileId: '3,1' });
  assert.deepEqual(w.log, []);
});

test('a crossing whose target region is gone only moves the view to the parent', () => {
  const w = borderWorld();
  w.travel.exitToParent({
    kind: 'edge',
    side: 'east',
    targetNodeId: 'nowhere',
    targetName: 'Nowhere',
    crossTileId: '4,1',
  });
  assert.equal(w.navigator.getCurrentNode().id, 'world');
  assert.deepEqual(w.log, []);
});

test('a crossing at the root does nothing', () => {
  const w = borderWorld();
  w.navigator.goTo('world');
  w.travel.exitToParent({
    kind: 'edge',
    side: 'east',
    targetNodeId: 'east',
    targetName: 'Eastmarch',
    crossTileId: '4,1',
  });
  assert.equal(w.navigator.getCurrentNode().id, 'world');
  assert.deepEqual(w.log, []);
});

test('a GM who looks at a region the party is not in only moves the view across', () => {
  const w = borderWorld();
  const exit = eastExit(w);
  w.partyTracker.moveTo('east', '2,2');
  w.travel.exitToParent(exit);
  assert.equal(w.navigator.getCurrentNode().id, 'east');
  assert.deepEqual(w.partyTracker.getPosition(), { nodeId: 'east', tileId: '2,2' });
  assert.deepEqual(w.log, []);
});

test('a player tab does not name a region behind the fog', () => {
  const fogged = borderWorld({ role: 'player' });
  const exit = eastExit(fogged);
  assert.equal(exit.targetName, '');
  // A spectator tab follows only as far as the parent map while the fog
  // still hides the region across the border.
  fogged.travel.exitToParent(exit);
  assert.equal(fogged.navigator.getCurrentNode().id, 'world');
  assert.equal(fogged.partyTracker.getPosition().nodeId, 'west');

  const seen = borderWorld({ role: 'player', revealed: true });
  const named = eastExit(seen);
  assert.equal(named.targetName, 'Eastmarch');
  seen.travel.exitToParent(named);
  assert.equal(seen.navigator.getCurrentNode().id, 'east');
  assert.equal(seen.partyTracker.getPosition().nodeId, 'west');
});

test('a bound player crosses with their own character', () => {
  const hero = createCharacter('hero', 'Hero');
  const w = borderWorld({ role: 'player', splitParty: true, characters: [hero], selected: 'hero' });
  w.travel.exitToParent(eastExit(w));
  assert.deepEqual(w.state.characters[0].location, { nodeId: 'east', tileId: '0,1' });
});
