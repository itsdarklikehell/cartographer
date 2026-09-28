import { ArmNetwork, ARMS, OPPOSITE } from './Autotile.js';
import { terrainTiles } from './GeneratorWilds.js';
import { distanceTo, layRoad, routeRoad } from './GeneratorRoads.js';
import { fbm, valueNoise } from './GeneratorNoise.js';
import { randInt, shuffle } from './GeneratorRandom.js';
import { tileIdAt } from './MapGeometry.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').POIType} POIType */
/** @typedef {import('./Autotile.js').Arm} Arm */
/** @typedef {import('./GeneratorRoads.js').RoadGround} RoadGround */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('./TilePalette.js').PaletteEntry} PaletteEntry */

/**
 * The town archetype generator. A town is a core of streets and buildings
 * around a central crossroads, with farms and fields on the outskirts. Some
 * towns have a river, which the streets cross on bridges. MapGenerator.js
 * keeps the size presets and the archetype dispatch.
 */

/**
 * The buildings that a town places first, nearest the crossroads. The
 * example campaign puts its innkeeper, smith, and priest in these.
 */
const CORE_BUILDINGS = ['inn', 'tavern', 'blacksmith', 'general-store', 'temple'];

/** The buildings a larger town adds after the core set, in random order. */
const EXTRA_BUILDINGS = ['alchemist', 'shrine', 'wizard-tower', 'academy', 'barracks'];

/** The marker for the homes that fill the rest of a large town. */
const HOUSE = 'settlement';

/** The extra cost of a bend in a street, so streets run straight. */
const TURN = 0.6;

/** @type {Record<Arm, Arm>} the arm that a transposed grid gives each arm */
const TRANSPOSE = { n: 'w', w: 'n', s: 'e', e: 's' };

/**
 * @typedef {{ id: string, art: string, poi: POIType }} TownBuilding
 * `id` is the top-left cell of a 2x2 block, and `art` a palette marker id.
 */

/**
 * @typedef {{
 *   size: number,
 *   cells: string[],
 *   rivers: ArmNetwork,
 *   roads: ArmNetwork,
 *   entry: string,
 *   buildings: TownBuilding[],
 * }} TownPlan
 * `cells` is the terrain type per cell, indexed `y * size + x`. `entry` is
 * the border cell of the first street out of town.
 */

/**
 * A river that crosses the whole town, north to south or west to east. It
 * stays at least two cells from the center line, so it never runs through
 * the crossroads. It moves one cell sideways at random, but never on two
 * rows in a row, so each bend has a straight channel next to it that a
 * bridge fits.
 * @param {number} size @param {() => number} rng
 * @param {number} center the index of the center row and column
 * @returns {ArmNetwork}
 */
export function townRiver(size, rng, center) {
  const rivers = new ArmNetwork();
  const vertical = rng() < 0.5;
  // Work along the river (v) and across it (u), then transpose for a river
  // that runs west to east.
  /** @param {number} u @param {number} v @param {Arm} arm */
  const add = (u, v, arm) => (vertical ? rivers.add(u, v, arm) : rivers.add(v, u, TRANSPOSE[arm]));
  /** @param {number} u @param {number} v @param {Arm} arm */
  const join = (u, v, arm) =>
    vertical ? rivers.join(u, v, arm) : rivers.join(v, u, TRANSPOSE[arm]);
  /** @param {number} u */
  const clear = (u) => u >= 1 && u <= size - 2 && Math.abs(u - center) >= 2;
  const offset = 2 + randInt(rng, Math.max(1, Math.floor(size / 2) - 3));
  let u = center + (rng() < 0.5 ? -offset : offset);
  add(u, 0, 'n');
  let jogged = true;
  for (let v = 0; v < size; v++) {
    const du = rng() < 0.5 ? -1 : 1;
    /** @type {boolean} */ const jog = !jogged && v < size - 1 && rng() < 0.25 && clear(u + du);
    if (jog) {
      join(u, v, du < 0 ? 'w' : 'e');
      u += du;
    }
    jogged = jog;
    if (v < size - 1) join(u, v, 's');
    else add(u, v, 's');
  }
  return rivers;
}

/**
 * Lay the streets. The first street runs from the south edge to the
 * crossroads. Each later street runs from another edge to the nearest
 * street. A town of 14 cells or more has three ways out, and one of 22 or
 * more has four. Then short lanes run from open ground in the core to the
 * nearest street, so the core fills with blocks. A street always finds a
 * way, because the river never bends on two rows in a row and so always
 * has a straight channel to bridge.
 * @param {RoadGround} ground @param {number} c the center index
 * @param {number} core the core radius @param {() => number} rng
 * @returns {string} the entry: the border cell of the first street
 */
function layStreets(ground, c, core, rng) {
  const { size, rivers, roads } = ground;
  const toCenter = distanceTo([[c, c]]);
  /** @param {number} x @param {number} y */
  const onRoad = (x, y) => roads.has(x, y);
  const count = size >= 22 ? 4 : size >= 14 ? 3 : 2;
  const sides = /** @type {Arm[]} */ (['s', ...shuffle(['n', 'e', 'w'], rng)]).slice(0, count);
  const spread = Math.max(1, Math.floor(size / 6));
  /** @type {string[]} */
  const exits = [];
  for (const side of sides) {
    // The street leaves near the middle of its edge, never on the river.
    /** @type {[number, number][]} */
    const starts = [];
    for (let i = c - spread; i <= c + spread; i++) {
      const at = /** @type {[number, number]} */ (
        side === 'n' ? [i, 0] : side === 's' ? [i, size - 1] : side === 'w' ? [0, i] : [size - 1, i]
      );
      if (!rivers.has(...at)) starts.push(at);
    }
    const start = starts[randInt(rng, starts.length)];
    const goal = exits.length
      ? onRoad
      : (/** @type {number} */ x, /** @type {number} */ y) => x === c && y === c;
    const heading = ARMS.findIndex(([arm]) => arm === OPPOSITE[side]);
    const path = routeRoad(ground, start, goal, toCenter, heading);
    layRoad(roads, /** @type {[number, number][]} */ (path));
    roads.add(start[0], start[1], side);
    exits.push(tileIdAt(...start));
  }
  /** @param {number} x @param {number} y */
  const nearRoad = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) if (roads.has(x + dx, y + dy)) return true;
    }
    return false;
  };
  /** @type {[number, number][]} */
  const seeds = [];
  for (let y = c - core; y <= c + core; y++) {
    for (let x = c - core; x <= c + core; x++) seeds.push([x, y]);
  }
  let lanes = Math.floor(size / 5);
  for (const [x, y] of shuffle(seeds, rng)) {
    if (!lanes) break;
    if (rivers.has(x, y) || nearRoad(x, y)) continue;
    layRoad(roads, /** @type {[number, number][]} */ (routeRoad(ground, [x, y], onRoad, toCenter)));
    lanes--;
  }
  return exits[0];
}

/**
 * Plan a town: its river, streets, buildings, and fields, with no tiles.
 * The core is the square of cells within `core` of the crossroads. Each
 * building fills a 2x2 block of open ground beside a street. The core set
 * comes first and nearest the center, then the extra buildings, then homes
 * until the town has as many buildings as a thirtieth of the map area.
 * Past the edge of the core, one farm for each ten cells of map side takes
 * a block, and fields cover patches of the open ground. A town of 14 cells
 * or more gets a graveyard at the edge of the core, with a chance of three
 * in five.
 * @param {number} size @param {() => number} rng
 * @returns {TownPlan}
 */
export function planTown(size, rng) {
  const c = Math.floor(size / 2);
  const core = Math.max(3, Math.round(size * 0.3));
  const cells = new Array(size * size).fill('grass');
  const rivers = rng() < 0.6 ? townRiver(size, rng, c) : new ArmNetwork();
  const roads = new ArmNetwork();
  const entry = layStreets({ size, cells, rivers, roads, turn: TURN }, c, core, rng);

  /** @type {Set<number>} cells that a building covers */
  const taken = new Set();
  /** @param {number} x @param {number} y */
  const open = (x, y) => !roads.has(x, y) && !rivers.has(x, y) && !taken.has(y * size + x);
  /** @type {{ x: number, y: number, d: number }[]} */
  const blocks = [];
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      if (!open(x, y) || !open(x + 1, y) || !open(x, y + 1) || !open(x + 1, y + 1)) continue;
      const edge = [
        [x, y - 1],
        [x + 1, y - 1],
        [x + 2, y],
        [x + 2, y + 1],
        [x, y + 2],
        [x + 1, y + 2],
        [x - 1, y],
        [x - 1, y + 1],
      ];
      if (!edge.some(([ex, ey]) => roads.has(ex, ey))) continue;
      blocks.push({ x, y, d: Math.max(Math.abs(x + 0.5 - c), Math.abs(y + 0.5 - c)) });
    }
  }
  /** @type {TownBuilding[]} */
  const buildings = [];
  /**
   * Put buildings on the first free blocks of `list`, one for each art.
   * @param {{ x: number, y: number }[]} list @param {string[]} arts
   * @param {POIType} poi
   */
  const place = (list, arts, poi) => {
    let i = 0;
    for (const { x, y } of list) {
      if (i >= arts.length) return;
      if (!open(x, y) || !open(x + 1, y) || !open(x, y + 1) || !open(x + 1, y + 1)) continue;
      for (const [bx, by] of [
        [x, y],
        [x + 1, y],
        [x, y + 1],
        [x + 1, y + 1],
      ])
        taken.add(by * size + bx);
      buildings.push({ id: tileIdAt(x, y), art: arts[i++], poi });
    }
  };

  // Nearest first, with some jitter, so the buildings crowd around the
  // crossroads and reach past the core only when it runs out of blocks.
  const nearest = blocks.map((b) => ({ ...b, d: b.d + rng() * 3 })).sort((a, b) => a.d - b.d);
  const wanted = Math.max(3, Math.round((size * size) / 30));
  const arts = [...shuffle(CORE_BUILDINGS, rng), ...shuffle(EXTRA_BUILDINGS, rng)];
  while (arts.length < wanted) arts.push(HOUSE);
  place(nearest, arts.slice(0, wanted), 'settlement');
  if (size >= 14 && rng() < 0.6) {
    const rim = blocks.filter((b) => b.d > core - 1 && b.d <= core + 2);
    place(shuffle(rim, rng), ['graveyard'], 'landmark');
  }
  const outskirts = blocks.filter((b) => b.d > core + 1);
  place(shuffle(outskirts, rng), new Array(Math.floor(size / 10)).fill('farm'), 'settlement');

  const noise = valueNoise(rng);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const far = Math.max(Math.abs(x - c), Math.abs(y - c)) > core + 1;
      if (far && open(x, y) && fbm(noise, x / 4, y / 4, 3) > 0.45) cells[y * size + x] = 'farmland';
    }
  }
  return { size, cells, rivers, roads, entry, buildings };
}

/**
 * Generate a town from its plan. The streets and the river draw as
 * overlays, with a bridge where a street crosses the river. Each building
 * marker draws with span 2 over its block, and the covered cells keep their
 * grass under the scaled art.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string }}
 */
export function generateTown(palette, size, rng) {
  const plan = planTown(size, rng);
  const tiles = terrainTiles(palette, plan, rng, new Set(plan.buildings.map((b) => b.id)));
  const byId = new Map(tiles.map((t) => [t.id, t]));
  for (const { id, art, poi } of plan.buildings) {
    const tile = /** @type {Tile} */ (byId.get(id));
    tile.imageRef = /** @type {PaletteEntry} */ (palette.get(art)).imageRef;
    tile.span = 2;
    tile.metadata = { ...tile.metadata, poiType: poi };
  }
  return { tiles, entry: plan.entry };
}
