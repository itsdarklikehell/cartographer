import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TilePalette } from '../src/map/TilePalette.js';
import { ARMS, smoothCoastline } from '../src/map/Autotile.js';
import { SEA_SIDES, generateTown, planTown, townRiver, townSea } from '../src/map/GeneratorTown.js';
import { generateNodeTiles } from '../src/map/MapGenerator.js';
import { mulberry32 } from '../src/util/Rng.js';

/** @typedef {import('../src/map/GeneratorTown.js').TownPlan} TownPlan */

const palette = new TilePalette();

/** @param {string} id */
const xy = (id) => id.split(',').map(Number);

/**
 * The cells of the border on one side, as `[x, y]` pairs.
 * @param {number} size @param {string} side
 * @returns {[number, number][]}
 */
function border(size, side) {
  return Array.from({ length: size }, (_, i) =>
    side === 'n' ? [i, 0] : side === 's' ? [i, size - 1] : side === 'w' ? [0, i] : [size - 1, i],
  );
}

/**
 * Whether a cell of the plan is sea, or land beside the sea.
 * @param {TownPlan} plan @param {number} x @param {number} y
 */
function nearSea(plan, x, y) {
  const { size, cells } = plan;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const [nx, ny] = [x + dx, y + dy];
      const inside = nx >= 0 && ny >= 0 && nx < size && ny < size;
      if (inside && cells[ny * size + nx] === 'water') return true;
    }
  }
  return false;
}

/**
 * The cells that the party can walk to from the entry: land with no wall
 * piece on it, and a river cell only where a street crosses it on a bridge.
 * @param {TownPlan} plan
 * @returns {Set<string>}
 */
function walkFromEntry(plan) {
  const { size, cells, rivers, roads, walls } = plan;
  /** @param {number} x @param {number} y */
  const walkable = (x, y) =>
    x >= 0 &&
    y >= 0 &&
    x < size &&
    y < size &&
    cells[y * size + x] !== 'water' &&
    !String(walls.get(`${x},${y}`)).startsWith('wall') &&
    (!rivers.has(x, y) || roads.has(x, y));
  const seen = new Set([plan.entry]);
  const queue = [plan.entry];
  while (queue.length) {
    const [x, y] = xy(/** @type {string} */ (queue.pop()));
    for (const [, dx, dy] of ARMS) {
      const id = `${x + dx},${y + dy}`;
      if (walkable(x + dx, y + dy) && !seen.has(id)) {
        seen.add(id);
        queue.push(id);
      }
    }
  }
  return seen;
}

test('townSea puts water along one border other than the south', () => {
  const sides = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    for (const size of [8, 22, 48]) {
      const { side, cells } = townSea(size, mulberry32(seed));
      sides.add(side);
      assert.ok(SEA_SIDES.includes(side), `seed ${seed}: ${side}`);
      for (const [x, y] of border(size, side)) {
        assert.equal(cells[y * size + x], 'water', `seed ${seed} size ${size}: ${x},${y}`);
      }
      assert.deepEqual(smoothCoastline(cells, size, size), cells, 'the coast pieces fit');
      const c = Math.floor(size / 2);
      const reach = Math.max(1, Math.round(size * 0.08)) + Math.round(size * 0.06);
      cells.forEach((type, i) => {
        if (type !== 'water') return;
        const [x, y] = [i % size, Math.floor(i / size)];
        const depth = side === 'n' ? y : side === 'w' ? x : size - 1 - x;
        assert.ok(depth < reach, `seed ${seed} size ${size}: water ${depth} cells in`);
        assert.ok(Math.max(Math.abs(x - c), Math.abs(y - c)) > 2, 'clear of the center');
      });
    }
  }
  assert.equal(sides.size, 3, 'every sea side appears');
});

test('townRiver takes the axis that a port asks for', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const down = townRiver(14, mulberry32(seed), 7, 0, 'v');
    assert.ok(
      [...down.arms.keys()].some((id) => xy(id)[1] === 0),
      'north to south',
    );
    const across = townRiver(14, mulberry32(seed), 7, 0, 'h');
    assert.ok(
      [...across.arms.keys()].some((id) => xy(id)[0] === 0),
      'west to east',
    );
  }
});

test('a port has its sea on its side, a land entry, and every building in reach', () => {
  let walled = 0;
  let rivers = 0;
  for (const [size, seeds] of [
    [8, 100],
    [14, 40],
    [22, 40],
    [32, 20],
  ]) {
    for (let seed = 1; seed <= seeds; seed++) {
      const plan = planTown(size, mulberry32(seed), 'coast');
      const at = `size ${size} seed ${seed}`;
      const sea = /** @type {string} */ (plan.sea);
      assert.ok(SEA_SIDES.includes(sea), at);
      for (const [x, y] of border(size, sea)) assert.equal(plan.cells[y * size + x], 'water', at);
      // The entry street leaves by the south border, on land, and joins every street.
      const [ex, ey] = xy(plan.entry);
      assert.equal(ey, size - 1, at);
      assert.notEqual(plan.cells[ey * size + ex], 'water', at);
      assert.ok(plan.roads.at(ex, ey).has('s'), at);
      for (const id of plan.roads.arms.keys()) {
        const [x, y] = xy(id);
        assert.notEqual(plan.cells[y * size + x], 'water', `${at}: street on the sea at ${id}`);
        const out = /** @type {Record<string, boolean>} */ ({
          n: y === 0,
          s: y === size - 1,
          w: x === 0,
          e: x === size - 1,
        });
        assert.ok(!(out[sea] && plan.roads.at(x, y).has(/** @type {any} */ (sea))), at);
      }
      for (const id of plan.walls.keys()) assert.ok(!nearSea(plan, ...xy(id)), `${at}: wall`);
      if (plan.walls.size) walled++;
      // The river runs into the sea, and no channel lies under the water.
      for (const id of plan.rivers.arms.keys()) {
        const [x, y] = xy(id);
        assert.notEqual(plan.cells[y * size + x], 'water', `${at}: river on the sea`);
      }
      const mouth = [...plan.rivers.arms].some(([id, arms]) => {
        const [x, y] = xy(id);
        return ARMS.some(
          ([arm, dx, dy]) => arms.has(arm) && plan.cells[(y + dy) * size + x + dx] === 'water',
        );
      });
      if (plan.rivers.arms.size) {
        rivers++;
        assert.ok(mouth, `${at}: the river meets the sea`);
      }
      assert.ok(size >= 14 || !plan.rivers.arms.size, `${at}: a small port has no river`);
      // Each building stands on dry land clear of the shore, and the party can walk to it.
      const reach = walkFromEntry(plan);
      for (const { id } of plan.buildings) {
        const [x, y] = xy(id);
        for (const [bx, by] of [
          [x, y],
          [x + 1, y],
          [x, y + 1],
          [x + 1, y + 1],
        ]) {
          assert.ok(!nearSea(plan, bx, by), `${at}: building ${id} on the shore`);
          assert.ok(reach.has(`${bx},${by}`), `${at}: building ${id} out of reach`);
        }
      }
      // The main set from buildingList has one building per thirty cells, and at least three.
      const wanted = Math.max(3, Math.round((size * size) / 30));
      const main = plan.buildings.filter(
        (b) => !['farm', 'windmill', 'watermill', 'graveyard'].includes(b.art),
      );
      assert.equal(main.length, wanted, `${at}: ${main.length} buildings`);
    }
  }
  assert.ok(rivers > 50, `ports with a river: ${rivers}`);
  assert.ok(walled >= 20 && walled <= 40, `large ports walled: ${walled} of 60`);
});

test('a generated port draws its sea as water tiles with a shoreline', () => {
  const gen = generateTown(palette, 22, mulberry32(3), 'coast');
  const water = gen.tiles.filter((t) => t.imageRef.includes('/water/'));
  assert.ok(water.length >= 22, `water tiles: ${water.length}`);
  assert.ok(
    water.every((t) => !t.overlayRef || String(t.overlayRef).includes('/dock/dock-pier-')),
    'no street or river on the sea, only a pier',
  );
  const shore = gen.tiles.filter((t) =>
    [t.overlayRef ?? []].flat().some((r) => r.includes('/coast/')),
  );
  assert.ok(shore.length >= 20, `shore tiles: ${shore.length}`);
  const node = generateNodeTiles(
    palette,
    { archetype: 'town', size: 'large', environ: 'coast' },
    mulberry32(3),
  );
  assert.deepEqual(node.tiles, gen.tiles, 'generateNodeTiles passes the environ on');
});

test('a town with no coast environ generates as it does inland', () => {
  // SHA-256 prefixes of 20 seeded inland town maps per size. A change to
  // the port code that moves an inland town by one tile fails here.
  const expected = {
    small: 'f875fa4d1b9058a9',
    medium: 'a8394671e55ff468',
    large: 'c701959f8ec766a4',
    huge: '6f39f259ada82ecd',
    vast: '5f29ee13ab1ec09d',
  };
  for (const [size, digest] of Object.entries(expected)) {
    for (const environ of [undefined, 'grassland', 'town']) {
      const hash = createHash('sha256');
      for (let seed = 1; seed <= 20; seed++) {
        const gen = generateNodeTiles(
          palette,
          { archetype: 'town', size, environ },
          mulberry32(seed),
        );
        hash.update(JSON.stringify(gen));
      }
      assert.equal(hash.digest('hex').slice(0, 16), digest, `${size} ${environ}`);
    }
  }
});
