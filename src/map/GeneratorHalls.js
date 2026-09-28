import { randInt } from './GeneratorRandom.js';
import { tileIdAt } from './MapGeometry.js';
import { DOOR_H, DOOR_V, FLOOR, maskTiles, tileStamper, WALL } from './GeneratorInteriorMask.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * The walled archetypes: castle and building. Both fill the whole grid with
 * a wall ring around a floored interior, with the entrance door in the
 * middle of the south wall. The interior splits into rooms by binary space
 * partition: a wall cuts a room in two, with one door in it, and each half
 * can split again. Every room then connects to the entrance through the
 * doors of the walls that made it.
 */

/**
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} Room
 * The floor cells of a room, corners inclusive.
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
 * Generate a castle keep: halls and chambers of at least three cells a
 * side. The stairs up sit in the top-left corner of the first room and the
 * stairs down in the top-right corner of the last room. The south door is
 * the entry that connects the keep to the parent map.
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
  return { tiles, entry };
}

/**
 * Generate the inside of one building, such as a house, a shop, or a
 * temple: a few small rooms of at least two cells a side, and no stairs.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string }}
 */
export function generateBuilding(palette, size, rng) {
  const { cells, entry } = hallLayout(size, rng, { minRoom: 2, maxDepth: 3 });
  return { tiles: maskTiles(palette, cells, size, rng), entry };
}
