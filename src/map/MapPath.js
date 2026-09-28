import { NEIGHBORS4, parseCoords } from './MapGeometry.js';
import { tileAtXY } from './TileIndex.js';
import { isBlocked } from './TileKinds.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * Whether the party can walk on a tile during a move. A wall or an obstacle
 * (`TileKinds.isBlocked`) stops a walk. With `revealedOnly`, a fogged tile
 * stops it too, so a player cannot learn from a move whether a way through
 * the fog exists.
 * @param {Tile} tile
 * @param {boolean} revealedOnly
 * @returns {boolean}
 */
export function isPassable(tile, revealedOnly) {
  return !isBlocked(tile) && (!revealedOnly || tile.revealed);
}

/**
 * Whether a walk leads from one tile of a node to another. The walk steps to
 * the four side neighbours only, so it cannot slip between two wall pieces
 * that touch at a corner. Each step goes onto a tile that `isPassable`
 * accepts or onto an empty cell. An empty cell lets the walk through, so a
 * move across a gap in a sparse hand-painted map needs no confirm dialog.
 * With `revealedOnly`, an empty cell stops the walk, because fog gives an
 * empty cell no revealed state and a player walk goes through revealed
 * tiles only. The start tile needs no check, so a party that stands on a
 * wall (for example after the GM paints one under it) can still walk off.
 * The target tile needs the check, so no walk ends on a wall. A start or
 * target id that is not a tile of the node gives false, and a walk to the
 * start tile itself gives true.
 * @param {MapNode} node
 * @param {string} fromId
 * @param {string} toId
 * @param {{ revealedOnly?: boolean }} [options]
 * @returns {boolean}
 */
export function hasOpenPath(node, fromId, toId, options = {}) {
  const revealedOnly = options.revealedOnly ?? false;
  const from = parseCoords(fromId);
  const to = parseCoords(toId);
  if (!from || !to || !tileAtXY(node, from.x, from.y)) return false;
  if (fromId === toId) return true;
  const target = tileAtXY(node, to.x, to.y);
  if (!target || !isPassable(target, revealedOnly)) return false;
  const seen = new Set([from.y * node.width + from.x]);
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const at = queue[q];
    for (const [dx, dy] of NEIGHBORS4) {
      const x = at.x + dx;
      const y = at.y + dy;
      if (x === to.x && y === to.y) return true;
      const key = y * node.width + x;
      if (x < 0 || y < 0 || x >= node.width || y >= node.height || seen.has(key)) continue;
      seen.add(key);
      const tile = tileAtXY(node, x, y);
      if (tile ? isPassable(tile, revealedOnly) : !revealedOnly) queue.push({ x, y });
    }
  }
  return false;
}
