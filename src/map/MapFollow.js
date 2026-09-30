import { parseCoords } from './MapGeometry.js';

/** The part of the canvas, on each side, that the followed tile keeps clear of. */
export const FOLLOW_DEADZONE = 0.2;

/** The fewest tiles of room that follow keeps between the tile and the canvas edge. */
export const FOLLOW_MIN_TILES = 3;

/** How long follow waits after the last click on the canvas before it pans, in ms. */
export const FOLLOW_DELAY_MS = 600;

/**
 * The view fields that follow reads, in buffer px.
 * @typedef {{
 *   offsetX: number,
 *   offsetY: number,
 *   scale: number,
 *   tileSize: number,
 *   canvasWidth: number,
 *   canvasHeight: number,
 *   width: number,
 *   height: number,
 * }} FollowView
 */

/**
 * The new offset on one axis: the smallest pan that brings a tile at `p`
 * (its near edge, `size` long) inside the band `[margin, dim - margin]`.
 * An axis where the whole map fits the canvas never pans, so a small map
 * stays where the fit put it.
 * @param {number} offset
 * @param {number} p
 * @param {number} size
 * @param {number} dim canvas length
 * @param {number} extent map length in buffer px
 */
function axisOffset(offset, p, size, dim, extent) {
  if (extent <= dim) return offset;
  const margin = Math.min(
    Math.max(dim * FOLLOW_DEADZONE, size * FOLLOW_MIN_TILES),
    (dim - size) / 2,
  );
  if (p < margin) return offset + margin - p;
  if (p + size > dim - margin) return offset - (p + size - (dim - margin));
  return offset;
}

/**
 * The smallest pan that keeps a followed tile inside the deadzone of the
 * view: 20% of the canvas on each side, and at least three tiles. The zoom
 * never changes. A tile already inside the deadzone, or an id that is not a
 * grid coordinate, gives back the offsets of the view unchanged.
 * @param {FollowView} view
 * @param {string} tileId
 * @returns {{ offsetX: number, offsetY: number }}
 */
export function followOffset(view, tileId) {
  const { offsetX, offsetY } = view;
  const at = parseCoords(tileId);
  if (!at) return { offsetX, offsetY };
  const size = view.tileSize * view.scale;
  return {
    offsetX: axisOffset(offsetX, offsetX + at.x * size, size, view.canvasWidth, view.width * size),
    offsetY: axisOffset(
      offsetY,
      offsetY + at.y * size,
      size,
      view.canvasHeight,
      view.height * size,
    ),
  };
}

/**
 * Holds a follow pan back while the pointer is over the canvas, so the
 * tile under the pointer stays the same tile between two clicks. The pan
 * runs when the pointer leaves the canvas, or `FOLLOW_DELAY_MS` after the
 * last click. With the pointer elsewhere, it runs at once.
 */
export class FollowScheduler {
  /**
   * @param {HTMLElement} canvas
   * @param {() => void} apply runs the pan
   */
  constructor(canvas, apply) {
    this.apply = apply;
    this.inside = false;
    this.pending = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.timer = undefined;
    canvas.addEventListener('pointerenter', () => (this.inside = true));
    canvas.addEventListener('pointerleave', () => {
      this.inside = false;
      this.flush();
    });
    canvas.addEventListener('pointerdown', () => {
      if (this.pending) this.wait();
    });
  }

  /** Ask for a pan. */
  request() {
    this.pending = true;
    if (this.inside) this.wait();
    else this.flush();
  }

  /** Drop a pan that has not run, for example when the view is refitted. */
  cancel() {
    this.pending = false;
    clearTimeout(this.timer);
  }

  /** Restart the delay after a click. */
  wait() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), FOLLOW_DELAY_MS);
  }

  /** Run a pending pan now. */
  flush() {
    clearTimeout(this.timer);
    if (!this.pending) return;
    this.pending = false;
    this.apply();
  }
}
