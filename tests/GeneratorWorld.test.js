import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { generateWorld, partitionLand, regionFor } from '../src/map/GeneratorWorld.js';
import { NEIGHBORS4 } from '../src/map/MapGeometry.js';
import { mulberry32 } from '../src/util/Rng.js';

const palette = new TilePalette();

test('the terrain of a block picks its region archetype', () => {
  const block = (/** @type {Record<string, number>} */ counts) =>
    Object.entries(counts).flatMap(([type, n]) => new Array(n).fill(type));
  assert.deepEqual(regionFor(block({ mountain: 2, hills: 2, grass: 6 })), {
    archetype: 'highlands',
    environ: 'mountain',
  });
  assert.equal(regionFor(block({ snow: 4, grass: 6 })).archetype, 'frontier');
  assert.equal(regionFor(block({ desert: 4, grass: 6 })).archetype, 'desert');
  assert.equal(regionFor(block({ swamp: 3, grass: 7 })).archetype, 'wetlands');
  assert.deepEqual(regionFor(block({ forest: 4, grass: 6 })), {
    archetype: 'wilderness',
    environ: 'forest',
  });
  assert.equal(regionFor(block({ grass: 10 })).environ, 'grassland');
});

/**
 * @param {Int32Array} region @param {number} size @param {number} r
 * @returns {boolean} whether every cell of region `r` joins the others
 */
function connected(region, size, r) {
  const cells = [];
  for (let i = 0; i < region.length; i++) if (region[i] === r) cells.push(i);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = /** @type {number} */ (stack.pop());
    for (const [dx, dy] of NEIGHBORS4) {
      const x = (i % size) + dx;
      const y = Math.floor(i / size) + dy;
      const n = y * size + x;
      if (x < 0 || y < 0 || x >= size || y >= size || seen.has(n) || region[n] !== r) continue;
      seen.add(n);
      stack.push(n);
    }
  }
  return seen.size === cells.length;
}

test('land splits into connected regions, and water stays out', () => {
  const size = 20;
  const cells = new Array(size * size).fill('grass');
  for (let x = 0; x < size; x++) cells[x] = 'water';
  const region = partitionLand(cells, size, mulberry32(1));
  const count = Math.round((size * size - size) / 80);
  assert.equal(new Set(region).size, count + 1, 'the regions and the water');
  for (let x = 0; x < size; x++) assert.equal(region[x], -1);
  for (let r = 0; r < count; r++) assert.ok(connected(region, size, r), `region ${r}`);
});

test('a map with no land has no regions', () => {
  const region = partitionLand(new Array(16).fill('water'), 4, mulberry32(1));
  assert.ok(region.every((r) => r === -1));
});

test('a large island gets its own region and a small one stays out', () => {
  const size = 20;
  const cells = new Array(size * size).fill('water');
  const land = (/** @type {number} */ x0, /** @type {number} */ x1, /** @type {number} */ y1) => {
    for (let y = 0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y * size + x] = 'grass';
  };
  land(0, 9, 19);
  land(12, 15, 3);
  land(18, 19, 1);
  const region = partitionLand(cells, size, mulberry32(2));
  const big = region[0];
  assert.ok(big >= 0);
  const island = region[12];
  assert.ok(island >= 0 && island !== big, 'the island of 16 cells has a region');
  assert.equal(region[18], -1, 'the island of 4 cells has none');
  assert.equal(new Set(region).size, 5, 'three regions on the big land, one island, and none');
});

test('the regions stop at the most that one world gets', () => {
  const size = 40;
  const cells = new Array(size * size).fill('water');
  for (let y = 0; y < size; y += 5) {
    for (let x = 0; x < size; x += 5) {
      for (let dy = 0; dy < 4; dy++)
        for (let dx = 0; dx < 4; dx++) cells[(y + dy) * size + x + dx] = 'grass';
    }
  }
  const region = partitionLand(cells, size, mulberry32(3));
  assert.equal(Math.max(...region), 8);
  assert.ok(
    region.some((r, i) => r === -1 && cells[i] === 'grass'),
    'some islands get no region',
  );
});

test('a world links each region block to one large region map', () => {
  for (const seed of [1, 2, 3]) {
    const size = 22;
    const world = generateWorld(palette, size, mulberry32(seed));
    assert.equal(world.tiles.length, size * size);
    assert.ok(world.sites.length >= 2, `seed ${seed}: regions`);
    const ids = world.sites.flatMap((s) => s.tileIds);
    assert.equal(new Set(ids).size, ids.length, 'no tile is in two regions');
    for (const site of world.sites) {
      assert.equal(site.kind, 'region');
      assert.equal(site.size, 'large');
    }
    const entry = world.tiles.find((t) => t.id === world.entry);
    assert.ok(entry && !/water/.test(entry.imageRef), `seed ${seed}: the entry is land`);
  }
});
