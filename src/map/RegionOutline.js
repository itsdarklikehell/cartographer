import { NEIGHBORS4, tileIdAt } from './MapGeometry.js';
import { memoizeByIdentity } from '../util/memoize.js';

/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/**
 * One cell edge of a region's outline, in grid units: the line from (x1, y1)
 * to (x2, y2) runs along a cell boundary.
 * @typedef {{ x1: number, y1: number, x2: number, y2: number }} OutlineEdge
 */

/** @type {WeakMap<RegionGroup, OutlineEdge[]>} */
const outlineCache = new WeakMap();

/**
 * The cell edges around a region group: each side of a member cell whose
 * neighbor on that side is not in the group. A painted region can have any
 * outline, and its bounding box covers cells of other regions, so the map
 * draws these edges and not the box. A hole in the group gets its own ring of
 * edges. The result is cached on the group object, which `findRegionGroups`
 * keeps for as long as the tile links of its node stay the same. Treat it as
 * read only.
 * @param {RegionGroup} group
 * @returns {OutlineEdge[]}
 */
export function groupOutline(group) {
  const cached = outlineCache.get(group);
  if (cached) return cached;
  const members = new Set(group.cells.map((c) => tileIdAt(c.x, c.y)));
  /** @type {OutlineEdge[]} */
  const edges = [];
  for (const { x, y } of group.cells) {
    for (const [dx, dy] of NEIGHBORS4) {
      if (members.has(tileIdAt(x + dx, y + dy))) continue;
      // The shared boundary with the neighbor at (x + dx, y + dy).
      if (dx === 0) {
        const edgeY = dy < 0 ? y : y + 1;
        edges.push({ x1: x, y1: edgeY, x2: x + 1, y2: edgeY });
      } else {
        const edgeX = dx < 0 ? x : x + 1;
        edges.push({ x1: edgeX, y1: y, x2: edgeX, y2: y + 1 });
      }
    }
  }
  outlineCache.set(group, edges);
  return edges;
}

/**
 * A color slot for each region on a node, keyed by child node id, so that two
 * regions that touch take different slots. The map draws a region in the
 * color of slot modulo its palette size, so two regions that share a border
 * read as two. Every block of one child takes the same slot. The pass takes
 * the region with the fewest neighbors left out of the map, one at a time,
 * and then gives the regions their slots in the reverse order, each the
 * lowest slot that its neighbors do not have. A map in which each region is
 * one block always has a region with five or fewer neighbors, so this order
 * needs at most six slots. Ties go to the lower id, so one layout always gets
 * the same colors. The result is memoized on the groups array that
 * `findRegionGroups` returns, which a fog reveal or a paint stroke keeps.
 * @param {RegionGroup[]} groups
 * @returns {Map<string, number>}
 */
export const regionSlots = memoizeByIdentity((/** @type {RegionGroup[]} */ groups) => {
  /** @type {Map<string, string>} */
  const owner = new Map();
  for (const group of groups) {
    for (const id of group.tileIds) owner.set(id, group.childNodeId);
  }
  /** @type {Map<string, Set<string>>} */
  const touches = new Map();
  for (const group of groups) {
    const near = touches.get(group.childNodeId) ?? new Set();
    touches.set(group.childNodeId, near);
    for (const { x, y } of group.cells) {
      for (const [dx, dy] of NEIGHBORS4) {
        const other = owner.get(tileIdAt(x + dx, y + dy));
        if (other && other !== group.childNodeId) near.add(other);
      }
    }
  }
  // Smallest-last order: take out the region with the fewest neighbors that
  // are still in, and put it on the front of the order.
  const left = new Set(touches.keys());
  /** @type {string[]} */
  const order = [];
  while (left.size) {
    let pick = '';
    let fewest = Infinity;
    for (const id of left) {
      let n = 0;
      for (const other of /** @type {Set<string>} */ (touches.get(id))) if (left.has(other)) n++;
      if (n < fewest || (n === fewest && id < pick)) {
        pick = id;
        fewest = n;
      }
    }
    left.delete(pick);
    order.unshift(pick);
  }
  /** @type {Map<string, number>} */
  const slots = new Map();
  for (const id of order) {
    const taken = new Set();
    for (const other of /** @type {Set<string>} */ (touches.get(id))) {
      const slot = slots.get(other);
      if (slot !== undefined) taken.add(slot);
    }
    let slot = 0;
    while (taken.has(slot)) slot++;
    slots.set(id, slot);
  }
  return slots;
});
