import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOLLOW_DELAY_MS, FollowScheduler, followOffset } from '../src/map/MapFollow.js';

/** A 40x40 map of 50 px tiles on a 1000x600 canvas, at its top-left. */
const view = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  tileSize: 50,
  canvasWidth: 1000,
  canvasHeight: 600,
  width: 40,
  height: 40,
};

test('a tile inside the deadzone does not pan the view', () => {
  assert.deepEqual(followOffset(view, '8,5'), { offsetX: 0, offsetY: 0 });
  assert.deepEqual(followOffset(view, 'entrance'), { offsetX: 0, offsetY: 0 });
});

test('a tile past the deadzone pans the view the least that brings it back', () => {
  // The x margin is 20% of 1000 = 200 px. Tile 17 draws at 850..900, so the
  // pan moves it to end at 800. The y margin is 3 tiles (150 px), more than
  // 20% of 600, so tile 10 (500..550) moves to end at 450.
  assert.deepEqual(followOffset(view, '17,10'), { offsetX: -100, offsetY: -100 });
  // A tile before the near margin pans the other way.
  const panned = { ...view, offsetX: -500, offsetY: -500 };
  assert.deepEqual(followOffset(panned, '11,11'), { offsetX: -350, offsetY: -400 });
});

test('an axis where the map fits the canvas never pans', () => {
  const small = { ...view, width: 10, height: 10, canvasHeight: 500 };
  assert.deepEqual(followOffset(small, '9,0'), { offsetX: 0, offsetY: 0 });
  // On a canvas smaller than two margins, the tile centres instead.
  const tiny = { ...view, canvasWidth: 200, canvasHeight: 200 };
  assert.deepEqual(followOffset(tiny, '10,10'), { offsetX: -425, offsetY: -425 });
});

/** A canvas stand-in that dispatches the pointer events by name. */
function fakeCanvas() {
  /** @type {Record<string, () => void>} */
  const handlers = {};
  return {
    addEventListener: (/** @type {string} */ name, /** @type {() => void} */ fn) => {
      handlers[name] = fn;
    },
    fire: (/** @type {string} */ name) => handlers[name](),
  };
}

test('the follow pan runs at once with the pointer away from the canvas', () => {
  let runs = 0;
  const follow = new FollowScheduler(/** @type {any} */ (fakeCanvas()), () => runs++);
  follow.request();
  assert.equal(runs, 1);
  follow.flush();
  assert.equal(runs, 1, 'nothing pending runs nothing');
});

test('the follow pan waits for the pointer to leave or for a quiet spell', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let runs = 0;
  const canvas = fakeCanvas();
  const follow = new FollowScheduler(/** @type {any} */ (canvas), () => runs++);
  canvas.fire('pointerenter');
  canvas.fire('pointerdown');
  follow.request();
  t.mock.timers.tick(FOLLOW_DELAY_MS - 1);
  canvas.fire('pointerdown');
  t.mock.timers.tick(FOLLOW_DELAY_MS - 1);
  assert.equal(runs, 0, 'each click restarts the wait');
  t.mock.timers.tick(1);
  assert.equal(runs, 1);
  follow.request();
  canvas.fire('pointerleave');
  assert.equal(runs, 2, 'leaving the canvas runs the pan');
  canvas.fire('pointerenter');
  follow.request();
  follow.cancel();
  t.mock.timers.tick(FOLLOW_DELAY_MS);
  assert.equal(runs, 2, 'a cancelled pan never runs');
});
