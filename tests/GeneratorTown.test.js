import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { ARMS } from '../src/map/Autotile.js';
import { generateTown, planTown, townRiver } from '../src/map/GeneratorTown.js';
import { mulberry32 } from '../src/util/Rng.js';

const palette = new TilePalette();

/** @param {string} id */
const xy = (id) => id.split(',').map(Number);

test('a town river crosses the map, keeps off the center lines, and bends one row at a time', () => {
  const axes = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const size = 14;
    const c = 7;
    const rivers = townRiver(size, mulberry32(seed), c);
    const cells = [...rivers.arms.keys()].map(xy);
    const vertical = cells.some(([, y]) => y === 0);
    axes.add(vertical);
    const along = cells.map(([x, y]) => (vertical ? y : x));
    const across = cells.map(([x, y]) => (vertical ? x : y));
    for (let v = 0; v < size; v++) assert.ok(along.includes(v), `seed ${seed}: row ${v}`);
    for (const u of across) assert.ok(Math.abs(u - c) >= 2 && u >= 1 && u <= size - 2);
    // A row with two river cells is a bend, and the rows beside it are straight.
    const rows = new Map();
    for (const v of along) rows.set(v, (rows.get(v) ?? 0) + 1);
    for (const [v, n] of rows) {
      if (n === 2) assert.ok(rows.get(v - 1) === 1 && rows.get(v + 1) === 1, `seed ${seed}`);
    }
    for (const arms of rivers.arms.values()) assert.equal(arms.size, 2, 'no junctions');
  }
  assert.equal(axes.size, 2, 'rivers run both ways');
});

/**
 * The road cells reachable from `start` along road arms.
 * @param {import('../src/map/GeneratorTown.js').TownPlan} plan @param {string} start
 */
function roadReach(plan, start) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const [x, y] = xy(/** @type {string} */ (queue.pop()));
    for (const arm of plan.roads.at(x, y)) {
      const [, dx, dy] = /** @type {readonly [string, number, number]} */ (
        ARMS.find(([a]) => a === arm)
      );
      const id = `${x + dx},${y + dy}`;
      if (plan.roads.arms.has(id) && !seen.has(id)) {
        seen.add(id);
        queue.push(id);
      }
    }
  }
  return seen;
}

test('town streets form one network that leaves the map on several sides', () => {
  for (const [size, exits] of [
    [8, 2],
    [14, 3],
    [22, 4],
  ]) {
    for (const seed of [1, 6, 9]) {
      const plan = planTown(size, mulberry32(seed));
      const [ex, ey] = xy(plan.entry);
      assert.equal(ey, size - 1, 'the entry is on the south edge');
      assert.ok(plan.roads.at(ex, ey).has('s'), 'the entry street leaves the map');
      assert.equal(roadReach(plan, plan.entry).size, plan.roads.arms.size, 'one network');
      const sides = new Set();
      for (const id of plan.roads.arms.keys()) {
        const [x, y] = xy(id);
        const arms = plan.roads.at(x, y);
        if (y === 0 && arms.has('n')) sides.add('n');
        if (y === size - 1 && arms.has('s')) sides.add('s');
        if (x === 0 && arms.has('w')) sides.add('w');
        if (x === size - 1 && arms.has('e')) sides.add('e');
      }
      assert.equal(sides.size, exits, `size ${size} seed ${seed}: ways out`);
    }
  }
});

test('town buildings take free blocks beside streets, core set first', () => {
  let graveyards = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const size = 22;
    const plan = planTown(size, mulberry32(seed));
    const arts = plan.buildings.map((b) => b.art);
    for (const art of ['inn', 'tavern', 'blacksmith', 'general-store', 'temple']) {
      assert.ok(arts.slice(0, 5).includes(art), `seed ${seed}: ${art} comes first`);
    }
    assert.ok(arts.includes('settlement'), 'homes fill a large town');
    assert.ok(arts.includes('farm'), 'farms on the outskirts');
    if (arts.includes('graveyard')) graveyards++;
    const covered = new Set();
    for (const { id, poi, art } of plan.buildings) {
      assert.equal(poi, art === 'graveyard' ? 'landmark' : 'settlement');
      const [x, y] = xy(id);
      const block = [
        [x, y],
        [x + 1, y],
        [x, y + 1],
        [x + 1, y + 1],
      ];
      for (const [bx, by] of block) {
        assert.ok(!plan.roads.has(bx, by) && !plan.rivers.has(bx, by), `seed ${seed}: ${id}`);
        assert.ok(!covered.has(`${bx},${by}`), `seed ${seed}: blocks overlap at ${id}`);
        assert.equal(plan.cells[by * size + bx], 'grass', 'a block keeps its grass');
        covered.add(`${bx},${by}`);
      }
      const beside = block.some(([bx, by]) =>
        ARMS.some(([, dx, dy]) => plan.roads.has(bx + dx, by + dy)),
      );
      assert.ok(beside, `seed ${seed}: ${id} is beside a street`);
    }
  }
  assert.ok(graveyards > 0 && graveyards < 10, `some towns have a graveyard: ${graveyards}`);
});

test('town fields lie outside the core only', () => {
  const size = 32;
  const c = 16;
  const core = Math.round(size * 0.3);
  const plan = planTown(size, mulberry32(4));
  const fields = plan.cells.flatMap((t, i) => (t === 'farmland' ? [i] : []));
  assert.ok(fields.length > 20, `fields: ${fields.length}`);
  for (const i of fields) {
    const d = Math.max(Math.abs((i % size) - c), Math.abs(Math.floor(i / size) - c));
    assert.ok(d > core + 1, `field at ${i}`);
    assert.ok(!plan.roads.has(i % size, Math.floor(i / size)));
  }
  const small = planTown(8, mulberry32(4));
  assert.equal(small.buildings.length, 3, 'a small town has three buildings');
  assert.ok(!small.cells.includes('farmland'), 'and no room for fields');
});

test('a generated town draws bridges, scaled buildings, and fields', () => {
  const size = 22;
  const gen = generateTown(palette, size, mulberry32(9));
  const bridges = gen.tiles.filter((t) => String(t.overlayRef).includes('bridge'));
  assert.ok(bridges.length >= 1, 'a street crosses the river on a bridge');
  const inn = /** @type {{ imageRef: string }} */ (palette.get('inn')).imageRef;
  const innTile = gen.tiles.find((t) => t.imageRef === inn);
  assert.equal(innTile?.span, 2);
  assert.equal(innTile?.overlayRef ?? null, null);
  assert.equal(innTile?.metadata.poiType, 'settlement');
  assert.ok(gen.tiles.some((t) => t.imageRef.includes('farmland')));
  assert.equal(gen.tiles.length, size * size);
});
