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
 * @property {Rect[]} [occluders] rects in buffer px that HTML over the canvas covers
 */

/** A rect in buffer px. */
/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

/** The band's rect in buffer px, with the type size its label is drawn at. */
/** @typedef {{ x: number, y: number, w: number, h: number, fontSize: number }} ExitBand */

/** The clear space between a band and the canvas edge or an occluder, in buffer px. */
const BAND_INSET = 8;

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
 * @property {Rect[]} [occluders]
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
    occluders: view.occluders ?? [],
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
  const placed = avoidOccluders(
    {
      x: clampToCanvas(x, w, geom.canvasWidth),
      y: clampToCanvas(y, h, geom.canvasHeight),
      w,
      h,
    },
    side,
    geom,
  );
  return { ...placed, fontSize };
}

/**
 * Keep one coordinate of a band on the canvas, `BAND_INSET` from each edge.
 * @param {number} p
 * @param {number} size band extent on that axis
 * @param {number} canvasSize
 */
function clampToCanvas(p, size, canvasSize) {
  return clamp(p, BAND_INSET, Math.max(BAND_INSET, canvasSize - size - BAND_INSET));
}

/**
 * Whether two rects overlap, with `BAND_INSET` of clear space required
 * between them.
 * @param {Rect} a
 * @param {Rect} b
 */
function overlaps(a, b) {
  return (
    a.x < b.x + b.w + BAND_INSET &&
    b.x < a.x + a.w + BAND_INSET &&
    a.y < b.y + b.h + BAND_INSET &&
    b.y < a.y + a.h + BAND_INSET
  );
}

/**
 * Move a band off the HTML that sits over the canvas, such as the mini-map.
 * A click on that HTML never reaches the canvas, so a band under it can be
 * seen in part but not clicked. The band slides along its own side, which
 * keeps it beside the border it leads off. Each occluder offers two places,
 * one just before it and one just past it on that axis. The band takes the
 * nearest place that is on the canvas and clear of every occluder. When no
 * place is clear, as on a canvas too small for both, the band stays where
 * it is. This is a pure function.
 * @param {Rect} band
 * @param {ExitSide} side
 * @param {ExitBandGeometry} geom
 * @returns {Rect}
 */
export function avoidOccluders(band, side, geom) {
  const occluders = geom.occluders ?? [];
  if (!occluders.some((o) => overlaps(band, o))) return band;
  const horizontal = sideAxis(side) === 'x';
  /** @type {Rect | null} */
  let best = null;
  for (const o of occluders) {
    const places = horizontal
      ? [o.x - band.w - BAND_INSET, o.x + o.w + BAND_INSET].map((x) => ({
          ...band,
          x: clampToCanvas(x, band.w, geom.canvasWidth),
        }))
      : [o.y - band.h - BAND_INSET, o.y + o.h + BAND_INSET].map((y) => ({
          ...band,
          y: clampToCanvas(y, band.h, geom.canvasHeight),
        }));
    for (const place of places) {
      if (occluders.some((other) => overlaps(place, other))) continue;
      const shift = Math.abs(place.x - band.x) + Math.abs(place.y - band.y);
      if (!best || shift < Math.abs(best.x - band.x) + Math.abs(best.y - band.y)) best = place;
    }
  }
  return best ?? band;
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
