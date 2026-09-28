import { tileIdAt } from './MapGeometry.js';
import { ArmNetwork } from './Autotile.js';
import { distanceTo, layRoad, ROAD_COST, routeRoad } from './GeneratorRoads.js';

/** @typedef {import('../types/map.js').POIType} POIType */
/** @typedef {import('./GeneratorWilds.js').WildTerrain} WildTerrain */

/**
 * The places on an open-terrain map that people built: settlements, a keep,
 * and a dungeon, plus the farmland and roads around them. Each place is a
 * site. A site marks one tile with a marker and names the archetype that the
 * place would have as a sub-map of its own.
 */

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   tileId: string,
 *   marker: string,
 *   poi: POIType,
 *   archetype: string,
 * }} Site
 * `marker` is the palette id of the marker art. `archetype` is the
 * generator archetype for the place's own map: town, castle, or dungeon.
 */

/** @param {number} ax @param {number} ay @param {number} bx @param {number} by */
const chebyshev = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/**
 * How many of each site a map of this side length gets. A small map holds
 * one settlement. A vast map holds five, a keep, and a dungeon.
 * @param {number} size
 */
export function siteCounts(size) {
  return {
    settlements: Math.max(1, Math.round(size / 10)),
    keep: size >= 22 ? 1 : 0,
    dungeon: size >= 14 ? 1 : 0,
  };
}

/**
 * Choose the sites of an open-terrain map. A settlement prefers grass near
 * a river or a lake, because marker art sits on a grass background and
 * towns grow beside water. A settlement with at least four water cells
 * within two cells of it becomes a port, so a pond does not make a harbor.
 * The first settlement takes the best spot, and on a map of 32 cells or
 * more it is a city. Each later settlement is a village with a chance of
 * one in two. The keep stands at the foot of the hills when it can, and
 * the dungeon stands as far from every settlement as the map allows. No
 * site sits on a river, a shoreline, or within two cells of the border, so
 * its marker never hides an overlay and a road can reach it from every
 * side.
 * @param {WildTerrain} terrain
 * @param {() => number} rng
 * @returns {Site[]}
 */
export function planSites(terrain, rng) {
  const { size, cells, rivers } = terrain;
  /** @param {number} x @param {number} y @param {number} r @param {(t: string) => boolean} test */
  const within = (x, y, r, test) => {
    for (let yy = Math.max(0, y - r); yy <= Math.min(size - 1, y + r); yy++) {
      for (let xx = Math.max(0, x - r); xx <= Math.min(size - 1, x + r); xx++) {
        if ((xx !== x || yy !== y) && test(cells[yy * size + xx])) return true;
      }
    }
    return false;
  };
  /** @param {number} x @param {number} y @param {number} r */
  const riverWithin = (x, y, r) => {
    for (let yy = y - r; yy <= y + r; yy++) {
      for (let xx = x - r; xx <= x + r; xx++) if (rivers.has(xx, yy)) return true;
    }
    return false;
  };
  const wet = (/** @type {string} */ t) => t === 'water';
  /** @param {number} x @param {number} y */
  const waterNear = (x, y) => {
    let count = 0;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(size - 1, y + 2); yy++) {
      for (let xx = Math.max(0, x - 2); xx <= Math.min(size - 1, x + 2); xx++) {
        if (cells[yy * size + xx] === 'water') count++;
      }
    }
    return count;
  };
  /** @type {{ x: number, y: number }[]} */
  const open = [];
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      const type = cells[y * size + x];
      if (!(type in ROAD_COST) || rivers.has(x, y) || within(x, y, 1, wet)) continue;
      open.push({ x, y });
    }
  }
  const counts = siteCounts(size);
  /** @type {Site[]} */
  const sites = [];
  const spacing = Math.max(4, Math.round(size / 5));
  /**
   * Take the best-scoring open cell that keeps `gap` from every site.
   * @param {(x: number, y: number) => number} score
   * @param {number} gap
   * @returns {{ x: number, y: number } | null}
   */
  const take = (score, gap) => {
    let pick = null;
    let top = -Infinity;
    for (const cell of open) {
      if (sites.some((s) => chebyshev(s.x, s.y, cell.x, cell.y) < gap)) continue;
      const s = score(cell.x, cell.y) + rng() * 0.5;
      if (s > top) {
        top = s;
        pick = cell;
      }
    }
    return pick;
  };
  /** @param {number} x @param {number} y */
  const grass = (x, y) => (cells[y * size + x] === 'grass' ? 3 : 0);
  /**
   * @param {{ x: number, y: number } | null} at
   * @param {string} marker @param {POIType} poi @param {string} archetype
   */
  const add = (at, marker, poi, archetype) => {
    if (at) sites.push({ ...at, tileId: tileIdAt(at.x, at.y), marker, poi, archetype });
  };

  for (let i = 0; i < counts.settlements; i++) {
    const at = take(
      (x, y) => grass(x, y) + (riverWithin(x, y, 2) ? 2 : 0) + (within(x, y, 2, wet) ? 1.5 : 0),
      spacing,
    );
    const port = at !== null && waterNear(at.x, at.y) >= 4;
    const first = size >= 32 ? 'city' : 'settlement';
    const later = rng() < 0.5 ? 'village' : 'settlement';
    add(at, port ? 'port' : i === 0 ? first : later, 'settlement', 'town');
  }
  if (counts.keep) {
    const hill = (/** @type {string} */ t) => t === 'hills' || t === 'mountain';
    add(
      take((x, y) => grass(x, y) + (within(x, y, 1, hill) ? 2 : 0), 3),
      'castle',
      'landmark',
      'castle',
    );
  }
  if (counts.dungeon) {
    const towns = sites.filter((s) => s.archetype === 'town').map((s) => [s.x, s.y]);
    const far = distanceTo(/** @type {[number, number][]} */ (towns));
    add(
      take((x, y) => grass(x, y) + far(x, y) / 2, 3),
      'dungeon',
      'dungeon',
      'dungeon',
    );
  }
  return sites;
}

/**
 * Turn grass around each settlement into farmland: each grass cell within
 * two cells of a settlement becomes a field with a chance of one in two.
 * The settlement's own cell stays grass under its marker.
 * @param {WildTerrain} terrain
 * @param {Site[]} sites
 * @param {() => number} rng
 */
export function plantFarmland(terrain, sites, rng) {
  const { size, cells } = terrain;
  for (const site of sites) {
    if (site.archetype !== 'town') continue;
    for (let y = site.y - 2; y <= site.y + 2; y++) {
      for (let x = site.x - 2; x <= site.x + 2; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size || (x === site.x && y === site.y)) continue;
        if (cells[y * size + x] === 'grass' && rng() < 0.5) cells[y * size + x] = 'farmland';
      }
    }
  }
}

/**
 * Lay the roads that join the settlements and the keep, and the roads that
 * leave the map. The sites join as a minimum spanning tree, shortest link
 * first, so every reachable site connects with no redundant road. Then one
 * road runs from the site nearest the border off the map edge, and a map of
 * 32 or more cells gets a second exit on a far part of the border. The
 * dungeon gets no road, because it is hidden. A link that no road can make,
 * for example across a lake, is left out.
 * @param {WildTerrain} terrain
 * @param {Site[]} sites
 * @returns {{ roads: ArmNetwork, exits: string[] }} `exits` lists the
 *   border tiles where a road leaves the map, first exit first
 */
export function connectSites(terrain, sites) {
  const { size, cells, rivers } = terrain;
  const roads = new ArmNetwork();
  const linked = sites.filter((s) => s.archetype !== 'dungeon');
  const siteAt = new Set(sites.map((s) => s.y * size + s.x));
  /** @type {import('./GeneratorRoads.js').RoadGround} */
  const ground = { size, cells, rivers, roads, blocked: (x, y) => siteAt.has(y * size + x) };
  /** @type {string[]} */
  const exits = [];
  if (!linked.length) return { roads, exits };

  // Prim's algorithm: grow the tree from the first site by its nearest
  // outside site each round.
  const inTree = [linked[0]];
  const rest = linked.slice(1);
  while (rest.length) {
    let bestPair = null;
    let bestDist = Infinity;
    for (const a of inTree) {
      for (const b of rest) {
        const d = chebyshev(a.x, a.y, b.x, b.y);
        if (d < bestDist) {
          bestDist = d;
          bestPair = { a, b };
        }
      }
    }
    const { a, b } = /** @type {{ a: Site, b: Site }} */ (bestPair);
    rest.splice(rest.indexOf(b), 1);
    inTree.push(b);
    const path = routeRoad(
      ground,
      [a.x, a.y],
      (x, y) => x === b.x && y === b.y,
      distanceTo([[b.x, b.y]]),
    );
    if (path) layRoad(roads, path);
  }

  /** @param {number} x @param {number} y */
  const edgeGap = (x, y) => Math.min(x, y, size - 1 - x, size - 1 - y);
  /** @param {number} x @param {number} y */
  const roadable = (x, y) => cells[y * size + x] in ROAD_COST && !rivers.has(x, y);
  const byEdge = [...linked].sort((p, q) => edgeGap(p.x, p.y) - edgeGap(q.x, q.y));
  const wanted = size >= 32 ? 2 : 1;
  for (const site of byEdge) {
    if (exits.length >= wanted) break;
    const firstExit = exits[0]?.split(',').map(Number);
    const path = routeRoad(
      ground,
      [site.x, site.y],
      (x, y) =>
        edgeGap(x, y) === 0 &&
        roadable(x, y) &&
        (!firstExit || chebyshev(x, y, firstExit[0], firstExit[1]) >= size / 2),
      edgeGap,
    );
    if (!path) continue;
    layRoad(roads, path);
    const [bx, by] = path[path.length - 1];
    roads.add(bx, by, by === 0 ? 'n' : by === size - 1 ? 's' : bx === 0 ? 'w' : 'e');
    exits.push(tileIdAt(bx, by));
  }
  return { roads, exits };
}
