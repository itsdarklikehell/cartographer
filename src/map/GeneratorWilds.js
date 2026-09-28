import { createTile, tilesById } from './TileGrid.js';
import { tileIdAt } from './MapGeometry.js';
import { ARMS, ArmNetwork, coastOverlays, smoothCoastline } from './Autotile.js';
import { randInt, shuffle } from './GeneratorRandom.js';
import { BIOME_TERRAIN, TERRAIN_PROFILES, terrainField } from './GeneratorTerrain.js';
import { traceRivers } from './GeneratorRivers.js';
import { bridgeAt } from './GeneratorRoads.js';
import { connectSites, plantFarmland, planSites, siteMap } from './GeneratorSites.js';
import { clamp } from '../util/num.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../types/map.js').GeneratedSite} GeneratedSite */
/** @typedef {import('./GeneratorSites.js').Site} Site */

/**
 * The open-terrain archetypes: wilderness and its climate variants. Each one
 * runs the climate model in GeneratorTerrain.js with its own profile, traces
 * rivers down from the high ground, and draws shorelines. Then it places
 * settlements, a keep, and a dungeon, joins them with roads, and scatters
 * landmarks.
 * The terrain covers every cell, so the map meets its parent along the whole
 * border.
 */

/**
 * @typedef {{ near?: string[], road?: boolean, on?: string, shore?: boolean }} LandmarkNeeds
 * `near` lists the terrain the landmark prefers as a neighbor, and `road`
 * makes it prefer a cell beside a road. `on` is the terrain class that its
 * cell must have, and `shore` makes it need open water within two cells.
 */

/**
 * Landmark markers and where each one belongs. A mine or a cave sits at the
 * foot of the hills, a camp at the edge of a wood, and a watchtower beside
 * a road. An oasis stands only in the desert, and a lighthouse only near
 * open water. A landmark with no needs fits anywhere.
 * @type {Record<string, LandmarkNeeds>}
 */
const LANDMARK_AFFINITY = {
  ruins: {},
  camp: { near: ['forest'] },
  'standing-stones': { near: ['hills'] },
  mine: { near: ['hills', 'mountain'] },
  'cave-entrance': { near: ['mountain', 'hills'] },
  graveyard: {},
  watchtower: { road: true },
  oasis: { on: 'desert' },
  lighthouse: { shore: true },
};

/**
 * The landmarks that open into a sub-map, and the archetype of that map.
 * @type {Record<string, string>}
 */
const LANDMARK_MAPS = { 'cave-entrance': 'cave', mine: 'cave', ruins: 'dungeon' };

/** The fewest water cells within two cells that count as open water. */
const OPEN_WATER = 4;

/** A road crossing farther than this from every town is a ford. */
const FORD_DISTANCE = 3;

/**
 * @typedef {{
 *   size: number,
 *   cells: string[],
 *   biomes: string[],
 *   elevation: Float64Array,
 *   rivers: ArmNetwork,
 *   roads: ArmNetwork,
 * }} WildTerrain
 * `cells` is the terrain class per cell and `biomes` the finer biome
 * per cell, both indexed `y * size + x`. `roads` starts empty.
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
  return {
    size,
    cells,
    biomes,
    elevation: field.elevation,
    rivers: network,
    roads: new ArmNetwork(),
  };
}

/**
 * Turn classified terrain into tiles. Each cell gets a random variant of its
 * biome, or of its terrain class where a later step changed the class, plus
 * its shoreline, river, and road overlays. The shoreline draws under the
 * channel, so a river drains through the beach into the water, and the
 * channel draws under the road. Where a road crosses a river, the bridge
 * piece draws in place of both, or the ford piece for a crossing in
 * `fords`. Cells in `bare` get no overlay, because a marker covers them and
 * an overlay would draw over its art.
 * @param {TilePalette} palette
 * @param {Pick<WildTerrain, 'size' | 'cells' | 'rivers' | 'roads'> & {
 *   biomes?: string[],
 *   fords?: ReadonlySet<string>,
 * }} terrain the town generator passes no biomes, so each cell draws its class
 * @param {() => number} rng
 * @param {ReadonlySet<string>} [bare] tile ids that take no overlay
 * @returns {Tile[]}
 */
export function terrainTiles(palette, terrain, rng, bare = new Set()) {
  const { size, cells, biomes, fords, rivers, roads } = terrain;
  const coast = coastOverlays(cells, size, size);
  const channel = rivers.pieces();
  const paths = roads.pieces();
  /** @type {Tile[]} */
  const tiles = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = tileIdAt(x, y);
      const type = cells[y * size + x];
      const biome = biomes?.[y * size + x];
      const art = biome && BIOME_TERRAIN[biome] === type ? biome : type;
      const base = palette.pickVariant(art, rng).imageRef;
      if (bare.has(id)) {
        tiles.push(createTile(id, base));
        continue;
      }
      const crossing = paths.has(id) ? bridgeAt(rivers, x, y) : null;
      const bridge = crossing && fords?.has(id) ? crossing.replace('bridge', 'ford') : crossing;
      const shore = coast.get(id);
      const river = bridge ?? channel.get(id);
      const road = bridge ? undefined : paths.get(id);
      const refs = [
        shore && palette.getCoastPiece(shore),
        river && palette.getRiverPiece(river),
        road && palette.getRoadPiece(road),
      ]
        .filter((piece) => piece)
        .map((piece) => /** @type {{ imageRef: string }} */ (piece).imageRef);
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
 * landmark then prefers a cell beside the terrain or the road it belongs
 * to. A map with no free grass, such as a desert, still gets its landmarks
 * on other open ground, where the grass under the marker reads as a
 * clearing. A landmark with a need that no free cell meets, or with no art
 * in the palette, gives its turn to the next landmark in the order.
 * Landmarks keep at least three cells from each other and from every marker
 * already on the map, such as a settlement.
 * @param {TilePalette} palette
 * @param {WildTerrain} terrain
 * @param {Tile[]} tiles
 * @param {number} count
 * @param {() => number} rng
 * @returns {string[]} the tile ids that got a landmark
 */
export function placeLandmarks(palette, terrain, tiles, count, rng) {
  const { size, cells, roads } = terrain;
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
  const placed = tiles
    .filter((t) => t.metadata.poiType)
    .map((t) => /** @type {[number, number]} */ (t.id.split(',').map(Number)));
  const before = placed.length;
  /**
   * Put one landmark of `type` on its best free cell.
   * @param {string} type
   * @returns {boolean} whether the landmark found a cell
   */
  const placeOne = (type) => {
    const needs = LANDMARK_AFFINITY[type];
    const ref = palette.get(type)?.imageRef;
    if (!ref) return false;
    /** @type {{ x: number, y: number, score: number }[]} */
    const spots = [];
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (!free(x, y)) continue;
        if (placed.some(([px, py]) => Math.max(Math.abs(px - x), Math.abs(py - y)) < 3)) continue;
        if (needs.on && cells[y * size + x] !== needs.on) continue;
        if (needs.shore && countNear(cells, size, x, y, 2, 'water') < OPEN_WATER) continue;
        let score = cells[y * size + x] === 'grass' ? 2 : 0;
        if (needs.near?.some((t) => countNear(cells, size, x, y, 1, t))) score += 1;
        if (needs.road && ARMS.some(([, dx, dy]) => roads.has(x + dx, y + dy))) score += 1;
        spots.push({ x, y, score });
      }
    }
    if (!spots.length) return false;
    const best = Math.max(...spots.map((s) => s.score));
    const top = spots.filter((s) => s.score === best);
    const { x, y } = top[randInt(rng, top.length)];
    const tile = /** @type {Tile} */ (byId.get(tileIdAt(x, y)));
    tile.imageRef = ref;
    tile.metadata = { ...tile.metadata, poiType: 'landmark' };
    placed.push([x, y]);
    return true;
  };
  const order = shuffle(Object.keys(LANDMARK_AFFINITY), rng);
  let next = 0;
  for (let i = 0; i < count; i++) {
    let done = false;
    for (let tries = 0; tries < order.length && !done; tries++) {
      done = placeOne(order[next++ % order.length]);
    }
    if (!done) break;
  }
  return placed.slice(before).map(([x, y]) => tileIdAt(x, y));
}

/**
 * How many cells within `r` of (x, y), not counting (x, y), have terrain
 * `type`.
 * @param {string[]} cells @param {number} size @param {number} x @param {number} y
 * @param {number} r @param {string} type
 */
function countNear(cells, size, x, y, r, type) {
  let count = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < size && ny < size) {
        if (cells[ny * size + nx] === type) count++;
      }
    }
  }
  return count;
}
/**
 * The road crossings that draw as fords: each crossing farther than
 * FORD_DISTANCE from every town, where a track through the wild has no
 * bridge.
 * @param {WildTerrain} terrain @param {Site[]} sites
 * @returns {Set<string>}
 */
export function fordCrossings(terrain, sites) {
  const towns = sites.filter((s) => s.archetype === 'town');
  /** @type {Set<string>} */
  const fords = new Set();
  for (const id of terrain.roads.arms.keys()) {
    const [x, y] = id.split(',').map(Number);
    if (!terrain.rivers.has(x, y)) continue;
    if (towns.every((s) => Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) > FORD_DISTANCE)) {
      fords.add(id);
    }
  }
  return fords;
}

/**
 * Generate an open-terrain map for one of the climate archetypes:
 * wilderness, highlands, frontier, desert, wetlands, or island. The entry
 * is the border tile where the first road leaves the map. A map with no
 * road off the map, such as an island, enters at the bottom-center border
 * tile. `sites` lists the settlements, the keep, the dungeon, and each
 * cave entrance, mine, and ruin that drew its marker, each with the
 * sub-map it opens into. A mine and a cave entrance open into a cave, and a
 * ruin into a dungeon.
 * @param {TilePalette} palette
 * @param {number} size
 * @param {() => number} rng
 * @param {string} [archetype] a key of TERRAIN_PROFILES
 * @returns {{ tiles: Tile[], entry: string, sites: GeneratedSite[] }}
 */
export function generateWilds(palette, size, rng, archetype = 'wilderness') {
  const terrain = wildTerrain(size, archetype, rng);
  const sites = planSites(terrain, rng);
  plantFarmland(terrain, sites, rng);
  const { roads, exits } = connectSites(terrain, sites);
  terrain.roads = roads;
  const fords = fordCrossings(terrain, sites);
  const tiles = terrainTiles(
    palette,
    { ...terrain, fords },
    rng,
    new Set(sites.map((s) => s.tileId)),
  );
  const byId = tilesById(tiles);
  /** @type {GeneratedSite[]} */
  const maps = [];
  for (const site of sites) {
    const tile = /** @type {Tile} */ (byId.get(site.tileId));
    const ref = palette.get(site.marker)?.imageRef;
    if (!ref) continue;
    tile.imageRef = ref;
    tile.metadata = { ...tile.metadata, poiType: site.poi };
    maps.push(siteMap(site));
  }
  const landmarks = placeLandmarks(palette, terrain, tiles, clamp(Math.round(size / 7), 1), rng);
  for (const id of landmarks) {
    const ref = /** @type {Tile} */ (byId.get(id)).imageRef;
    const type = Object.keys(LANDMARK_MAPS).find((t) => palette.get(t)?.imageRef === ref);
    if (!type) continue;
    const inside = LANDMARK_MAPS[type];
    maps.push({
      tileIds: [id],
      archetype: inside,
      kind: 'interior',
      environ: inside,
      size: 'medium',
      label: type,
    });
  }
  const entry = exits[0] ?? tileIdAt(Math.floor(size / 2), size - 1);
  return { tiles, entry, sites: maps };
}
