import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { generateNodeTiles } from '../src/map/MapGenerator.js';
import { generateDungeon } from '../src/map/GeneratorInteriors.js';
import { generateCave, MIN_CAVERN } from '../src/map/GeneratorCave.js';
import { generateBuilding, generateCastle, generateUpperFloor } from '../src/map/GeneratorHalls.js';
import { NEIGHBORS4, parseCoords, tileIdAt } from '../src/map/MapGeometry.js';
import { isBlocked, tileKind } from '../src/map/TileKinds.js';
import { mulberry32 } from '../src/util/Rng.js';

/** @typedef {import('../src/types/map.js').Tile} Tile */

const palette = new TilePalette();

/** @param {string} id @returns {[number, number]} */
const xy = (id) => {
  const c = /** @type {{ x: number, y: number }} */ (parseCoords(id));
  return [c.x, c.y];
};

/**
 * The rule checks that every generated interior meets. `open` counts the
 * cells that the party can stand on. `stranded` lists the open cells that
 * the party cannot reach from the entry without walking over a staircase,
 * because a click on a linked tile always follows its link. `crowded` lists
 * each staircase with a door or an obstacle beside it.
 * @param {{ tiles: Tile[], entry: string }} gen
 */
function audit(gen) {
  const byId = new Map(gen.tiles.map((t) => [t.id, t]));
  const stairs = (/** @type {Tile} */ t) => tileKind(t).startsWith('stairs');
  const open = gen.tiles.filter((t) => !isBlocked(t));
  const seen = new Set([gen.entry]);
  const queue = [gen.entry];
  while (queue.length) {
    const id = /** @type {string} */ (queue.pop());
    const tile = /** @type {Tile} */ (byId.get(id));
    if (id !== gen.entry && stairs(tile)) continue;
    const [x, y] = xy(id);
    for (const [dx, dy] of NEIGHBORS4) {
      const next = tileIdAt(x + dx, y + dy);
      const t = byId.get(next);
      if (t && !isBlocked(t) && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  const crowded = gen.tiles
    .filter((t) => stairs(t) && t.id !== gen.entry)
    .filter((t) => {
      const [x, y] = xy(t.id);
      return NEIGHBORS4.some(([dx, dy]) => {
        const n = byId.get(tileIdAt(x + dx, y + dy));
        return n !== undefined && (tileKind(n) === 'door' || tileKind(n) === 'obstacle');
      });
    })
    .map((t) => t.id);
  const stranded = open.filter((t) => !seen.has(t.id)).map((t) => t.id);
  return { open: open.length, stranded, crowded };
}

/** @param {string} label @param {{ tiles: Tile[], entry: string }} gen */
function assertSound(label, gen) {
  const { stranded, crowded } = audit(gen);
  assert.deepEqual(stranded, [], `${label}: cells cut off from the entry`);
  assert.deepEqual(crowded, [], `${label}: stairs beside a door or an obstacle`);
}

const SEEDS = 60;

test('every cave level is big enough and has stairs down when it descends', () => {
  for (const size of [8, 14]) {
    for (const entrance of /** @type {const} */ (['edge', 'stairs'])) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const label = `cave ${size} ${entrance} seed ${seed}`;
        const gen = generateCave(palette, size, mulberry32(seed), { entrance });
        assert.ok(audit(gen).open >= MIN_CAVERN, `${label}: ${audit(gen).open} open cells`);
        assert.ok(gen.stairsDown, `${label}: no stairs down`);
        assertSound(label, gen);
      }
    }
  }
});

test('every dungeon level keeps its stairs down away from the door', () => {
  for (const size of [8, 14]) {
    for (let seed = 0; seed < SEEDS; seed++) {
      const gen = generateDungeon(palette, size, mulberry32(seed));
      assert.ok(gen.stairsDown);
      assertSound(`dungeon ${size} seed ${seed}`, gen);
    }
  }
});

test('every castle keeps its stairs out of doorways and every building its trapdoor', () => {
  for (const size of [8, 14, 22]) {
    for (let seed = 0; seed < SEEDS; seed++) {
      assertSound(`castle ${size} seed ${seed}`, generateCastle(palette, size, mulberry32(seed)));
      assertSound(
        `building ${size} seed ${seed}`,
        generateBuilding(palette, size, mulberry32(seed)),
      );
      assertSound(
        `upper ${size} seed ${seed}`,
        generateUpperFloor(palette, size, mulberry32(seed)),
      );
    }
  }
});

test('the second level of a small cave on seed 29 is a real level with stairs down', () => {
  const options = { archetype: 'cave', size: 'small', levels: 2, level: 2 };
  const gen = generateNodeTiles(palette, options, mulberry32(29));
  assert.ok(audit(gen).open >= MIN_CAVERN);
  assert.equal(gen.sites.length, 1, 'the level below is a forced site');
  const three = { archetype: 'cave', size: 'small', levels: 3, level: 2 };
  assert.equal(generateNodeTiles(palette, three, mulberry32(29)).sites.length, 1);
});

test('a small three-level dungeon on seeds 23 and 90 keeps its stairs down out of the tunnel', () => {
  for (const seed of [23, 90]) {
    const options = { archetype: 'dungeon', size: 'small', levels: 3 };
    const gen = generateNodeTiles(palette, options, mulberry32(seed));
    assert.equal(gen.sites.length, 1);
    assertSound(`seed ${seed}`, gen);
    const [sx, sy] = xy(gen.sites[0].tileIds[0]);
    const [ex, ey] = xy(gen.entry);
    assert.ok(Math.abs(sx - ex) + Math.abs(sy - ey) > 2, `seed ${seed}: stairs near the door`);
  }
});

test('a medium castle on seed 99 keeps its stairs down out of the doorway', () => {
  const gen = generateNodeTiles(palette, { archetype: 'castle', size: 'medium' }, mulberry32(99));
  assertSound('castle', gen);
  assert.equal(gen.sites.length, 2);
});

test('a small building on seed 22 keeps its trapdoor clear', () => {
  const gen = generateBuilding(palette, 8, mulberry32(22));
  assert.ok(gen.stairsDown, 'seed 22 has a cellar');
  assertSound('building', gen);
});
