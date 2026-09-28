import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { createTile } from '../src/map/TileGrid.js';
import {
  dress,
  furnishCave,
  furnishDungeon,
  furnisher,
  furnishHalls,
} from '../src/map/GeneratorFurnish.js';
import {
  DOOR_H,
  DOOR_V,
  FLOOR,
  VOID,
  WALL,
  walkDistances,
} from '../src/map/GeneratorInteriorMask.js';
import { generateDungeon } from '../src/map/GeneratorInteriors.js';
import { generateCave } from '../src/map/GeneratorCave.js';
import { generateBuilding, generateCastle } from '../src/map/GeneratorHalls.js';
import { isBlocked, tileKind } from '../src/map/TileKinds.js';
import { mulberry32 } from '../src/util/Rng.js';

const palette = new TilePalette();

/**
 * A mask from rows of single-char codes: `.` floor, `#` wall, `-` and `|`
 * doors, anything else void.
 * @param {string[]} rows
 */
function maskFrom(rows) {
  const code = { '.': FLOOR, '#': WALL, '-': DOOR_H, '|': DOOR_V };
  return rows
    .join('')
    .split('')
    .map((c) => code[/** @type {'.'} */ (c)] ?? VOID);
}

/**
 * A recorder in place of a furnisher, which accepts every cell.
 * @returns {{ place: (x: number, y: number, kind: string) => boolean, log: string[] }}
 */
function recorder() {
  /** @type {string[]} */
  const log = [];
  return { place: (x, y, kind) => log.push(`${kind}@${x},${y}`) > 0, log };
}

/**
 * An RNG that returns the given values in turn, then 0.99.
 * @param {number[]} values
 */
const script = (values) => () => values.shift() ?? 0.99;

test('a furnisher puts a furnishing only on a free floor cell', () => {
  const cells = maskFrom(['#####', '#...#', '#...#', '##-##']);
  const { place, placed } = furnisher(cells, 5, [2, 3], new Set([6]));
  assert.equal(place(0, 0, 'chest'), false, 'a wall takes nothing');
  assert.equal(place(9, 1, 'chest'), false, 'a cell off the map takes nothing');
  assert.equal(place(-1, 1, 'chest'), false);
  assert.equal(place(1, 1, 'chest'), false, 'a reserved cell takes nothing');
  assert.equal(place(3, 1, 'chest'), true);
  assert.equal(place(3, 1, 'rubble'), false, 'one furnishing per cell');
  assert.deepEqual([...placed], [[8, 'chest']]);
});

test('a furnisher keeps obstacles off doorways and stairs and never cuts a floor off', () => {
  const cells = maskFrom(['#######', '#.....#', '#.#####', '#.#...#', '#.....#', '###-###']);
  const { place } = furnisher(cells, 7, [3, 5], new Set([8]));
  assert.equal(place(3, 4, 'table'), false, 'beside the door');
  assert.equal(place(2, 1, 'pillar'), false, 'beside the stairs on 1,1');
  assert.equal(place(1, 2, 'bed'), false, 'the only way to the north corridor');
  assert.equal(place(1, 2, 'rubble'), true, 'a plain furnishing never blocks');
  assert.equal(place(5, 3, 'bookshelf'), true, 'a dead-end corner is free to block');
  assert.equal(place(4, 3, 'bookshelf'), true);
  assert.equal(place(5, 4, 'pillar'), true);
  assert.equal(place(2, 4, 'pillar'), false, 'the only way west');
});

test('dress draws the furnishings as overlays and skips a cell with no tile', () => {
  const tiles = [createTile('1,0', 'floor.svg')];
  dress(
    tiles,
    palette,
    4,
    new Map([
      [1, 'barrel'],
      [2, 'chest'],
    ]),
  );
  assert.equal(tiles[0].overlayRef, 'assets/tiles/interior/interior-barrel.svg');
  assert.equal(tiles.length, 1);
});

test('a castle hall gets a throne and pillars, and every role furnishes its room', () => {
  const hall = { x0: 1, y0: 1, x1: 9, y1: 8 };
  const room = (/** @type {number} */ x0, /** @type {number} */ w) => ({
    x0,
    y0: 10,
    x1: x0 + w - 1,
    y1: 12,
  });
  const rooms = [room(1, 4), room(6, 5), room(12, 2), room(15, 3), room(19, 3), room(23, 3), hall];
  // One roll per room picks its role in order, and the storeroom rolls for
  // its four corners and its chest.
  const rolls = [0.05, 0.25, 0.4, 0.55, 0.5, 0.9, 0.5, 0.9, 0.1, 0.7, 0.95];
  const { place, log } = recorder();
  furnishHalls(place, script(rolls), rooms, { castle: true, entrance: [5, 13] });
  assert.deepEqual(log.slice(0, 2), ['bed@1,10', 'bed@3,10']);
  assert.deepEqual(log.slice(2, 5), ['table@8,11', 'table@7,11', 'table@9,11']);
  assert.deepEqual(log.slice(5, 7), ['bookshelf@12,10', 'bookshelf@13,10']);
  assert.deepEqual(log.slice(7, 10), ['barrel@15,10', 'barrel@15,12', 'chest@16,11']);
  assert.deepEqual(log.slice(10, 11), ['altar@20,10']);
  assert.equal(log[11], 'throne@5,1', 'the empty room adds nothing');
  assert.ok(log.includes('pillar@2,3') && log.includes('pillar@8,7'));
});

test('a building warms the room behind its door and a narrow hall has no pillars', () => {
  const front = { x0: 1, y0: 5, x1: 3, y1: 8 };
  const { place, log } = recorder();
  furnishHalls(place, () => 0.99, [{ x0: 1, y0: 1, x1: 2, y1: 3 }, front], {
    castle: false,
    entrance: [2, 8],
  });
  assert.deepEqual(log, ['hearth@2,5', 'table@2,6']);
  const lone = recorder();
  furnishHalls(lone.place, () => 0.99, [{ x0: 1, y0: 1, x1: 3, y1: 3 }], {
    castle: true,
    entrance: [2, 3],
  });
  assert.deepEqual(lone.log, ['throne@2,1']);
  const away = recorder();
  furnishHalls(away.place, () => 0.99, [front], { castle: false, entrance: [9, 9] });
  assert.deepEqual(away.log, [], 'an entrance outside every room finds no main room');
});

test('a dungeon level lines its big square rooms with pillars and hides treasure at the bottom', () => {
  const size = 12;
  const floor = /** @type {[number, number][]} */ ([
    [1, 1],
    [10, 10],
  ]);
  const dist = new Int32Array(size * size);
  dist[10 * size + 10] = 9;
  const big = { x0: 1, y0: 1, x1: 7, y1: 7 };
  const round = { ...big, round: true };
  const { place, log } = recorder();
  const facts = { floor, dist, size, descend: false };
  furnishDungeon(place, () => 0, [big, big, round], facts);
  assert.equal(log.filter((l) => l.startsWith('pillar')).length, 3 * 2);
  assert.ok(log.includes('altar@4,1'));
  assert.equal(log.filter((l) => l.startsWith('barrel')).length, 4);
  assert.ok(log.includes('chest@10,10'), 'the chest goes on the farthest cell');
  assert.equal(log.filter((l) => l.startsWith('rubble')).length, 2);
  const upper = recorder();
  furnishDungeon(upper.place, () => 0.99, [big], { ...facts, descend: true });
  assert.deepEqual(upper.log, ['rubble@10,10', 'rubble@10,10']);
});

test('a cave level gets pools and rubble, and its bottom level a chest', () => {
  const size = 24;
  const floor = /** @type {[number, number][]} */ ([[5, 5]]);
  const { place, log } = recorder();
  furnishCave(place, () => 0, { floor, dist: new Int32Array(size * size), size, descend: false });
  assert.equal(log.filter((l) => l.startsWith('pool')).length, 5);
  assert.ok(log.includes('chest@5,5'));
  assert.equal(log.filter((l) => l.startsWith('rubble')).length, 5);
  const upper = recorder();
  furnishCave(upper.place, () => 0.99, {
    floor,
    dist: new Int32Array(size * size),
    size,
    descend: true,
  });
  assert.equal(upper.log.filter((l) => l.startsWith('pool')).length, 2, 'two pools of one cell');
  assert.ok(!upper.log.some((l) => l.startsWith('chest')));
});

/**
 * Walk the open tiles of a generated level from its entry, around
 * obstacles, and report the open tiles that the walk cannot reach.
 * @param {import('../src/types/map.js').Tile[]} tiles @param {number} size @param {string} entry
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

test('generated interiors are furnished and every open tile stays reachable', () => {
  /** @type {Record<string, number>} */
  const seen = {};
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const levels = [
      [48, generateDungeon(palette, 48, mulberry32(seed), { descend: false })],
      [32, generateCave(palette, 32, mulberry32(seed), { descend: false })],
      [22, generateCastle(palette, 22, mulberry32(seed))],
      [12, generateBuilding(palette, 12, mulberry32(seed))],
    ];
    for (const [size, gen] of /** @type {[number, { tiles: any[], entry: string }][]} */ (levels)) {
      assert.deepEqual(stranded(gen.tiles, size, gen.entry), [], `seed ${seed} size ${size}`);
      for (const t of gen.tiles) {
        const kind = String(t.overlayRef ?? '').match(/interior-(\w+)\.svg/)?.[1];
        if (kind) seen[kind] = (seen[kind] ?? 0) + 1;
      }
    }
  }
  for (const kind of ['altar', 'chest', 'pillar', 'throne', 'bed', 'table', 'hearth']) {
    assert.ok(seen[kind], `some level has a ${kind}`);
  }
  for (const kind of ['bookshelf', 'barrel', 'rubble', 'pool']) {
    assert.ok(seen[kind], `some level has a ${kind}`);
  }
});

test('a cave draws with cave floors, cave walls, and a cave mouth', () => {
  const gen = generateCave(palette, 24, mulberry32(7));
  const refs = new Set(gen.tiles.map((t) => t.imageRef.replace(/.*interior-/, '')));
  assert.ok(refs.has('cave-wall.svg') && refs.has('cave-floor-1.svg'));
  assert.ok(!refs.has('wall-h.svg') && !refs.has('floor-1.svg'));
  assert.match(gen.tiles.find((t) => t.id === gen.entry)?.imageRef ?? '', /cave-mouth/);
});
