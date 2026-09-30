/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Minutes that one step across a tile costs, by how deep the map sits in the
 * world tree. A world map tile covers a whole region, so a step across it
 * takes a watch. A region map tile covers about a mile and a half of ground,
 * which takes half an hour on foot at the 5e normal pace of 3 miles an hour.
 * A deeper outdoor map, such as a town or the grounds of a site, costs one
 * minute a tile, and a step inside a building costs nothing.
 * @type {readonly number[]}
 */
export const MINUTES_PER_STEP = Object.freeze([240, 30, 1]);

/**
 * The minutes a walk of `steps` tiles takes on a map.
 * @param {MapNode} node
 * @param {number} depth the node's depth in the world tree: 0 for the root
 * @param {number} steps
 * @returns {number}
 */
export function travelMinutes(node, depth, steps) {
  if (node.kind === 'interior' || steps <= 0) return 0;
  const perStep = MINUTES_PER_STEP[Math.min(depth, MINUTES_PER_STEP.length - 1)];
  return perStep * steps;
}
