import { labelSize } from './CanvasText.js';

/** @typedef {import('./ExitBands.js').Rect} Rect */

/**
 * Coordinate digits run large: they label a whole row or column, and they draw
 * on empty canvas or a plate rather than over tile art, so they take a high cap.
 * The bounds are in CSS px.
 */
export const COORD_SCALE = { factor: 0.3, min: 14, max: 42 };

/** Tiles smaller than this, in buffer px, draw no coordinate digits. */
const MIN_LABELLED_TILE = 20;

/**
 * The view fields that place the coordinate labels.
 * @typedef {Object} CoordView
 * @property {{ width: number, height: number } | null} node
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {number} [pixelRatio]
 * @property {Rect[]} [occluders] rects in buffer px of the HTML over the canvas
 */

/**
 * Where the coordinate labels draw. `colY` is the centre line of the column
 * digits and `rowX` the centre line of the row digits. A label pins to the
 * canvas edge when its map edge scrolls out of view. `columns` and `rows`
 * are the rects the two label runs cover on the canvas, in buffer px, or
 * null when that run is off the canvas. `strips` lists the ones present, so
 * an exit band can keep off them.
 * @typedef {{
 *   size: number,
 *   fontSize: number,
 *   colY: number,
 *   rowX: number,
 *   colPinned: boolean,
 *   rowPinned: boolean,
 *   columns: Rect | null,
 *   rows: Rect | null,
 *   strips: Rect[],
 * }} CoordLayout
 */

/**
 * Lay out the coordinate labels of a view, or return null when the tiles are
 * too small to label. The renderer draws from this layout and the exit bands
 * avoid its strips, so a band never covers a digit that is drawn.
 * @param {CoordView} view
 * @param {number} tileSize base tile size in buffer px at scale 1
 * @returns {CoordLayout | null}
 */
export function coordLabelLayout(view, tileSize) {
  const node = view.node;
  if (!node) return null;
  const size = tileSize * view.scale;
  if (size < MIN_LABELLED_TILE) return null;
  const fontSize = labelSize(size, COORD_SCALE, view.pixelRatio);
  const pad = fontSize * 0.9;
  // The plate of a digit reaches 0.6 of the font size past its centre line,
  // and a row label is as wide as its longest number.
  const half = fontSize * 0.6;
  const digits = String(node.height).length;
  const rowHalf = (digits * fontSize * 0.6) / 2 + fontSize * 0.25;
  const left = Math.max(0, view.offsetX);
  const top = Math.max(0, view.offsetY);
  const right = Math.min(view.canvasWidth, view.offsetX + node.width * size);
  const bottom = Math.min(view.canvasHeight, view.offsetY + node.height * size);
  let colPinned = view.offsetY - pad < pad;
  let colY = colPinned ? pad : view.offsetY - pad;
  let rowPinned = view.offsetX - pad < pad;
  let rowX = rowPinned ? pad : view.offsetX - pad;
  // HTML over the canvas hides a digit drawn under it. A wide box, such as
  // the zoom toolbar, moves the whole column run below it, and a tall box,
  // such as the mini-map, moves the whole row run right of it. The boxes go
  // in order of their far edge, so a run that moves past one box is tested
  // against the next.
  const boxes = view.occluders ?? [];
  for (const o of [...boxes].sort((a, b) => a.y + a.h - (b.y + b.h))) {
    if (o.w <= o.h || !(o.x < right && left < o.x + o.w)) continue;
    if (colY - half < o.y + o.h && o.y < colY + half) {
      colY = o.y + o.h + half;
      colPinned = true;
    }
  }
  for (const o of [...boxes].sort((a, b) => a.x + a.w - (b.x + b.w))) {
    if (o.w > o.h || !(o.y < bottom && top < o.y + o.h)) continue;
    if (rowX - rowHalf < o.x + o.w && o.x < rowX + rowHalf) {
      rowX = o.x + o.w + rowHalf;
      rowPinned = true;
    }
  }
  const columns = right > left ? { x: left, y: colY - half, w: right - left, h: half * 2 } : null;
  const rows = bottom > top ? { x: rowX - rowHalf, y: top, w: rowHalf * 2, h: bottom - top } : null;
  const strips = [columns, rows].filter((r) => r !== null);
  return { size, fontSize, colY, rowX, colPinned, rowPinned, columns, rows, strips };
}
