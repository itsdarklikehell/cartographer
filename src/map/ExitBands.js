import { parseCoords } from './MapGeometry.js';
import { labelSize } from './CanvasText.js';
import { exitLabel, sideAxis } from './MapExits.js';
import { clamp } from '../util/num.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').MapExit} MapExit */
/** @typedef {import('../types/map.js').ExitSide} ExitSide */

/**
 * An exit label rides inside its band, which is sized from the tile too, so the
 * label stays between the coordinate digits and a character name in weight.
 * The band's width is computed from this size, so the geometry and the drawing
 * both take it from here.
 */
const EXIT_LABEL_SCALE = { factor: 0.28, min: 12, max: 26 };

/**
 * The view geometry used to compute an exit band's rect. These fields match
 * what the renderer already keeps in its view snapshot. One extra field
 * gives the cell along the side the band centers on, the traveler's row
 * or column.
 * @typedef {Object} ExitBandGeometry
 * @property {number} width node width in tiles
 * @property {number} height node height in tiles
 * @property {number} tileSize base tile size in buffer px at scale 1
 * @property {number} offsetX pan offset in buffer px
 * @property {number} offsetY pan offset in buffer px
 * @property {number} scale zoom factor
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {number} alongCell cell index along the side to centre the band on
 */

/** The band's rect in buffer px, with the type size its label is drawn at. */
/** @typedef {{ x: number, y: number, w: number, h: number, fontSize: number }} ExitBand */

/**
 * The view state used to place an exit band: the pan, zoom, and canvas
 * fields from the renderer's view snapshot. The fields are named
 * structurally so this module has no canvas dependency.
 * @typedef {Object} ExitBandView
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {string | null} [partyTileId]
 */

/**
 * The geometry used to compute one edge exit's band, read from live view
 * state. The band tracks the traveler along the side it leads off: the
 * exit's own `along` when findExits knew the traveler's cell, and the
 * party's cell otherwise. An arrow beside the traveler shows the way out,
 * and stays on-screen on a long map while the traveler is on-screen. If no
 * one stands in the node, the band centers on the side instead.
 *
 * Both the renderer and the pointer build their geometry here. This makes
 * sure that the arrow the GM sees and the rect the click test uses can never
 * differ.
 * @param {MapNode} node node being drawn
 * @param {ExitBandView} view
 * @param {number} tileSize base tile size in buffer px at scale 1
 * @param {MapExit} exit
 * @returns {ExitBandGeometry}
 */
export function exitBandGeometry(node, view, tileSize, exit) {
  const side = exit.kind === 'edge' ? exit.side : 'north';
  const axis = sideAxis(side);
  const party = view.partyTileId ? parseCoords(view.partyTileId) : null;
  const extent = axis === 'x' ? node.width : node.height;
  const own = exit.kind === 'edge' ? exit.along : undefined;
  const alongCell =
    own ?? (party ? (axis === 'x' ? party.x : party.y) : Math.floor((extent - 1) / 2));
  return {
    width: node.width,
    height: node.height,
    tileSize,
    offsetX: view.offsetX,
    offsetY: view.offsetY,
    scale: view.scale,
    canvasWidth: view.canvasWidth,
    canvasHeight: view.canvasHeight,
    alongCell,
  };
}

/**
 * The rect an edge exit's arrow is drawn in, and clicked in. This is a
 * bounded pill, not a whole side of the gutter, because the click target
 * must match what the GM can see. An unbounded band catches every click
 * that missed the map. The rect sits just outside the map border, centered
 * on the traveler's cell along that side, and kept inside the canvas. If the GM pans the map edge out of view, the arrow stays
 * pinned at the viewport edge instead of scrolling away.
 *
 * This is pure geometry with no ctx parameter. The renderer draws this rect,
 * and the pointer hit-tests it, so the two cannot disagree about the
 * arrow's position. A band wider than its gutter is pushed over the map's
 * own tiles. For this reason, the pointer tests bands before it
 * resolves a cell, so the click always lands on what the GM can see. The
 * label width is estimated from the character count for the same reason,
 * because measureText ties the rect to a canvas.
 * @param {MapExit} exit
 * @param {ExitBandGeometry} geom
 * @returns {ExitBand}
 */
export function edgeExitBand(exit, geom) {
  const side = exit.kind === 'edge' ? exit.side : 'north';
  const size = geom.tileSize * geom.scale;
  const fontSize = labelSize(size, EXIT_LABEL_SCALE);
  const label = exitLabel(exit);
  // Leave room for the chevron, the gap after it, and the label at the
  // average glyph width of the sans-serif stack.
  const w = Math.min(
    Math.max(geom.canvasWidth - 16, 40),
    fontSize * 1.9 + label.length * fontSize * 0.54,
  );
  const h = Math.round(clamp(size * 0.8, 26, 46));
  // A gap of 0.55 of a cell clears the coordinate labels, which hang half a
  // cell off the top and left edges.
  const gap = Math.max(10, size * 0.55);
  const along = clamp(geom.alongCell, 0, Math.max(0, sideLength(geom, side) - 1));
  let x;
  let y;
  if (side === 'north' || side === 'south') {
    x = geom.offsetX + (along + 0.5) * size - w / 2;
    y = side === 'north' ? geom.offsetY - gap - h : geom.offsetY + geom.height * size + gap;
  } else {
    y = geom.offsetY + (along + 0.5) * size - h / 2;
    x = side === 'west' ? geom.offsetX - gap - w : geom.offsetX + geom.width * size + gap;
  }
  return {
    x: clamp(x, 8, Math.max(8, geom.canvasWidth - w - 8)),
    y: clamp(y, 8, Math.max(8, geom.canvasHeight - h - 8)),
    w,
    h,
    fontSize,
  };
}

/**
 * Whether a buffer-space point falls inside an exit's band.
 * @param {MapExit} exit
 * @param {ExitBandGeometry} geom
 * @param {number} bufferX
 * @param {number} bufferY
 * @returns {boolean}
 */
export function hitExitBand(exit, geom, bufferX, bufferY) {
  const band = edgeExitBand(exit, geom);
  return (
    bufferX >= band.x &&
    bufferX <= band.x + band.w &&
    bufferY >= band.y &&
    bufferY <= band.y + band.h
  );
}

/** @param {ExitBandGeometry} geom @param {ExitSide} side @returns {number} */
function sideLength(geom, side) {
  return sideAxis(side) === 'x' ? geom.width : geom.height;
}
