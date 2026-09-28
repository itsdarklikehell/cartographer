import { ArmNetwork, ARMS, OPPOSITE } from './Autotile.js';
import { terrainTiles } from './GeneratorWilds.js';
import { distanceTo, layRoad, routeRoad } from './GeneratorRoads.js';
import { fbm, valueNoise } from './GeneratorNoise.js';
import { randInt, shuffle } from './GeneratorRandom.js';
import { tileIdAt } from './MapGeometry.js';
import { planWall, wallRadii } from './GeneratorTownWall.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').POIType} POIType */
/** @typedef {import('../types/map.js').GeneratedSite} GeneratedSite */
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

/**
 * The buildings a larger town adds after the core and civic sets, in random
 * order. They take half of the blocks that remain, and homes take the rest.
 */
const EXTRA_BUILDINGS = [
  'alchemist',
  'shrine',
  'wizard-tower',
  'academy',
  'barracks',
  'guildhall',
  'bakery',
  'warehouse',
  'stables',
];

/**
 * The stand-in art for a home. `place` swaps it for a house near the
 * crossroads or a cottage at the edge of the core.
 */
const HOME = 'home';

/**
 * The interior environ of each building that opens into a sub-map of its
 * own. A well, a fountain, a market, and a graveyard are open ground, so they
 * have no inside. The larger public buildings get a medium map.
 * @type {Record<string, { environ: string, size: string }>}
 */
const BUILDING_INTERIORS = {
  inn: { environ: 'inn', size: 'small' },
  tavern: { environ: 'tavern', size: 'small' },
  blacksmith: { environ: 'shop', size: 'small' },
  'general-store': { environ: 'shop', size: 'small' },
  alchemist: { environ: 'shop', size: 'small' },
  bakery: { environ: 'shop', size: 'small' },
  temple: { environ: 'temple', size: 'medium' },
  shrine: { environ: 'temple', size: 'small' },
  'wizard-tower': { environ: 'academy', size: 'small' },
  academy: { environ: 'academy', size: 'medium' },
  barracks: { environ: 'barracks', size: 'medium' },
  guildhall: { environ: 'guildhall', size: 'medium' },
  'town-hall': { environ: 'guildhall', size: 'medium' },
  warehouse: { environ: 'warehouse', size: 'small' },
  stables: { environ: 'warehouse', size: 'small' },
  watermill: { environ: 'warehouse', size: 'small' },
  windmill: { environ: 'warehouse', size: 'small' },
  house: { environ: 'house', size: 'small' },
  cottage: { environ: 'house', size: 'small' },
  farm: { environ: 'house', size: 'small' },
};

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
 *   walls: Map<string, string>,
 * }} TownPlan
 * `cells` is the terrain type per cell, indexed `y * size + x`. `entry` is
 * the border cell of the first street out of town. `walls` maps each tile id
 * of the town wall to its piece, for example `wall-h` or `gate-v`, and is
 * empty for a town with no wall.
 */

/**
 * A river that crosses the whole town, north to south or west to east. It
 * stays at least two cells from the center line, so it never runs through
 * the crossroads. It moves one cell sideways at random, but never on two
 * rows in a row, so each bend has a straight channel next to it that a
 * bridge fits. When `ring` is the radius of a wall ring, the river never
 * runs along a side of the ring and never bends on it, so it goes straight
 * through the wall under a water gate.
 * @param {number} size @param {() => number} rng
 * @param {number} center the index of the center row and column
 * @param {number} [ring] the radius of the ring to keep clear, or 0 for none
 * @returns {ArmNetwork}
 */
export function townRiver(size, rng, center, ring = 0) {
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
  const clear = (u) =>
    u >= 1 && u <= size - 2 && Math.abs(u - center) >= 2 && Math.abs(u - center) !== ring;
  /** @type {number[]} */
  const offsets = [];
  for (let d = 2; d < Math.max(3, Math.floor(size / 2) - 1); d++) if (d !== ring) offsets.push(d);
  const offset = offsets[randInt(rng, offsets.length)];
  let u = center + (rng() < 0.5 ? -offset : offset);
  add(u, 0, 'n');
  let jogged = true;
  for (let v = 0; v < size; v++) {
    const du = rng() < 0.5 ? -1 : 1;
    const onRing = ring > 0 && Math.abs(v - center) === ring;
    /** @type {boolean} */
    const jog = !jogged && !onRing && v < size - 1 && rng() < 0.25 && clear(u + du);
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
 * Plan a town: its river, streets, plaza, wall, buildings, and fields, with
 * no tiles. The core is the square of cells within `core` of the
 * crossroads. The plaza paves the cells within one cell of the crossroads,
 * or within two on a map of 32 cells or more. Each building fills a 2x2
 * block of open ground beside a street or the plaza. The core set comes first and
 * nearest the center. The civic set follows: a well or a fountain, and on a
 * map of 22 cells or more a market and a town hall. Extra buildings then
 * take half of the remaining blocks and homes take the rest, until the town
 * has as many buildings as a thirtieth of the map area. A home is a house
 * near the crossroads and a cottage near the edge of the core.
 *
 * A town of 14 cells or more gets a watermill on a block beside its river.
 * It also gets a graveyard at the edge of the core, with a chance of three
 * in five. Past the edge of the core, one farm for each ten cells of map
 * side takes a block, and fields cover patches of the open ground. Then a
 * windmill takes the outlying block with the most fields around it.
 * @param {number} size @param {() => number} rng
 * @returns {TownPlan}
 */
export function planTown(size, rng) {
  const c = Math.floor(size / 2);
  const core = Math.max(3, Math.round(size * 0.3));
  const cells = new Array(size * size).fill('grass');
  const ring = wallRadii(size, c, core)[0] ?? 0;
  const rivers = rng() < 0.6 ? townRiver(size, rng, c, ring) : new ArmNetwork();
  const roads = new ArmNetwork();
  const entry = layStreets({ size, cells, rivers, roads, turn: TURN }, c, core, rng);
  const walls = planWall({ size, roads, rivers }, c, core, rng);
  const square = size >= 32 ? 2 : 1;
  /** @param {number} x @param {number} y */
  const paved = (x, y) => Math.max(Math.abs(x - c), Math.abs(y - c)) <= square && !rivers.has(x, y);
  for (let y = c - square; y <= c + square; y++) {
    for (let x = c - square; x <= c + square; x++) if (paved(x, y)) cells[y * size + x] = 'plaza';
  }

  /** @type {Set<number>} cells that a building covers */
  const taken = new Set();
  /** @param {number} x @param {number} y */
  const open = (x, y) =>
    !roads.has(x, y) &&
    !rivers.has(x, y) &&
    !walls.has(tileIdAt(x, y)) &&
    !taken.has(y * size + x) &&
    !paved(x, y);
  /** @param {number} x @param {number} y */
  const openBlock = (x, y) => open(x, y) && open(x + 1, y) && open(x, y + 1) && open(x + 1, y + 1);
  /** @type {{ x: number, y: number, d: number, river: boolean }[]} */
  const blocks = [];
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      if (!openBlock(x, y)) continue;
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
      if (!edge.some(([ex, ey]) => roads.has(ex, ey) || paved(ex, ey))) continue;
      const d = Math.max(Math.abs(x + 0.5 - c), Math.abs(y + 0.5 - c));
      blocks.push({ x, y, d, river: edge.some(([ex, ey]) => rivers.has(ex, ey)) });
    }
  }
  /** @type {TownBuilding[]} */
  const buildings = [];
  /**
   * Put buildings on the first free blocks of `list`, one for each art. A
   * covered cell goes back to grass, which the scaled art hides.
   * @param {{ x: number, y: number }[]} list @param {string[]} arts
   * @param {POIType} poi
   */
  const place = (list, arts, poi) => {
    let i = 0;
    for (const { x, y } of list) {
      if (i >= arts.length) return;
      if (!openBlock(x, y)) continue;
      for (const [bx, by] of [
        [x, y],
        [x + 1, y],
        [x, y + 1],
        [x + 1, y + 1],
      ]) {
        taken.add(by * size + bx);
        cells[by * size + bx] = 'grass';
      }
      const edgeward = Math.max(Math.abs(x + 0.5 - c), Math.abs(y + 0.5 - c)) >= core - 0.5;
      const art = arts[i++];
      buildings.push({
        id: tileIdAt(x, y),
        art: art !== HOME ? art : edgeward ? 'cottage' : 'house',
        poi,
      });
    }
  };

  // Nearest first, with some jitter, so the buildings crowd around the
  // crossroads and reach past the core only when it runs out of blocks.
  const nearest = blocks.map((b) => ({ ...b, d: b.d + rng() * 3 })).sort((a, b) => a.d - b.d);
  const wanted = Math.max(3, Math.round((size * size) / 30));
  const civic = [rng() < 0.5 ? 'well' : 'fountain', ...(size >= 22 ? ['market', 'town-hall'] : [])];
  const arts = [...shuffle(CORE_BUILDINGS, rng), ...civic];
  const extras = Math.max(0, Math.floor((wanted - arts.length) / 2));
  arts.push(...shuffle(EXTRA_BUILDINGS, rng).slice(0, extras));
  while (arts.length < wanted) arts.push(HOME);
  place(nearest, arts.slice(0, wanted), 'settlement');
  if (size >= 14) {
    place(
      shuffle(
        blocks.filter((b) => b.river),
        rng,
      ),
      ['watermill'],
      'settlement',
    );
    if (rng() < 0.6) {
      const rim = blocks.filter((b) => b.d > core - 1 && b.d <= core + 2);
      place(shuffle(rim, rng), ['graveyard'], 'landmark');
    }
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
  if (size >= 14) {
    /** @param {number} x @param {number} y */
    const fields = (x, y) => {
      let n = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(size - 1, y + 2); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(size - 1, x + 2); xx++) {
          const inside = xx - x >= 0 && xx - x <= 1 && yy - y >= 0 && yy - y <= 1;
          if (!inside && cells[yy * size + xx] === 'farmland') n++;
        }
      }
      return n;
    };
    const farmed = outskirts
      .filter((b) => openBlock(b.x, b.y))
      .map((b) => ({ ...b, n: fields(b.x, b.y) + rng() }))
      .filter((b) => b.n >= 4)
      .sort((a, b) => b.n - a.n);
    place(farmed, ['windmill'], 'settlement');
  }
  return { size, cells, rivers, roads, entry, buildings, walls };
}

/**
 * Generate a town from its plan. The streets and the river draw as
 * overlays, with a bridge where a street crosses the river, and the wall
 * pieces draw as overlays in place of any street under them. The plaza
 * takes no street overlay, so the streets open onto the cobbles. Each building
 * marker draws with span 2 over its block, and the covered cells keep their
 * grass under the scaled art. Each building with an inside is a site whose
 * four cells all link to its interior, so the party can enter from any cell
 * under the art.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string, sites: GeneratedSite[] }}
 */
export function generateTown(palette, size, rng) {
  const plan = planTown(size, rng);
  const bare = new Set(plan.buildings.map((b) => b.id));
  for (let i = 0; i < plan.cells.length; i++) {
    if (plan.cells[i] === 'plaza') bare.add(tileIdAt(i % size, Math.floor(i / size)));
  }
  const tiles = terrainTiles(palette, plan, rng, bare);
  const byId = new Map(tiles.map((t) => [t.id, t]));
  for (const { id, art, poi } of plan.buildings) {
    const tile = /** @type {Tile} */ (byId.get(id));
    tile.imageRef = /** @type {PaletteEntry} */ (palette.get(art)).imageRef;
    tile.span = 2;
    tile.metadata = { ...tile.metadata, poiType: poi };
  }
  for (const [id, piece] of plan.walls) {
    const tile = /** @type {Tile} */ (byId.get(id));
    tile.overlayRef = /** @type {PaletteEntry} */ (palette.getTownWallPiece(piece)).imageRef;
  }
  /** @type {GeneratedSite[]} */
  const sites = [];
  for (const { id, art } of plan.buildings) {
    const inside = BUILDING_INTERIORS[art];
    if (!inside) continue;
    const [x, y] = id.split(',').map(Number);
    const tileIds = [
      tileIdAt(x, y),
      tileIdAt(x + 1, y),
      tileIdAt(x, y + 1),
      tileIdAt(x + 1, y + 1),
    ];
    sites.push({ tileIds, archetype: 'building', kind: 'interior', label: art, ...inside });
  }
  return { tiles, entry: plan.entry, sites };
}
