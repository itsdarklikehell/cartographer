/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * The name of a node with the name of its parent after a comma, as in
 * "Temple, Ashogate". A generated world has many places with one name, so a
 * list of places that shows only the name gives the GM no way to tell them
 * apart. A root, or a node whose parent is missing from the list, keeps its
 * plain name.
 * @param {MapNode} node
 * @param {ReadonlyMap<string, MapNode>} byId every node by id
 * @returns {string}
 */
export function placeLabel(node, byId) {
  const parent = node.parentId === null ? undefined : byId.get(node.parentId);
  return parent ? `${node.name}, ${parent.name}` : node.name;
}

/**
 * The place label of every node in the list, by node id.
 * @param {MapNode[]} nodes
 * @returns {Map<string, string>}
 */
export function placeLabels(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return new Map(nodes.map((n) => [n.id, placeLabel(n, byId)]));
}
