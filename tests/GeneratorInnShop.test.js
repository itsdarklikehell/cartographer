import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { doorColumn, generateBuilding } from '../src/map/GeneratorHalls.js';
import { backDepth, generateGuestFloor, stairsRow } from '../src/map/GeneratorInnShop.js';
import { generateNodeTiles } from '../src/map/MapGenerator.js';
import { FLOOR, VOID, WALL, walkDistances } from '../src/map/GeneratorInteriorMask.js';
import { isBlocked, tileKind } from '../src/map/TileKinds.js';
import { mulberry32 } from '../src/util/Rng.js';

/** @typedef {import('../src/types/map.js').Tile} Tile */

const palette = new TilePalette();
const SIZES = [8, 14, 22];
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * The open tiles that a walk from the entry, around obstacles, cannot reach.
 * @param {Tile[]} tiles @param {number} size @param {string} entry
 */
function stranded(tiles, size, entry) {
  const cells = new Array(size * size).fill(VOID);
  const blocked = new Set();
  for (const t of tiles) {
    const [x, y] = t.id.split(',').map(Number);
    cells[y * size + x] = tileKind(t) === 'wall' ? WALL : FLOOR;
    if (isBlocked(t)) blocked.add(y * size + x);
  }
  const [ex, ey] = entry.split(',').map(Number);
  const dist = walkDistances(cells, size, ex, ey, blocked);
  return tiles.filter((t) => {
    const [x, y] = t.id.split(',').map(Number);
    return !isBlocked(t) && dist[y * size + x] < 0;
  });
}

/** @param {Tile[]} tiles @param {string} kind */
const count = (tiles, kind) =>
  tiles.filter((t) => String(t.overlayRef).includes(`interior-${kind}.svg`)).length;
/** @param {Tile[]} tiles @param {string} id */
const at = (tiles, id) => /** @type {Tile} */ (tiles.find((t) => t.id === id));

test('an inn has a kitchen, a bar, tables, and stairs up, and every tile is reachable', () => {
  for (const size of SIZES) {
    for (const seed of SEEDS) {
      const inn = generateBuilding(palette, size, mulberry32(seed), 'inn');
      const why = `size ${size} seed ${seed}`;
      assert.equal(inn.entry, `${doorColumn(size)},${size - 1}`, why);
      assert.match(at(inn.tiles, inn.entry).imageRef, /door-h/, why);
      assert.deepEqual(stranded(inn.tiles, size, inn.entry), [], why);
      assert.equal(inn.stairsUp, `${size - 2},${stairsRow(size)}`, why);
      assert.match(at(inn.tiles, String(inn.stairsUp)).imageRef, /stairs-up/, why);
      assert.equal(count(inn.tiles, 'hearth'), 1, why);
      // The bar is the row of tables in front of the kitchen wall.
      const bar = inn.tiles.filter(
        (t) => t.id.endsWith(`,${backDepth(size) + 3}`) && String(t.overlayRef).includes('table'),
      );
      assert.ok(bar.length >= 1, why);
      if (size >= 14) assert.ok(count(inn.tiles, 'table') >= bar.length + 3, why);
    }
  }
});

test('a shop has a counter, a stocked storeroom, and shelves, and every tile is reachable', () => {
  for (const size of SIZES) {
    for (const seed of SEEDS) {
      const shop = generateBuilding(palette, size, mulberry32(seed), 'shop');
      const why = `size ${size} seed ${seed}`;
      assert.equal(shop.entry, `${doorColumn(size)},${size - 1}`, why);
      assert.deepEqual(stranded(shop.tiles, size, shop.entry), [], why);
      assert.equal(shop.stairsUp, null, why);
      const counter = shop.tiles.filter(
        (t) => t.id.endsWith(`,${backDepth(size) + 3}`) && String(t.overlayRef).includes('table'),
      );
      assert.equal(counter.length, size - 4, why);
      assert.ok(count(shop.tiles, 'chest') >= 1, why);
      if (size >= 14) assert.ok(count(shop.tiles, 'bookshelf') >= 4, why);
      // One wall with one door splits the storeroom from the sales floor.
      const wallRow = shop.tiles.filter((t) => t.id.endsWith(`,${backDepth(size) + 1}`));
      assert.equal(wallRow.filter((t) => /door/.test(t.imageRef)).length, 1, why);
    }
  }
});

test('an inn and a shop are the same for the same seed and differ from a house', () => {
  for (const environ of ['inn', 'shop']) {
    const a = generateBuilding(palette, 14, mulberry32(4), environ);
    const b = generateBuilding(palette, 14, mulberry32(4), environ);
    assert.deepEqual(a, b);
  }
  const inn = generateBuilding(palette, 14, mulberry32(4), 'inn').tiles.map((t) => t.imageRef);
  const shop = generateBuilding(palette, 14, mulberry32(4), 'shop').tiles.map((t) => t.imageRef);
  assert.notDeepEqual(inn, shop);
});

test('a small inn below the plan size uses the room split and has no stairs up', () => {
  const inn = generateBuilding(palette, 6, mulberry32(2), 'inn');
  assert.equal(inn.stairsUp, null);
  assert.ok(!inn.tiles.some((t) => t.imageRef.includes('stairs-up')));
});

test('the guest floor has a bed in every room, and its stairs down are the entry', () => {
  for (const size of SIZES) {
    for (const seed of SEEDS) {
      const floor = generateGuestFloor(palette, size, mulberry32(seed));
      const why = `size ${size} seed ${seed}`;
      assert.equal(floor.entry, `${size - 2},${stairsRow(size)}`, why);
      assert.match(at(floor.tiles, floor.entry).imageRef, /stairs-down/, why);
      assert.deepEqual(stranded(floor.tiles, size, floor.entry), [], why);
      const doors = floor.tiles.filter((t) => /door/.test(t.imageRef)).length;
      assert.equal(count(floor.tiles, 'bed'), doors, why);
      assert.ok(doors >= 4, why);
    }
  }
});

test('a generated inn has a forced guest floor site on its stairs up', () => {
  const rng = mulberry32(3);
  const inn = generateNodeTiles(
    palette,
    { archetype: 'building', size: 'medium', environ: 'inn' },
    rng,
  );
  const up = inn.sites.find((s) => s.archetype === 'upper-floor');
  assert.ok(up?.forced);
  assert.equal(up?.environ, 'inn');
  assert.match(at(inn.tiles, up.tileIds[0]).imageRef, /stairs-up/);
  const guest = generateNodeTiles(
    palette,
    { archetype: 'upper-floor', size: 'medium', environ: 'inn' },
    rng,
  );
  assert.equal(guest.entry, `12,${stairsRow(14)}`);
  const hall = generateNodeTiles(palette, { archetype: 'upper-floor', size: 'medium' }, rng);
  assert.equal(hall.entry, '1,1');
  const shop = generateNodeTiles(
    palette,
    { archetype: 'building', size: 'small', environ: 'shop' },
    rng,
  );
  assert.ok(!shop.sites.some((s) => s.archetype === 'upper-floor'));
});

test('an inn with a cellar keeps its trapdoor off the stairs up', () => {
  let cellars = 0;
  for (const seed of SEEDS) {
    const inn = generateBuilding(palette, 14, mulberry32(seed), 'inn');
    if (!inn.stairsDown) continue;
    cellars++;
    assert.notEqual(inn.stairsDown, inn.stairsUp);
    assert.match(String(at(inn.tiles, inn.stairsDown).overlayRef), /trapdoor/);
  }
  assert.ok(cellars > 0);
});
