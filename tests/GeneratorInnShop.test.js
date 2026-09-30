import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { doorColumn, generateBuilding } from '../src/map/GeneratorHalls.js';
import {
  backDepth,
  barColumn,
  floorPlan,
  FLOOR_PLANS,
  generateGuestFloor,
  PLAN_MIN_SIZE,
  stairsRow,
} from '../src/map/GeneratorInnShop.js';
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
      // The counter runs from the west wall: plain sections, one till in
      // the middle, and an end piece before the gap at the east end.
      const row = Array.from({ length: size - 2 }, (_, i) => {
        const ref = String(at(shop.tiles, `${i + 1},${backDepth(size) + 3}`).overlayRef);
        return ref.match(/interior-(counter[\w-]*)\.svg/)?.[1] ?? null;
      });
      const pieces = row.slice(0, size - 4);
      assert.equal(pieces.at(-1), 'counter-end-e', why);
      assert.equal(pieces.indexOf('counter-till'), ((size - 3) >> 1) - 1, why);
      assert.equal(pieces.filter((p) => p === 'counter').length, size - 6, why);
      assert.deepEqual(row.slice(size - 4), [null, null], why);
      assert.ok(count(shop.tiles, 'chest') >= 1, why);
      if (size >= 14) assert.ok(count(shop.tiles, 'shelf') >= 4, why);
      assert.equal(count(shop.tiles, 'bookshelf'), 0, why);
      // One wall with one door splits the storeroom from the sales floor.
      const wallRow = shop.tiles.filter((t) => t.id.endsWith(`,${backDepth(size) + 1}`));
      assert.equal(wallRow.filter((t) => /door/.test(t.imageRef)).length, 1, why);
    }
  }
});

test('an inn, a shop, and a tavern are the same for the same seed and differ from a house', () => {
  for (const environ of ['inn', 'shop', 'tavern']) {
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

test('a tavern has a bar along the east wall, a kitchen, a storeroom, and tables', () => {
  for (const size of SIZES) {
    for (const seed of SEEDS) {
      const tavern = generateBuilding(palette, size, mulberry32(seed), 'tavern');
      const why = `size ${size} seed ${seed}`;
      const depth = backDepth(size);
      const bx = barColumn(size);
      assert.equal(tavern.entry, `${doorColumn(size)},${size - 1}`, why);
      assert.deepEqual(stranded(tavern.tiles, size, tavern.entry), [], why);
      assert.equal(tavern.stairsUp, null, why);
      const overlay = (/** @type {number} */ x, /** @type {number} */ y) =>
        String(at(tavern.tiles, `${x},${y}`).overlayRef ?? '');
      // The bar runs from the back wall to two cells short of the south wall.
      for (let y = depth + 2; y <= size - 4; y++) assert.match(overlay(bx, y), /table/, why);
      assert.equal(overlay(bx, size - 3), '', why);
      // The strip behind the bar stays clear from the kitchen door down.
      for (let y = depth + 2; y < size - 1; y++) assert.equal(overlay(size - 2, y), '', why);
      // The back wall has one door, at its east end, into the kitchen.
      const back = tavern.tiles.filter((t) => t.id.endsWith(`,${depth + 1}`));
      const doors = back.filter((t) => /door/.test(t.imageRef)).map((t) => t.id);
      assert.deepEqual(doors, [`${size - 2},${depth + 1}`], why);
      // The storeroom opens into the kitchen through a door in the wall between them.
      const side = tavern.tiles.filter(
        (t) => /door-v/.test(t.imageRef) && t.id.endsWith(`,${depth}`),
      );
      assert.equal(side.length, 1, why);
      // One hearth in the taproom against the back wall, and one in the kitchen.
      assert.equal(count(tavern.tiles, 'hearth'), 2, why);
      assert.equal(
        tavern.tiles.filter(
          (t) => t.id.endsWith(`,${depth + 2}`) && /hearth/.test(String(t.overlayRef)),
        ).length,
        1,
        why,
      );
      assert.ok(count(tavern.tiles, 'barrel') >= 1, why);
      if (size >= 14) assert.ok(count(tavern.tiles, 'table') >= size - depth - 5 + 4, why);
    }
  }
});

test('a tavern below the plan size uses the room split', () => {
  const tavern = generateBuilding(palette, PLAN_MIN_SIZE - 2, mulberry32(2), 'tavern');
  assert.deepEqual(stranded(tavern.tiles, PLAN_MIN_SIZE - 2, tavern.entry), [], 'reachable');
  assert.equal(count(tavern.tiles, 'hearth'), 1);
});

test('floorPlan names a plan only for a planned environ of the plan size or more', () => {
  assert.equal(floorPlan(14, 'tavern'), FLOOR_PLANS.tavern);
  assert.equal(floorPlan(PLAN_MIN_SIZE, 'shop'), FLOOR_PLANS.shop);
  assert.equal(floorPlan(PLAN_MIN_SIZE - 1, 'inn'), null);
  assert.equal(floorPlan(14, 'house'), null);
  assert.equal(floorPlan(14, 'constructor'), null);
  assert.equal(floorPlan(14), null);
});
