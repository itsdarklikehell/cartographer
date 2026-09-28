import { randInt } from './GeneratorRandom.js';
import { tileIdAt } from './MapGeometry.js';
import {
  DOOR_H,
  DOOR_V,
  FLOOR,
  interiorRef,
  maskTiles,
  tileStamper,
  walkDistances,
  WALL,
} from './GeneratorInteriorMask.js';
import { dress, furnishHalls, furnisher } from './GeneratorFurnish.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('./GeneratorFurnish.js').Room} Room */

/**
 * The walled archetypes: castle and building. Both fill the whole grid with
 * a wall ring around a floored interior, with the entrance door in the
 * middle of the south wall. The interior splits into rooms by binary space
 * partition: a wall cuts a room in two, with one door in it, and each half
 * can split again. Every room then connects to the entrance through the
 * doors of the walls that made it.
 */

/**
 * @typedef {{ minRoom: number, maxDepth: number }} HallStyle
 * `minRoom` is the smallest room side, in cells. `maxDepth` limits how many
 * times a room splits. After the second split, each room also stops with a
 * chance of one in four, so room sizes vary.
 */

/**
 * Lay out a walled hall and split it into rooms.
 * @param {number} size @param {() => number} rng @param {HallStyle} style
 * @returns {{ cells: number[], rooms: Room[], entry: string }}
 */
export function hallLayout(size, rng, style) {
  const max = size - 1;
  /** @type {number[]} */
  const cells = Array.from({ length: size * size }, (_, i) => {
    const x = i % size;
    const y = Math.floor(i / size);
    return x === 0 || y === 0 || x === max || y === max ? WALL : FLOOR;
  });
  const doorX = Math.floor(size / 2);
  cells[max * size + doorX] = DOOR_H;
  /** @param {number} x @param {number} y */
  const isDoor = (x, y) => cells[y * size + x] === DOOR_H || cells[y * size + x] === DOOR_V;
  /** @type {Room[]} */
  const rooms = [];
  /** @param {Room} room @param {number} depth */
  const split = (room, depth) => {
    const { x0, y0, x1, y1 } = room;
    const stop = depth >= style.maxDepth || (depth >= 2 && rng() < 0.25);
    // A wall may not end beside a door in the wall around the room, because
    // it would block that door from one side.
    const across = [];
    for (let x = x0 + style.minRoom; x <= x1 - style.minRoom; x++) {
      if (!isDoor(x, y0 - 1) && !isDoor(x, y1 + 1)) across.push(x);
    }
    const down = [];
    for (let y = y0 + style.minRoom; y <= y1 - style.minRoom; y++) {
      if (!isDoor(x0 - 1, y) && !isDoor(x1 + 1, y)) down.push(y);
    }
    if (stop || (!across.length && !down.length)) {
      rooms.push(room);
      return;
    }
    // Cut the longer side, so rooms stay close to square.
    const w = x1 - x0;
    const h = y1 - y0;
    const vertical = !down.length || (across.length > 0 && (w > h || (w === h && rng() < 0.5)));
    if (vertical) {
      const x = across[randInt(rng, across.length)];
      for (let y = y0; y <= y1; y++) cells[y * size + x] = WALL;
      cells[(y0 + randInt(rng, y1 - y0 + 1)) * size + x] = DOOR_V;
      split({ x0, y0, x1: x - 1, y1 }, depth + 1);
      split({ x0: x + 1, y0, x1, y1 }, depth + 1);
    } else {
      const y = down[randInt(rng, down.length)];
      for (let x = x0; x <= x1; x++) cells[y * size + x] = WALL;
      cells[y * size + x0 + randInt(rng, x1 - x0 + 1)] = DOOR_H;
      split({ x0, y0, x1, y1: y - 1 }, depth + 1);
      split({ x0, y0: y + 1, x1, y1 }, depth + 1);
    }
  };
  split({ x0: 1, y0: 1, x1: max - 1, y1: max - 1 }, 0);
  return { cells, rooms, entry: tileIdAt(doorX, max) };
}

/**
 * Put the furnishings on a finished hall. The entrance door is the way in
 * that every open cell stays joined to.
 * @param {Tile[]} tiles @param {TilePalette} palette @param {number[]} cells
 * @param {number} size @param {() => number} rng @param {Room[]} rooms
 * @param {boolean} castle @param {number[]} reserved cell indexes of the stairs
 * @returns {Map<number, string>} the furnishing on each furnished cell
 */
function furnishHall(tiles, palette, cells, size, rng, rooms, castle, reserved) {
  const doorX = Math.floor(size / 2);
  const { place, placed } = furnisher(cells, size, [doorX, size - 1], new Set(reserved));
  furnishHalls(place, rng, rooms, { castle, entrance: [doorX, size - 2] });
  dress(tiles, palette, size, placed);
  return placed;
}

/**
 * Generate a castle keep: halls and chambers of at least three cells a
 * side. The stairs up sit in the top-left corner of the first room and the
 * stairs down in the top-right corner of the last room. The south door is
 * the entry that connects the keep to the parent map. The largest room is
 * the great hall, with a throne and pillars.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string }}
 */
export function generateCastle(palette, size, rng) {
  const { cells, rooms, entry } = hallLayout(size, rng, { minRoom: 3, maxDepth: 6 });
  const tiles = maskTiles(palette, cells, size, rng);
  const stamp = tileStamper(tiles, palette);
  const first = rooms[0];
  const last = rooms[rooms.length - 1];
  stamp(tileIdAt(first.x0, first.y0), 'stairs-up');
  stamp(tileIdAt(last.x1, last.y0), 'stairs-down');
  const stairs = [first.y0 * size + first.x0, last.y0 * size + last.x1];
  furnishHall(tiles, palette, cells, size, rng, rooms, true, stairs);
  return { tiles, entry };
}

/** The chance that a building has a cellar under a trapdoor. */
export const CELLAR_CHANCE = 0.3;

/**
 * Generate the inside of one building, such as a house, a shop, or a
 * temple: a few small rooms of at least two cells a side, and no stairs.
 * The room behind the entrance has a hearth and a table. A building has a
 * cellar with a chance of `CELLAR_CHANCE`. Its trapdoor goes on the bare
 * floor cell farthest from the entrance, and `stairsDown` names that tile,
 * so the caller can link it to the cellar level.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string, stairsDown: string | null }}
 */
export function generateBuilding(palette, size, rng) {
  const { cells, rooms, entry } = hallLayout(size, rng, { minRoom: 2, maxDepth: 3 });
  const tiles = maskTiles(palette, cells, size, rng);
  const placed = furnishHall(tiles, palette, cells, size, rng, rooms, false, []);
  if (rng() >= CELLAR_CHANCE) return { tiles, entry, stairsDown: null };
  const dist = walkDistances(cells, size, Math.floor(size / 2), size - 1);
  let at = -1;
  cells.forEach((code, i) => {
    if (code === FLOOR && !placed.has(i) && (at < 0 || dist[i] > dist[at])) at = i;
  });
  if (at < 0) return { tiles, entry, stairsDown: null };
  const stairsDown = tileIdAt(at % size, Math.floor(at / size));
  const tile = /** @type {Tile} */ (tiles.find((t) => t.id === stairsDown));
  tile.overlayRef = interiorRef(palette, 'trapdoor');
  return { tiles, entry, stairsDown };
}
