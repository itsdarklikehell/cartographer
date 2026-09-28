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
  const homes = new Set();
  for (let seed = 1; seed <= 10; seed++) {
    const size = 22;
    const plan = planTown(size, mulberry32(seed));
    const arts = plan.buildings.map((b) => b.art);
    for (const art of ['inn', 'tavern', 'blacksmith', 'general-store', 'temple']) {
      assert.ok(arts.slice(0, 5).includes(art), `seed ${seed}: ${art} comes first`);
    }
    for (const art of ['market', 'town-hall'])
      assert.ok(arts.includes(art), `seed ${seed}: ${art}`);
    assert.ok(arts.includes('well') !== arts.includes('fountain'), 'a well or a fountain');
    assert.ok(arts.includes('house') || arts.includes('cottage'), 'homes fill a large town');
    for (const art of arts) if (art === 'house' || art === 'cottage') homes.add(art);
    assert.ok(!arts.includes('settlement'));
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
        ARMS.some(
          ([, dx, dy]) =>
            plan.roads.has(bx + dx, by + dy) || plan.cells[(by + dy) * size + bx + dx] === 'plaza',
        ),
      );
      assert.ok(beside, `seed ${seed}: ${id} is beside a street`);
    }
  }
  assert.ok(graveyards > 0 && graveyards < 10, `some towns have a graveyard: ${graveyards}`);
  assert.equal(homes.size, 2, 'houses near the crossroads and cottages at the edge');
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

test('a town paves its plaza and puts mills by the river and among the fields', () => {
  let watermills = 0;
  let windmills = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const size = 22;
    const plan = planTown(size, mulberry32(seed));
    const plaza = plan.cells.flatMap((t, i) =>
      t === 'plaza' ? [[i % size, (i - (i % size)) / size]] : [],
    );
    assert.equal(plaza.length, 9, `seed ${seed}: a 3x3 plaza`);
    for (const [x, y] of plaza) assert.ok(Math.abs(x - 11) <= 1 && Math.abs(y - 11) <= 1);
    for (const { id, art } of plan.buildings) {
      const [x, y] = xy(id);
      const ring = [];
      for (let yy = y - 1; yy <= y + 2; yy++) {
        for (let xx = x - 1; xx <= x + 2; xx++) {
          if (xx < x || xx > x + 1 || yy < y || yy > y + 1) ring.push([xx, yy]);
        }
      }
      if (art === 'watermill') {
        watermills++;
        assert.ok(
          ring.some(([rx, ry]) => plan.rivers.has(rx, ry)),
          `seed ${seed}: by the river`,
        );
      }
      if (art === 'windmill') {
        windmills++;
        const fields = ring.filter(([rx, ry]) => plan.cells[ry * size + rx] === 'farmland');
        assert.ok(fields.length >= 4, `seed ${seed}: ${fields.length} fields round the windmill`);
      }
    }
  }
  assert.ok(watermills > 0 && watermills < 12, `watermills: ${watermills}`);
  assert.ok(windmills > 6, `windmills: ${windmills}`);
  const city = planTown(32, mulberry32(1));
  assert.equal(city.cells.filter((t) => t === 'plaza').length, 25, 'a 5x5 plaza');
  const hamlet = planTown(8, mulberry32(1));
  assert.ok(!hamlet.buildings.some((b) => b.art.endsWith('mill')), 'no mills in a small town');
});

test('a walled town draws its wall, corner towers, gates, and water gates', () => {
  const gen = generateTown(palette, 22, mulberry32(9));
  const refs = gen.tiles.flatMap((t) => [t.overlayRef ?? []].flat());
  const count = (/** @type {string} */ name) =>
    refs.filter((r) => r.endsWith(`/${name}.svg`)).length;
  for (const corner of ['ne', 'nw', 'se', 'sw'])
    assert.equal(count(`town-wall-corner-${corner}`), 1);
  assert.ok(count('town-gate-h') + count('town-gate-v') >= 2, 'the streets pass through gates');
  assert.ok(count('town-wall-h') > 10 && count('town-wall-v') > 10);
  assert.ok(
    count('town-water-gate-h') + count('town-water-gate-v') >= 2,
    'the river passes through water gates',
  );
  const plaza = gen.tiles.filter((t) => t.imageRef.includes('/plaza/'));
  assert.equal(plaza.length, 9);
  assert.ok(
    plaza.every((t) => !t.overlayRef),
    'the streets open onto the plaza',
  );
  const open = generateTown(palette, 22, mulberry32(1));
  assert.ok(!open.tiles.some((t) => String(t.overlayRef).includes('town-')), 'seed 1 has no wall');
});

test('each building with an inside is a site over its four cells', () => {
  for (const seed of [1, 2, 3]) {
    const size = 22;
    const town = generateTown(palette, size, mulberry32(seed));
    const plan = planTown(size, mulberry32(seed));
    const open = ['well', 'fountain', 'market', 'graveyard'];
    const inside = plan.buildings.filter((b) => !open.includes(b.art));
    assert.equal(town.sites.length, inside.length, `seed ${seed}`);
    town.sites.forEach((site, i) => {
      const [x, y] = inside[i].id.split(',').map(Number);
      assert.deepEqual(site.tileIds, [
        `${x},${y}`,
        `${x + 1},${y}`,
        `${x},${y + 1}`,
        `${x + 1},${y + 1}`,
      ]);
      assert.equal(site.archetype, 'building');
      assert.equal(site.label, inside[i].art);
      assert.ok(!open.includes(site.label));
    });
  }
});
