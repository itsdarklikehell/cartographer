import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARMS, ArmNetwork, coastOverlays } from '../src/map/Autotile.js';
import {
  dockCount,
  dockSpots,
  pierReach,
  planDocks,
  stepsTo,
} from '../src/map/GeneratorTownDocks.js';
import { generateTown, planTown } from '../src/map/GeneratorTown.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { mulberry32 } from '../src/util/Rng.js';

/** @typedef {import('../src/map/GeneratorRoads.js').RoadGround} RoadGround */

/** @param {string} id */
const xy = (id) => id.split(',').map(Number);

/**
 * A square map with the sea on its north `depth` rows and grass below, plus
 * an east-west street on each row of `streets`.
 * @param {number} size @param {number} depth @param {number[]} streets
 * @returns {RoadGround}
 */
function northShore(size, depth, streets) {
  const cells = Array.from({ length: size * size }, (_, i) =>
    Math.floor(i / size) < depth ? 'water' : 'grass',
  );
  const roads = new ArmNetwork();
  for (const y of streets) for (let x = 0; x < size - 1; x++) roads.join(x, y, 'e');
  return { size, cells, rivers: new ArmNetwork(), roads, turn: 0.6 };
}

/**
 * Whether the road network links two cells, following the arms.
 * @param {ArmNetwork} roads @param {string} from @param {string} to
 */
function linked(roads, from, to) {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const id = /** @type {string} */ (queue.pop());
    if (id === to) return true;
    const [x, y] = xy(id);
    for (const [arm, dx, dy] of ARMS) {
      const next = `${x + dx},${y + dy}`;
      if (roads.at(x, y).has(arm) && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

test('pierReach and dockCount grow with the map', () => {
  assert.deepEqual([8, 14, 22, 32, 48, 64].map(pierReach), [1, 1, 2, 3, 4, 4]);
  assert.deepEqual([8, 14, 21, 22, 48].map(dockCount), [1, 1, 1, 2, 2]);
});

test('stepsTo counts the steps to the nearest goal cell', () => {
  const steps = stepsTo(4, (x, y) => x === 0 && y === 0);
  assert.deepEqual([steps[0], steps[1], steps[5], steps[15]], [0, 1, 2, 6]);
  assert.ok(stepsTo(3, () => false).every((n) => n === -1));
});

test('dockSpots takes straight open shore with water around the pier', () => {
  const ground = northShore(22, 3, []);
  const at = (/** @type {number} */ x, /** @type {number} */ y) => y * 22 + x;
  // A river mouth at x 5 keeps a quay off x 4 to 6.
  ground.rivers.join(5, 3, 's');
  // A street on the shore at x 8 keeps a quay off x 7 to 9.
  ground.roads.add(8, 3, 'e');
  // A wall behind x 10, and a mountain behind x 13.
  const walls = new Map([['10,4', 'wall-h']]);
  ground.cells[at(13, 4)] = 'mountain';
  // A rock beside the pier cells of x 14 and 16 turns x 15 into a bay.
  ground.cells[at(15, 2)] = 'grass';
  // A rock further out cuts the piers of x 18 to 20 to one cell.
  ground.cells[at(19, 1)] = 'grass';
  const spots = dockSpots(ground, 'n', walls);
  assert.deepEqual(
    spots.map((s) => s.quay[0]),
    [1, 2, 3, 11, 12, 17, 18, 19, 20],
  );
  const byX = new Map(spots.map((s) => [s.quay[0], s]));
  assert.deepEqual(byX.get(17), {
    quay: [17, 3],
    behind: [17, 4],
    pier: [
      [17, 2],
      [17, 1],
    ],
  });
  for (const x of [18, 19, 20]) assert.equal(byX.get(x)?.pier.length, 1, `x ${x}`);
});

test('a pier reaches the border when the sea is one cell deep', () => {
  const spots = dockSpots(northShore(14, 1, []), 'n', new Map());
  assert.equal(spots.length, 12);
  assert.ok(spots.every((s) => s.pier.length === 1 && s.pier[0][1] === 0));
  // A pier stops one cell short of the open sea when the water allows it.
  assert.ok(dockSpots(northShore(22, 2, []), 'n', new Map()).every((s) => s.pier.length === 1));
});

test('dockSpots turns with the side of the sea', () => {
  const size = 22;
  const cells = Array.from({ length: size * size }, (_, i) =>
    i % size >= size - 4 ? 'water' : 'grass',
  );
  const ground = { size, cells, rivers: new ArmNetwork(), roads: new ArmNetwork() };
  const spots = dockSpots(ground, 'e', new Map());
  assert.equal(spots.length, size - 2);
  assert.deepEqual(spots[0], {
    quay: [17, 1],
    behind: [16, 1],
    pier: [
      [18, 1],
      [19, 1],
    ],
  });
  assert.deepEqual(dockSpots(ground, 'n', new Map()), [], 'no shore faces north');
});

test('planDocks lays a street from each quay to the town streets', () => {
  const ground = northShore(22, 3, [8]);
  const docks = planDocks(ground, 'n', mulberry32(1));
  assert.equal(docks.length, 2);
  const [a, b] = docks.map((d) => xy(d.quay));
  assert.ok(Math.abs(a[0] - b[0]) >= 4, `${a} ${b}`);
  for (const { side, quay, pier } of docks) {
    const [x, y] = xy(quay);
    assert.equal(side, 'n');
    assert.equal(y, 3);
    assert.deepEqual(pier, [`${x},2`, `${x},1`]);
    assert.deepEqual([...ground.roads.at(x, y)], ['s'], 'the quay opens to the land only');
    for (let sy = 4; sy < 8; sy++) assert.ok(ground.roads.has(x, sy), `${x},${sy}`);
    assert.ok(linked(ground.roads, quay, '0,8'));
  }
});

test('a quay beside a street joins it in one step', () => {
  const ground = northShore(14, 3, [4]);
  const [dock] = planDocks(ground, 'n', mulberry32(2));
  const [x] = xy(dock.quay);
  assert.ok(ground.roads.at(x, 4).has('n'));
  assert.deepEqual([...ground.roads.at(x, 3)], ['s']);
});

test('a dock street keeps off the wall and joins no gate from the side', () => {
  const size = 22;
  const ground = northShore(size, 3, [8]);
  for (let y = 4; y < 8; y++) ground.roads.join(11, y, 's');
  const walls = new Map();
  for (let x = 0; x < size; x++) walls.set(`${x},6`, x === 11 ? 'gate-h' : 'wall-h');
  const docks = planDocks(ground, 'n', mulberry32(4), walls);
  assert.equal(docks.length, 2);
  for (const id of walls.keys()) {
    const [x, y] = xy(id);
    if (x !== 11) assert.ok(!ground.roads.has(x, y), `street on the wall at ${id}`);
  }
  assert.deepEqual([...ground.roads.at(11, 6)].sort(), ['n', 's']);
  for (const { quay } of docks) assert.ok(linked(ground.roads, quay, '11,8'));
});

test('a port with no street in reach of its shore gets no pier', () => {
  const ground = northShore(14, 3, [10]);
  for (let x = 0; x < 14; x++) ground.cells[6 * 14 + x] = 'mountain';
  assert.deepEqual(planDocks(ground, 'n', mulberry32(1)), []);
  const inland = northShore(14, 0, [10]);
  assert.deepEqual(planDocks(inland, 'n', mulberry32(1)), []);
});

test('every generated port links its piers to the entry street', () => {
  let piers = 0;
  let ports = 0;
  for (const [size, seeds] of [
    [8, 40],
    [14, 40],
    [22, 30],
    [32, 15],
  ]) {
    for (let seed = 1; seed <= seeds; seed++) {
      const at = `size ${size} seed ${seed}`;
      const plan = planTown(size, mulberry32(seed), 'coast');
      const coast = coastOverlays(plan.cells, size, size);
      ports++;
      assert.ok(plan.docks.length <= dockCount(size), at);
      for (const { side, quay, pier } of plan.docks) {
        piers++;
        const [qx, qy] = xy(quay);
        assert.equal(side, plan.sea, at);
        assert.equal(coast.get(quay), side, `${at}: quay ${quay} off a straight shore`);
        assert.ok(linked(plan.roads, plan.entry, quay), `${at}: quay ${quay} cut off`);
        const [, dx, dy] = /** @type {readonly [string, number, number]} */ (
          ARMS.find(([arm]) => arm === side)
        );
        pier.forEach((id, k) => {
          assert.equal(id, `${qx + dx * (k + 1)},${qy + dy * (k + 1)}`, at);
          const [px, py] = xy(id);
          assert.equal(plan.cells[py * size + px], 'water', `${at}: pier ${id} on land`);
        });
      }
      for (const [id, piece] of plan.walls) {
        const [x, y] = xy(id);
        if (plan.roads.has(x, y)) {
          assert.ok(piece.startsWith('gate'), `${at}: street under ${piece}`);
          assert.equal(plan.roads.at(x, y).size, 2, `${at}: gate ${id}`);
        }
      }
    }
  }
  assert.ok(piers > ports, `piers ${piers} in ${ports} ports`);
});

test('generateTown draws each quay over its coast piece and each pier on the water', () => {
  const palette = new TilePalette();
  const plan = planTown(22, mulberry32(3), 'coast');
  const { tiles } = generateTown(palette, 22, mulberry32(3), 'coast');
  const byId = new Map(tiles.map((t) => [t.id, t]));
  assert.ok(plan.docks.length > 0);
  for (const { side, quay, pier } of plan.docks) {
    assert.deepEqual(byId.get(quay)?.overlayRef, [
      `assets/tiles/coast/coast-${side}.svg`,
      `assets/tiles/dock/dock-quay-${side}.svg`,
    ]);
    const run = side === 'n' ? 'pier-v' : 'pier-h';
    pier.forEach((id, k) => {
      const tile = byId.get(id);
      assert.ok(tile?.imageRef.includes('/water/'), id);
      const kind = k === pier.length - 1 ? `pier-head-${side}` : run;
      assert.equal(tile?.overlayRef, `assets/tiles/dock/dock-${kind}.svg`, id);
    });
  }
});
