import { displayCoords, tileIdFromDisplay } from '../map/TileCoords.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */
/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/modal.js').FieldOption} FieldOption */
/** @typedef {import('../types/modal.js').ModalFormHandle} ModalFormHandle */

/**
 * The map choices of the location picker. A campaign can have more than a
 * hundred maps, and one flat list of breadcrumb paths is hard to scan. Each
 * map is listed by its own name, under an optgroup that names its parent by
 * the parent's full path. The walk is depth first, so a parent's group
 * comes before the groups of its children. The top-level maps come first,
 * with no group.
 * @param {MapNode[]} nodes in the grid's order
 * @param {(id: string) => string} pathOf the breadcrumb path of a node, for
 *   example "The Marches / Briarwick Vale"
 * @returns {FieldOption[]}
 */
export function locationOptions(nodes, pathOf) {
  const ids = new Set(nodes.map((n) => n.id));
  /** @type {Map<string | null, MapNode[]>} */
  const children = new Map();
  for (const node of nodes) {
    const parent = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  /** @type {FieldOption[]} */
  const options = (children.get(null) ?? []).map((n) => ({ value: n.id, label: n.name }));
  /** @param {MapNode} parent */
  const walk = (parent) => {
    const kids = children.get(parent.id) ?? [];
    const group = pathOf(parent.id);
    for (const kid of kids) options.push({ value: kid.id, label: kid.name, group });
    for (const kid of kids) walk(kid);
  };
  for (const root of children.get(null) ?? []) walk(root);
  return options;
}

/**
 * Modal fields for placing something on the map: a map picker (every node,
 * labelled by its breadcrumb path, plus an unplaced option) and the column
 * and row within the chosen node. The creature dialog and the bestiary
 * spawn dialog share this function, so every "put this at a location" flow
 * reads the same way.
 *
 * The column and row count from 1, the same as the numbers along the map
 * edge and the screen-reader description. The stored tile id counts from 0.
 * `readLocation` converts back, so a GM can copy a position straight from
 * the map into the dialog.
 * @param {AppContext} app
 * @param {EncounterLocation | null} location
 * @param {{ unplacedLabel?: string, partyButton?: boolean }} [options]
 *   `unplacedLabel` is the label for the null-location option. For example,
 *   "with the party" reads better than "unplaced" for a character.
 *   `partyButton` adds a "Move to the party" button, which
 *   `moveToPartyChange` handles.
 */
export function locationFields(app, location, options = {}) {
  // A location whose tile id is not a grid coordinate (for example, a
  // hand-edited save) opens the dialog at the top-left tile, not at NaN, NaN.
  const { column, row } = (location && displayCoords(location.tileId)) || { column: 1, row: 1 };
  return [
    {
      name: 'nodeId',
      label: 'Location (map)',
      type: /** @type {'select'} */ ('select'),
      value: location?.nodeId ?? '',
      options: [
        { value: '', label: options.unplacedLabel ?? 'Unplaced (appears everywhere)' },
        ...locationOptions([...app.grid.nodes.values()], (id) =>
          app.grid
            .getBreadcrumb(id)
            .map((b) => b.name)
            .join(' / '),
        ),
      ],
    },
    {
      name: 'tileX',
      label: 'Column',
      type: /** @type {'number'} */ ('number'),
      value: column,
      min: 1,
    },
    { name: 'tileY', label: 'Row', type: /** @type {'number'} */ ('number'), value: row, min: 1 },
    ...(options.partyButton
      ? [{ name: 'toParty', label: 'Move to the party', type: /** @type {'button'} */ ('button') }]
      : []),
  ];
}

/**
 * The `onChange` part of the "Move to the party" button: it writes the
 * party's map, column, and row into the placement fields. It answers true
 * when it handled the change, so a caller's own handler can skip it.
 * @param {AppContext} app
 * @returns {(name: string, form: ModalFormHandle) => boolean}
 */
export function moveToPartyChange(app) {
  return (name, form) => {
    if (name !== 'toParty') return false;
    const { nodeId, tileId } = app.partyTracker.getPosition();
    const { column, row } = displayCoords(tileId) ?? { column: 1, row: 1 };
    form.set('nodeId', nodeId);
    form.set('tileX', column);
    form.set('tileY', row);
    return true;
  };
}

/**
 * Read the placement fields back into a location. The typed column and row
 * count from 1, and the function clamps them to the chosen node's bounds
 * before it converts to the stored tile id. The unplaced option, or a
 * deleted node, yields null.
 * @param {AppContext} app
 * @param {Record<string, string>} values
 * @returns {EncounterLocation | null}
 */
export function readLocation(app, values) {
  const node = values.nodeId ? app.grid.getNode(values.nodeId) : undefined;
  if (!node) return null;
  const inBounds = (/** @type {string} */ raw, /** @type {number} */ size) =>
    clampInt(raw, 1, size);
  return {
    nodeId: node.id,
    tileId: tileIdFromDisplay(
      inBounds(values.tileX, node.width),
      inBounds(values.tileY, node.height),
    ),
  };
}
