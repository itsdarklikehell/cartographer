import { NEIGHBORS4, NEIGHBORS8 } from './MapGeometry.js';
import { CAVE_ART, FLOOR, floorCells, tunnelToEdge, VOID } from './GeneratorInteriorMask.js';
import { furnishCave } from './GeneratorFurnish.js';
import { finishLevel } from './GeneratorInteriors.js';

/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('./GeneratorInteriors.js').LevelOptions} LevelOptions */
/** @typedef {import('./GeneratorInteriors.js').Level} Level */
/** @typedef {import('./GeneratorFurnish.js').Place} Place */
/** @typedef {import('./GeneratorFurnish.js').LevelFacts} LevelFacts */

/**
 * The cave archetype: winding natural passages grown with a cellular
 * automaton. Each cell starts as rock or open ground at random. Then, over
 * a few rounds, a cell turns to rock when most of its eight neighbors are
 * rock and opens when few of them are. The noise settles into smooth
 * caverns joined by narrow necks. Only the largest connected cavern stays,
 * so every floor cell can be reached. A cave stacks into levels like a
 * dungeon.
 */

/** The chance that a cell starts as rock. */
const ROCK = 0.45;

/** Rounds of the automaton. */
const ROUNDS = 4;

/** Tries at a cavern big enough to play in before the fallback room. */
const TRIES = 6;

/**
 * Grow one cavern mask: the largest 4-connected open area after the
 * automaton runs. The border row and column stay rock, so walls fit inside
 * the grid.
 * @param {number} size @param {() => number} rng
 * @returns {number[]} FLOOR for cavern cells, VOID for the rest
 */
export function growCavern(size, rng) {
  const edge = (/** @type {number} */ x, /** @type {number} */ y) =>
    x <= 0 || y <= 0 || x >= size - 1 || y >= size - 1;
  let rock = Array.from({ length: size * size }, (_, i) =>
    edge(i % size, Math.floor(i / size)) ? true : rng() < ROCK,
  );
  for (let round = 0; round < ROUNDS; round++) {
    rock = rock.map((was, i) => {
      const x = i % size;
      const y = Math.floor(i / size);
      if (edge(x, y)) return true;
      const count = NEIGHBORS8.filter(([dx, dy]) => rock[(y + dy) * size + x + dx]).length;
      return count >= 5 ? true : count <= 3 ? false : was;
    });
  }
  /** @type {number[]} */
  const label = new Array(size * size).fill(-1);
  let best = -1;
  let bestSize = 0;
  for (let start = 0; start < size * size; start++) {
    if (rock[start] || label[start] !== -1) continue;
    label[start] = start;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      for (const [dx, dy] of NEIGHBORS4) {
        const j = i + dy * size + dx;
        if (!rock[j] && label[j] === -1) {
          label[j] = start;
          queue.push(j);
        }
      }
    }
    if (queue.length > bestSize) {
      bestSize = queue.length;
      best = start;
    }
  }
  return label.map((l) => (l === best && best !== -1 ? FLOOR : VOID));
}

/**
 * Generate one cave level. The automaton runs until it grows a cavern that
 * covers at least a fifth of the map. After a few failed tries, a small
 * room in the middle of the map stands in, so a level always has floor.
 * The stairs up sit on the cavern cell nearest the border, where an edge
 * level also cuts its tunnel and its door, and the stairs down sit on the
 * cavern cell farthest from them. The cave draws with the rough cave pieces,
 * and `furnishCave` adds pools and rubble.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @param {LevelOptions} [options]
 * @returns {Level}
 */
export function generateCave(palette, size, rng, options = {}) {
  const entrance = options.entrance ?? 'edge';
  const descend = options.descend ?? true;
  let cells = growCavern(size, rng);
  for (let t = 1; t < TRIES && floorCells(cells, size).length < (size * size) / 5; t++) {
    cells = growCavern(size, rng);
  }
  let floor = floorCells(cells, size);
  if (!floor.length) {
    const mid = size >> 1;
    for (let y = mid - 1; y <= mid + 1; y++) {
      for (let x = mid - 1; x <= mid + 1; x++) cells[y * size + x] = FLOOR;
    }
    floor = floorCells(cells, size);
  }
  const gap = (/** @type {[number, number]} */ [x, y]) =>
    Math.min(x, y, size - 1 - x, size - 1 - y);
  const up = floor.reduce((a, b) => (gap(b) < gap(a) ? b : a));
  const door = entrance === 'edge' ? tunnelToEdge(cells, size, up[0], up[1]) : null;
  return finishLevel(
    palette,
    cells,
    size,
    rng,
    {
      up,
      candidates: floor,
      door,
      art: CAVE_ART,
      furnish: (place, facts) => furnishCave(place, rng, facts),
    },
    descend,
  );
}
