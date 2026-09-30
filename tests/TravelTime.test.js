import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepsBefore, travelMinutes, walkMinutes } from '../src/time/TravelTime.js';
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

test('walkMinutes charges one step fewer than the tiles of the path', () => {
  assert.equal(walkMinutes(region, 1, ['0,0', '1,0', '2,0']), 60);
  assert.equal(walkMinutes(region, 1, ['0,0']), 0);
  assert.equal(walkMinutes(interior, 1, ['0,0', '1,0']), 0);
});

test('stepsBefore stops short of a step that lands on the watch', () => {
  assert.equal(stepsBefore(90, 30, 10), 2, 'the third step lands exactly at 90');
  assert.equal(stepsBefore(100, 30, 10), 3);
  assert.equal(stepsBefore(100, 30, 2), 2, 'never more than the walk');
  assert.equal(stepsBefore(20, 30, 5), 0, 'the first step already reaches it');
  assert.equal(stepsBefore(0, 30, 5), 0);
  assert.equal(stepsBefore(10, 0, 5), 5, 'a free walk');
});
