import { createTile, tilesById } from './TileGrid.js';
import { tileIdAt } from './MapGeometry.js';
import { coastOverlays, smoothCoastline } from './Autotile.js';
import { randInt, shuffle } from './GeneratorRandom.js';
import { TERRAIN_PROFILES, terrainField } from './GeneratorTerrain.js';
import { traceRivers } from './GeneratorRivers.js';
import { clamp } from '../util/num.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('./Autotile.js').ArmNetwork} ArmNetwork */

/**
 * The open-terrain archetypes: wilderness and its climate variants. Each one
 * runs the climate model in GeneratorTerrain.js with its own profile, traces
 * rivers down from the high ground, draws shorelines, and places landmarks.
 * The terrain covers every cell, so the map meets its parent along the whole
 * border.
 */

/**
 * Landmark markers and the terrain each one prefers as a neighbor. A mine
 * or a cave sits at the foot of the hills, and a camp at the edge of a
 * wood. An empty list means the landmark fits anywhere.
 * @type {Record<string, string[]>}
 */
const LANDMARK_AFFINITY = {
  ruins: [],
  camp: ['forest'],
  'standing-stones': ['hills'],
  mine: ['hills', 'mountain'],
  'cave-entrance': ['mountain', 'hills'],
  graveyard: [],
};

/**
 * @typedef {{
 *   size: number,
 *   cells: string[],
 *   biomes: string[],
 *   elevation: Float64Array,
 *   rivers: ArmNetwork,
 * }} WildTerrain
 * `cells` is the drawn terrain type per cell and `biomes` the finer biome
 * per cell, both indexed `y * size + x`.
 */

/**
 * The terrain of one open-terrain map before any tile exists: classified
 * cells with shorelines the coast pieces can draw, and rivers. Rivers are
 * traced after the coastline is smoothed, because smoothing turns narrow
 * land into water and a river traced first could end up inside a lake.
 * @param {number} size
 * @param {string} archetype a key of TERRAIN_PROFILES
 * @param {() => number} rng
 * @returns {WildTerrain}
 */
export function wildTerrain(size, archetype, rng) {
  const profile = TERRAIN_PROFILES[archetype] ?? TERRAIN_PROFILES.wilderness;
  const field = terrainField(size, profile, rng);
  let cells = smoothCoastline(field.cells, size, size);
  const count = Math.round(profile.rivers * Math.max(1, size / 12));
  const { network, ponds } = traceRivers({ size, elevation: field.elevation, cells }, count, rng);
  for (const i of ponds) cells[i] = 'water';
  if (ponds.length) cells = smoothCoastline(cells, size, size);
  // A pond can widen the water it joins, so a river cell can end up under
  // water. The channel beside it still points into that water, so it drains
  // there.
  const biomes = field.biomes.map((b, i) =>
    cells[i] === 'water' && b !== 'deep-water' ? 'water' : b,
  );
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 'water') network.drop(i % size, Math.floor(i / size));
  }
  return { size, cells, biomes, elevation: field.elevation, rivers: network };
}

/**
 * Turn classified terrain into tiles. Each cell gets a random variant of its
 * terrain type, and a shoreline and river overlay where it has them. The
 * shoreline draws under the channel, so a river drains through the beach
 * into the water.
 * @param {TilePalette} palette
 * @param {WildTerrain} terrain
 * @param {() => number} rng
 * @returns {Tile[]}
 */
export function terrainTiles(palette, terrain, rng) {
  const { size, cells, rivers } = terrain;
  const coast = coastOverlays(cells, size, size);
  const channel = rivers.pieces();
  /** @type {Tile[]} */
  const tiles = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = tileIdAt(x, y);
      const refs = [];
      const shore = coast.get(id);
      const river = channel.get(id);
      const shorePiece = shore && palette.getCoastPiece(shore);
      const riverPiece = river && palette.getRiverPiece(river);
      if (shorePiece) refs.push(shorePiece.imageRef);
      if (riverPiece) refs.push(riverPiece.imageRef);
      const base = palette.pickVariant(cells[y * size + x], rng).imageRef;
      tiles.push(
        createTile(id, base, refs.length ? { overlayRef: refs.length > 1 ? refs : refs[0] } : {}),
      );
    }
  }
  return tiles;
}

/**
 * Scatter landmark markers over open ground away from the border. Marker art
 * sits on a grass background, so a landmark prefers a grass cell. Each
 * landmark then prefers a cell beside the terrain it belongs to. A map with
 * no free grass, such as a desert, still gets its landmarks on other open
 * ground, where the grass under the marker reads as a clearing or an oasis.
 * Landmarks keep at least three cells apart.
 * @param {TilePalette} palette
 * @param {WildTerrain} terrain
 * @param {Tile[]} tiles
 * @param {number} count
 * @param {() => number} rng
 * @returns {string[]} the tile ids that got a landmark
 */
export function placeLandmarks(palette, terrain, tiles, count, rng) {
  const { size, cells } = terrain;
  const byId = tilesById(tiles);
  /** @param {number} x @param {number} y */
  const free = (x, y) => {
    const type = cells[y * size + x];
    const tile = byId.get(tileIdAt(x, y));
    return (
      Boolean(tile && !tile.overlayRef && !tile.childNodeId && !tile.metadata.poiType) &&
      type !== 'water' &&
      type !== 'mountain'
    );
  };
  /** @type {[number, number][]} */
  const placed = [];
  const types = Object.keys(LANDMARK_AFFINITY);
  const order = shuffle(types, rng);
  for (let i = 0; i < count; i++) {
    const type = order[i % order.length];
    const likes = LANDMARK_AFFINITY[type];
    /** @type {{ x: number, y: number, score: number }[]} */
    const spots = [];
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (!free(x, y)) continue;
        if (placed.some(([px, py]) => Math.max(Math.abs(px - x), Math.abs(py - y)) < 3)) continue;
        let score = cells[y * size + x] === 'grass' ? 2 : 0;
        if (likes.some((t) => nearType(cells, size, x, y, t))) score += 1;
        spots.push({ x, y, score });
      }
    }
    if (!spots.length) break;
    const best = Math.max(...spots.map((s) => s.score));
    const top = spots.filter((s) => s.score === best);
    const { x, y } = top[randInt(rng, top.length)];
    const tile = byId.get(tileIdAt(x, y));
    const ref = palette.get(type)?.imageRef;
    if (!tile || !ref) continue;
    tile.imageRef = ref;
    tile.metadata = { ...tile.metadata, poiType: 'landmark' };
    placed.push([x, y]);
  }
  return placed.map(([x, y]) => tileIdAt(x, y));
}

/**
 * Whether any of the eight cells around (x, y) has terrain `type`.
 * @param {string[]} cells @param {number} size @param {number} x @param {number} y
 * @param {string} type
 */
function nearType(cells, size, x, y, type) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < size && ny < size) {
        if (cells[ny * size + nx] === type) return true;
      }
    }
  }
  return false;
}

/**
 * Generate an open-terrain map for one of the climate archetypes:
 * wilderness, highlands, frontier, desert, wetlands, or island. The entry
 * is the bottom-center border tile.
 * @param {TilePalette} palette
 * @param {number} size
 * @param {() => number} rng
 * @param {string} [archetype] a key of TERRAIN_PROFILES
 * @returns {{ tiles: Tile[], entry: string }}
 */
export function generateWilds(palette, size, rng, archetype = 'wilderness') {
  const terrain = wildTerrain(size, archetype, rng);
  const tiles = terrainTiles(palette, terrain, rng);
  placeLandmarks(palette, terrain, tiles, clamp(Math.round(size / 7), 1), rng);
  return { tiles, entry: tileIdAt(Math.floor(size / 2), size - 1) };
}
