import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSightingLog } from '../src/app/mapSightings.js';
import { revealLinksTo } from '../src/map/FogOfWar.js';
import { TileGrid, createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { fillTiles } from './helpers/grid.js';
import { stubApp } from './helpers/app.js';

function setup() {
  const grid = new TileGrid();
  let vale = fillTiles(createMapNode('vale', 'Vale', null, 4, 4));
  vale = setTile(vale, createTile('1,1', 'town.svg', { childNodeId: 'town' }));
  vale = setTile(vale, createTile('3,3', 'cave.svg', { childNodeId: 'cave' }));
  vale = setTile(vale, createTile('0,3', 'ruin.svg', { childNodeId: 'gone' }));
  grid.addNode(vale);
  grid.addNode(createMapNode('town', 'Briarwick', 'vale', 4, 4));
  grid.addNode(createMapNode('cave', 'Oakarden Barrow', 'vale', 4, 4));
  const app = stubApp({ grid });
  return { app, grid, vale, note: createSightingLog(app) };
}

test('a move that reveals a site logs it as sighted', () => {
  const { app, grid, vale, note } = setup();
  grid.updateNode(revealLinksTo(revealLinksTo(vale, 'town'), 'cave'));
  note(vale, 'town');
  assert.deepEqual(app.log, ['Sighted Oakarden Barrow.']);
});

test('nothing logs without a node, or for a link to a missing node', () => {
  const { app, grid, vale, note } = setup();
  note(undefined);
  grid.updateNode(revealLinksTo(vale, 'gone'));
  note(vale);
  note(createMapNode('elsewhere', 'Elsewhere', null, 1, 1));
  assert.deepEqual(app.log, []);
});
