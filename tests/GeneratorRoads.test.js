import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArmNetwork } from '../src/map/Autotile.js';
import { bridgeAt, distanceTo, layRoad, routeRoad } from '../src/map/GeneratorRoads.js';

/**
 * A road ground from rows of single-char codes: ~ water, M mountain, T
 * forest, anything else grass. `|` and `-` are grass cells under a straight
 * river channel, and `+` is a river junction.
 * @param {string[]} rows
 */
function groundFrom(rows) {
  const size = rows.length;
  const code = { '~': 'water', M: 'mountain', T: 'forest' };
  const flat = rows.join('').split('');
  const cells = flat.map((c) => code[/** @type {'~'} */ (c)] ?? 'grass');
  const rivers = new ArmNetwork();
  flat.forEach((c, i) => {
    const x = i % size;
    const y = Math.floor(i / size);
    if (c === '|') ['n', 's'].forEach((a) => rivers.add(x, y, /** @type {any} */ (a)));
    if (c === '-') ['e', 'w'].forEach((a) => rivers.add(x, y, /** @type {any} */ (a)));
    if (c === '+') ['n', 's', 'e'].forEach((a) => rivers.add(x, y, /** @type {any} */ (a)));
  });
  return { size, cells, rivers, roads: new ArmNetwork() };
}

/** @param {[number, number]} to */
const reach = (to) => ({
  isGoal: (/** @type {number} */ x, /** @type {number} */ y) => x === to[0] && y === to[1],
  estimate: distanceTo([to]),
});

test('a road takes the cheap way around a forest and never enters water or mountain', () => {
  const ground = groundFrom(['.....', '.TTT.', '.T~T.', '.TMT.', '.....']);
  const { isGoal, estimate } = reach([2, 4]);
  const path = /** @type {[number, number][]} */ (routeRoad(ground, [2, 0], isGoal, estimate));
  assert.deepEqual(path[0], [2, 0]);
  assert.deepEqual(path.at(-1), [2, 4]);
  for (const [x, y] of path.slice(1, -1)) {
    assert.equal(ground.cells[y * 5 + x], 'grass', `${x},${y} is open ground`);
  }
});

test('a road crosses a straight river only straight across, as a bridge', () => {
  const ground = groundFrom(['..|..', '..|..', '..|..', '..|..', '..|..']);
  const { isGoal, estimate } = reach([4, 2]);
  const path = /** @type {[number, number][]} */ (routeRoad(ground, [0, 2], isGoal, estimate));
  const i = path.findIndex(([x]) => x === 2);
  assert.deepEqual(path[i - 1][1], path[i][1], 'enters the bridge east-west');
  assert.deepEqual(path[i + 1][1], path[i][1], 'leaves the bridge east-west');
  assert.equal(bridgeAt(ground.rivers, 2, path[i][1]), 'bridge-h');
  assert.equal(bridgeAt(groundFrom(['-']).rivers, 0, 0), 'bridge-v');
  assert.equal(bridgeAt(ground.rivers, 0, 0), null, 'no river, no bridge');
});

test('no road runs along a river or over a junction', () => {
  // The only way from top to bottom runs down the channel, which a road
  // cannot follow, and the junction takes no bridge.
  const ground = groundFrom(['~.~', '~|~', '~+~']);
  const { isGoal, estimate } = reach([1, 2]);
  assert.equal(routeRoad(ground, [1, 0], isGoal, estimate), null);
});

test('a road follows an existing road instead of cutting a parallel track', () => {
  const ground = groundFrom(['......', '......', '......', '......', '......', '......']);
  layRoad(ground.roads, [
    [0, 3],
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 3],
  ]);
  assert.equal(ground.roads.pieces().get('2,3'), 'h');
  const { isGoal, estimate } = reach([5, 2]);
  const path = /** @type {[number, number][]} */ (routeRoad(ground, [0, 2], isGoal, estimate));
  const onRoad = path.filter(([x, y]) => ground.roads.has(x, y)).length;
  assert.ok(onRoad >= 4, `the road reuses the old one: ${JSON.stringify(path)}`);
});

test('blocked cells stop a road, but a goal cell is never blocked', () => {
  const ground = { ...groundFrom(['...', '...', '...']), blocked: () => true };
  const { isGoal, estimate } = reach([1, 0]);
  assert.deepEqual(routeRoad(ground, [0, 0], isGoal, estimate), [
    [0, 0],
    [1, 0],
  ]);
  const far = reach([2, 2]);
  assert.equal(routeRoad(ground, [0, 0], far.isGoal, far.estimate), null);
});

test('a turn cost keeps a road straight, and a heading counts the first bend', () => {
  const ground = groundFrom(['.....', '.....', '.....', '.....', '.....']);
  const { isGoal, estimate } = reach([4, 0]);
  /** @param {[number, number][]} path */
  const bends = (path) =>
    path.slice(2).filter(([x, y], i) => {
      const [ax, ay] = path[i];
      return x - ax !== 0 && y - ay !== 0;
    }).length;
  const straight = { ...ground, turn: 0.6 };
  const path = /** @type {[number, number][]} */ (routeRoad(straight, [0, 4], isGoal, estimate));
  assert.equal(bends(path), 1, 'one bend on the way to the far corner');
  // Heading north (index 0), the road leaves north first: its second cell is
  // straight above the start.
  const north = /** @type {[number, number][]} */ (
    routeRoad(straight, [0, 4], isGoal, estimate, 0)
  );
  assert.deepEqual(north[1], [0, 3]);
  const east = /** @type {[number, number][]} */ (routeRoad(straight, [0, 4], isGoal, estimate, 1));
  assert.deepEqual(east[1], [1, 4]);
});
