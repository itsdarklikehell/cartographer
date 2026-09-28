import { createTile } from './TileGrid.js';
import { NEIGHBORS4, parseCoords, tileIdAt } from './MapGeometry.js';
import { randInt, shuffle } from './GeneratorRandom.js';
import { clamp } from '../util/num.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * The town archetype generator. MapGenerator.js keeps the size presets and
 * the archetype dispatch. The open-terrain archetypes live in
 * GeneratorWilds.js and the enclosed-structure archetypes in
 * GeneratorInteriors.js.
 */

const TOWN_BUILDINGS = [
  'tavern',
  'inn',
  'blacksmith',
  'general-store',
  'alchemist',
  'temple',
  'shrine',
  'wizard-tower',
  'academy',
  'barracks',
];

/** @param {TilePalette} palette @param {string} type @param {() => number} rng */
function terrainRef(palette, type, rng) {
  return palette.pickVariant(type, rng).imageRef;
}

/**
 * Generate a settlement: grass everywhere, with a cross of roads through the
 * middle. The function draws the roads as an overlay, so the grass shows
 * through the verges. Building points of interest draw as 2x2 scaled blocks
 * on the grass beside the roads. The entry is the south end of the vertical
 * road, which runs edge to edge.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string }}
 */
export function generateTown(palette, size, rng) {
  // Roads run edge to edge, so the road cross connects the town to the
  // parent map on all four sides.
  const mx = Math.floor(size / 2);
  const my = Math.floor(size / 2);
  /** @param {number} x @param {number} y */
  const isRoad = (x, y) => x === mx || y === my;
  // A river runs north-south through town, a few tiles off the crossroads.
  // A bridge crosses it where the east-west road meets it.
  const rx = mx + (rng() < 0.5 ? -1 : 1) * (2 + randInt(rng, Math.max(1, mx - 3)));
  /** @type {Map<string, Tile>} */
  const byId = new Map();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const base = terrainRef(palette, 'grass', rng);
      const tile = createTile(tileIdAt(x, y), base);
      if (x === rx) {
        const kind = y === my ? 'bridge-h' : 'v';
        tile.overlayRef = palette.getRiverPiece(kind)?.imageRef ?? null;
      } else if (isRoad(x, y)) {
        const kind = x === mx && y === my ? 'cross' : x === mx ? 'v' : 'h';
        tile.overlayRef = palette.getRoadPiece(kind)?.imageRef ?? null;
      }
      byId.set(tile.id, tile);
    }
  }
  // Building sites are 2x2 blocks of grass. Each cell in a block avoids the
  // roads and the river, and the block sits orthogonally adjacent to a road.
  // The function scatters and caps the site count, so a small town stays
  // sparse and a large town fills out. The anchor tile of each chosen block
  // carries the building image with span 2, so town buildings draw at twice
  // the tile scale. The covered cells keep their grass beneath the scaled
  // art.
  /** @param {number} x @param {number} y */
  const clear = (x, y) => x >= 0 && y >= 0 && x < size && y < size && !isRoad(x, y) && x !== rx;
  /** @param {number} x @param {number} y */
  const blockCells = (x, y) => [
    [x, y],
    [x + 1, y],
    [x, y + 1],
    [x + 1, y + 1],
  ];
  /** @type {string[]} */
  const sites = [];
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const cells = blockCells(x, y);
      if (!cells.every(([cx, cy]) => clear(cx, cy))) continue;
      const touchesRoad = cells.some(([cx, cy]) =>
        NEIGHBORS4.some(([dx, dy]) => isRoad(cx + dx, cy + dy)),
      );
      if (touchesRoad) sites.push(tileIdAt(x, y));
    }
  }
  const count = clamp(Math.round(size / 2), 3, sites.length);
  /** @type {Set<string>} cells covered by an already-chosen block */
  const taken = new Set();
  /** @type {string[]} */
  const chosen = [];
  for (const id of shuffle(sites, rng)) {
    if (chosen.length >= count) break;
    const coords = /** @type {{ x: number, y: number }} */ (parseCoords(id));
    const cells = blockCells(coords.x, coords.y).map(([cx, cy]) => tileIdAt(cx, cy));
    if (cells.some((c) => taken.has(c))) continue;
    for (const c of cells) taken.add(c);
    chosen.push(id);
  }
  chosen.forEach((id, i) => {
    const building = TOWN_BUILDINGS[i % TOWN_BUILDINGS.length];
    const ref = palette.get(building)?.imageRef;
    const tile = byId.get(id);
    if (!ref || !tile) return;
    tile.imageRef = ref;
    tile.overlayRef = null;
    tile.span = 2;
    tile.metadata = { ...tile.metadata, poiType: 'settlement' };
  });
  return { tiles: [...byId.values()], entry: tileIdAt(mx, size - 1) };
}
