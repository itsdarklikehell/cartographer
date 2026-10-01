import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fightFrame } from '../src/map/FightFrame.js';

const node = { width: 20, height: 10 };

test('fightFrame fits the window into the smaller side and centers the tile', () => {
  // A 7-tile window in a 280 x 210 canvas: 30 px tiles.
  assert.deepEqual(fightFrame(node, '4,2', 280, 210, 3), {
    tileSize: 30,
    offsetX: 140 - 135,
    offsetY: 105 - 75,
  });
});

test('fightFrame centers the node when the tile does not parse', () => {
  assert.deepEqual(fightFrame(node, null, 100, 100, 0), {
    tileSize: 100,
    offsetX: 50 - 1000,
    offsetY: 50 - 500,
  });
  assert.equal(fightFrame(node, 'nope', 4, 4, -2).tileSize, 4);
  assert.equal(fightFrame(node, '1,1', 0, 0, 3).tileSize, 1);
});
