import { generateNodeTiles, STACKED_ARCHETYPES } from './MapGenerator.js';
import { placeName } from './GeneratorNames.js';
import { randInt } from './GeneratorRandom.js';
import { mulberry32 } from '../util/Rng.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').NodeKind} NodeKind */
/** @typedef {import('./MapGenerator.js').GenerateOptions} GenerateOptions */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * Nested generation: one generated map, plus the sub-maps that its places
 * open into, plus theirs, down to a chosen depth. A wilderness opens into
 * its towns, keep, dungeon, and caves, a town into its buildings, and a
 * world into its regions. Each sub-map draws from its own RNG, seeded from
 * the seed of its parent and the index of its site, so the top map is the
 * same map with or without its sub-maps, and the Generate preview shows the
 * map that the GM gets.
 */

/**
 * The most sub-maps that one generation creates past the forced ones. A
 * vast world opened all the way down holds 226 to 276 maps (seeds 1 to 5).
 * Its packed save is about 0.5 MiB of text, and localStorage stores two
 * bytes per character, so it adds about 1 MiB against the 3 MiB warning of
 * `SaveManager.QUOTA_WARN_BYTES`. The forced sub-maps do not count against
 * the budget, because their tiles already lead down.
 * `MapGenerator.MAX_LEVELS` limits each stack of dungeon or cave levels
 * instead.
 */
export const SUBMAP_BUDGET = 300;

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   kind: NodeKind,
 *   environ: string | null,
 *   archetype: string,
 *   size: string,
 *   levels?: number,
 *   level?: number,
 *   base?: string,
 * }} TreeRoot
 * The node being generated and the choice for it. `level` is the number of
 * the node in its stack of levels (see `generateNodeTiles`). `base` is the
 * name that the forced sub-maps of the node add their labels to, and it
 * defaults to `name`.
 */

/**
 * @typedef {{
 *   id: string,
 *   parentId: string | null,
 *   name: string,
 *   kind: NodeKind,
 *   environ: string | null,
 *   width: number,
 *   height: number,
 *   tiles: Tile[],
 *   entry: string,
 * }} TreeNode
 */

/**
 * The seed of the sub-map at `index` among the sites of the map with
 * `seed`. The bits of both mix, so near seeds and near indexes give
 * unrelated maps.
 * @param {number} seed @param {number} index
 * @returns {number}
 */
export function childSeed(seed, index) {
  let h = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(index + 1, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * Generate a map and its sub-maps, breadth first, so every place one level
 * down gets its map before any place two levels down. `depth` is how many
 * levels of sub-maps to build: 0 builds the map alone. A forced site, such
 * as the stairs down of a dungeon level or the trapdoor of a building,
 * always gets its sub-map at the same depth as its parent, because its tile
 * already leads down. Past the forced ones, the generation stops at
 * `budget` sub-maps, and `skipped` counts the places within the depth that
 * got no map. A place with no map keeps its marker and no link.
 *
 * Each sub-map gets a name from `GeneratorNames.placeName`, and a dungeon
 * or a cave gets one to three levels, both drawn from its own RNG before
 * its tiles. A forced sub-map takes the name of the map at the top of its
 * stack, with its label, for example "Ashford Barrow (level 2)". The link
 * tiles of each site get the new node id as their `childNodeId`.
 *
 * `makeId` supplies node ids, and the tree also refuses an id it has
 * already handed out, so the ids of one batch never clash. `rng` is the RNG
 * of the top map after its tiles, for the entrance art that the caller
 * draws next.
 * @param {TilePalette} palette
 * @param {TreeRoot} root
 * @param {{ seed: number, depth: number, budget?: number }} options
 * @param {() => string} makeId
 * @returns {{ nodes: TreeNode[], skipped: number, rng: () => number }}
 *   `nodes` starts with the top map, and every parent comes before its children
 */
export function expandTree(palette, root, { seed, depth, budget = SUBMAP_BUDGET }, makeId) {
  const used = new Set([root.id]);
  const freshId = () => {
    let id;
    do id = makeId();
    while (used.has(id));
    used.add(id);
    return id;
  };
  const rng = mulberry32(seed);
  const queue = [
    {
      id: root.id,
      parentId: /** @type {string | null} */ (null),
      name: root.name,
      base: root.base ?? root.name,
      kind: root.kind,
      environ: root.environ,
      /** @type {GenerateOptions} */
      spec: {
        archetype: root.archetype,
        size: root.size,
        levels: root.levels,
        level: root.level,
        environ: root.environ ?? undefined,
      },
      seed,
      generation: 0,
      rng,
    },
  ];
  /** @type {TreeNode[]} */
  const nodes = [];
  let created = 0;
  let skipped = 0;
  for (let q = 0; q < queue.length; q++) {
    const item = queue[q];
    const gen = generateNodeTiles(palette, item.spec, item.rng);
    const tiles = [...gen.tiles];
    const index = new Map(tiles.map((t, i) => [t.id, i]));
    gen.sites.forEach((site, i) => {
      const generation = item.generation + (site.forced ? 0 : 1);
      if (!site.forced && generation > depth) return;
      if (!site.forced && created >= budget) {
        skipped++;
        return;
      }
      const id = freshId();
      created++;
      const childRng = mulberry32(childSeed(item.seed, i));
      const name = site.forced ? `${item.base} (${site.label})` : placeName(site, childRng);
      const stacked = STACKED_ARCHETYPES.includes(site.archetype);
      const levels = site.levels ?? (stacked ? 1 + randInt(childRng, 3) : 1);
      for (const tileId of site.tileIds) {
        const at = /** @type {number} */ (index.get(tileId));
        tiles[at] = { ...tiles[at], childNodeId: id };
      }
      queue.push({
        id,
        parentId: item.id,
        name,
        base: site.forced ? item.base : name,
        kind: site.kind,
        environ: site.environ,
        spec: {
          archetype: site.archetype,
          size: site.size,
          levels,
          level: site.level,
          environ: site.environ,
        },
        seed: childSeed(item.seed, i),
        generation,
        rng: childRng,
      });
    });
    nodes.push({
      id: item.id,
      parentId: item.parentId,
      name: item.name,
      kind: item.kind,
      environ: item.environ,
      width: gen.width,
      height: gen.height,
      tiles,
      entry: gen.entry,
    });
  }
  return { nodes, skipped, rng };
}
