/** @typedef {import('../ui/PalettePanel.js').Brush} Brush */

/** The id of the Build rail tab that shows the palette. */
export const PAINT_TAB = 'build-tab-paint';

/**
 * The brush that a stroke on the map uses. A brush paints only while the
 * Paint tab is open, so the GM can see which brush is active. On the Tile
 * and Encounters tabs, the map acts as Inspect. Without this rule, a drag on
 * the map paints with a brush whose panel is out of view.
 * @param {Brush} brush the brush picked in the palette
 * @param {string} tabId the id of the open Build rail tab
 * @returns {Brush}
 */
export function effectiveBrush(brush, tabId) {
  return tabId === PAINT_TAB ? brush : null;
}

/**
 * The text of the tool chip on the map toolbar. It names what a click on the
 * map does in Build mode.
 * @param {Brush} brush the effective brush (see `effectiveBrush`)
 * @param {string | null} regionName the region that the Region brush paints,
 *   or null for "No region"
 * @returns {string}
 */
export function toolChipLabel(brush, regionName) {
  if (brush === null) return 'Inspect';
  if (brush === 'erase') return 'Erasing tiles';
  if (brush === 'erase-path') return 'Erasing paths';
  if (brush === 'region') {
    return regionName ? `Painting: ${regionName} region` : 'Clearing region links';
  }
  return `Painting: ${brush.label}`;
}

/** @type {WeakMap<object, boolean>} blank state by node object */
const blankCache = new WeakMap();

/**
 * True when no cell of the node has tile art yet. A new map starts this way.
 * The answer is cached on the node object, because the map asks once per
 * drawn frame and a paint stroke makes a new node.
 * @param {{ tiles: ({ imageRef?: string | null } | null)[] }} node
 * @returns {boolean}
 */
export function isBlankMap(node) {
  let blank = blankCache.get(node);
  if (blank === undefined) {
    blank = !node.tiles.some((tile) => tile?.imageRef);
    blankCache.set(node, blank);
  }
  return blank;
}
