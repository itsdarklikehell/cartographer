import { test } from 'node:test';
import assert from 'node:assert/strict';
import { travelMinutes } from '../src/time/TravelTime.js';
import { createMapNode } from '../src/map/TileGrid.js';

const region = createMapNode('r', 'Region', null, 4, 4);
const interior = { ...region, kind: /** @type {const} */ ('interior') };

test('a step costs less time the deeper the map sits', () => {
  assert.equal(travelMinutes(region, 0, 2), 480, 'world map');
  assert.equal(travelMinutes(region, 1, 12), 360, 'region map');
  assert.equal(travelMinutes(region, 2, 10), 10, 'town map');
  assert.equal(travelMinutes(region, 5, 10), 10, 'deeper still');
});

test('a building interior and a walk of no steps cost nothing', () => {
  assert.equal(travelMinutes(interior, 1, 10), 0);
  assert.equal(travelMinutes(region, 1, 0), 0);
});
