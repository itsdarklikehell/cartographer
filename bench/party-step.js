/**
 * The pure cost of Play-mode party steps, shared by the scale table and the
 * commit check.
 *
 * One step is the fog reveal around the new tile plus every derived value
 * that the next frame and the screen-reader description read: the region
 * groups, their name slots, outlines and image chunks, the revealed-id set,
 * the span blocks, and the node description. The region caches key on tile
 * stamps, so a step that only flips fog finds them warm. A cache that keys on
 * the node itself rebuilds on every step, and this walk shows that cost.
 */

import { revealAround } from '../src/map/FogOfWar.js';
import { findRegionGroups, groupImageChunks } from '../src/map/RegionGroups.js';
import { groupOutline, regionSlots } from '../src/map/RegionOutline.js';
import { spanBlocks } from '../src/map/TilePaint.js';
import { describeNode } from '../src/map/MapDescription.js';
import { tileIdAt } from '../src/map/MapGeometry.js';

/** @typedef {import('../src/types/map.js').MapNode} MapNode */

/**
 * The tile ids of a walk along the middle row of a node, one per step. The
 * row starts and ends two cells from the edges, so each step reveals new
 * cells on a mostly fogged node.
 * @param {MapNode} node
 * @returns {string[]}
 */
export function partyPath(node) {
  const y = node.height >> 1;
  const path = [];
  for (let x = 2; x < node.width - 2; x++) path.push(tileIdAt(x, y));
  return path;
}

/**
 * Walk the party along a path from `node`, doing the work of each step.
 * The walk always starts from `node`, so every run reveals the same cells.
 * @param {MapNode} node
 * @param {string[]} path
 * @returns {MapNode} the node after the last step
 */
export function walkParty(node, path) {
  let current = node;
  for (const tileId of path) {
    current = revealAround(current, tileId, 2);
    const groups = findRegionGroups(current);
    regionSlots(groups);
    for (const group of groups) {
      groupOutline(group);
      groupImageChunks(current, group);
    }
    const revealed = new Set();
    for (const tile of current.tiles) if (tile.revealed) revealed.add(tile.id);
    spanBlocks(current);
    describeNode(current, { nodeId: current.id, tileId }, { markerVisible: () => true });
  }
  return current;
}
