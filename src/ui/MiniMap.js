import { el } from './dom.js';
import { INK } from '../map/CanvasInk.js';
import { parseCoords } from '../map/MapGeometry.js';
import { compassArea, miniMapTileSize } from '../map/MiniMap.js';
import { groupOutline } from '../map/RegionOutline.js';
import { overlayList } from '../map/TileGrid.js';
import { imageSrcForRef } from '../map/TileRaster.js';
import { removeStored, writeStored } from '../storage/Footprint.js';

/** @typedef {import('../map/MiniMap.js').MiniMapView} MiniMapView */
/** @typedef {import('../types/map.js').MapNode} MapNode */

/** The longest side of the mini-map, in CSS pixels. */
const MAX_SIDE = 176;

/** localStorage key of the mini-map choice. Absent means shown. */
const HIDDEN_KEY = 'campaign-builder:minimap-hidden';

/**
 * Mount the mini-map: a small picture of the parent of the node in view,
 * pinned to the top-left corner of the map. It outlines the block of parent
 * cells that leads into the node and puts a dot where the party is. The
 * parent draws one small image per tile, so the picture costs one draw pass
 * per parent node object. A party step inside the node redraws only the
 * outline and the dot over a cached copy of that pass.
 *
 * The caller decides what to show through `getView` and `revealAll`, and
 * calls `update` after anything that can change either one. `toggle` shows
 * or hides the mini-map, and the choice persists per browser.
 * @param {HTMLElement} container
 * @param {{
 *   getView: () => MiniMapView | null,
 *   revealAll: () => boolean,
 * }} options
 * @returns {{ update: () => void, isOpen: () => boolean, toggle: () => void, element: HTMLElement }}
 */
export function mountMiniMap(container, options) {
  const canvas = el('canvas', 'minimap__canvas');
  canvas.setAttribute('role', 'img');
  // The canvas label already names the parent, so the caption is visual only.
  const caption = el('figcaption', 'minimap__caption');
  caption.setAttribute('aria-hidden', 'true');
  const root = el('figure', 'minimap', canvas, caption);
  root.hidden = true;
  container.appendChild(root);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  /** @type {Map<string, HTMLImageElement>} */
  const images = new Map();
  /** The terrain pass, reused while the parent object and the fog rule stay the same. */
  /** @type {{ parent: MapNode, revealAll: boolean, size: number, pixels: HTMLCanvasElement } | null} */
  let base = null;
  let loadPending = false;
  let open = localStorage.getItem(HIDDEN_KEY) !== '1';

  function toggle() {
    open = !open;
    if (open) removeStored(HIDDEN_KEY);
    else writeStored(HIDDEN_KEY, '1');
    update();
  }

  /**
   * The decoded image for a ref, or null while it loads. A load that
   * finishes drops the cached pass, so the next frame draws the real art.
   * @param {string} ref
   */
  function image(ref) {
    let img = images.get(ref);
    if (!img) {
      img = new Image();
      img.src = imageSrcForRef(ref);
      images.set(ref, img);
      img.addEventListener('load', scheduleRedraw, { once: true });
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  // Many tiles finish loading in the same frame. One redraw covers them all.
  function scheduleRedraw() {
    if (loadPending) return;
    loadPending = true;
    requestAnimationFrame(() => {
      loadPending = false;
      base = null;
      update();
    });
  }

  /**
   * Draw every tile of the parent at `size` device pixels. An unrevealed
   * tile draws as fog, the same as on the main map, so the mini-map shows a
   * player nothing the party has not seen.
   * @param {MapNode} parent
   * @param {number} size
   * @param {boolean} revealAll
   */
  function drawBase(parent, size, revealAll) {
    const pixels = document.createElement('canvas');
    pixels.width = parent.width * size;
    pixels.height = parent.height * size;
    const pctx = /** @type {CanvasRenderingContext2D} */ (pixels.getContext('2d'));
    pctx.fillStyle = INK.mapBackdrop;
    pctx.fillRect(0, 0, pixels.width, pixels.height);
    for (const tile of parent.tiles) {
      const at = parseCoords(tile.id);
      if (!at) continue;
      const x = at.x * size;
      const y = at.y * size;
      if (!revealAll && !tile.revealed) {
        pctx.fillStyle = INK.fog;
        pctx.fillRect(x, y, size, size);
        continue;
      }
      for (const ref of [tile.imageRef, ...overlayList(tile)]) {
        const img = ref ? image(ref) : null;
        if (img) pctx.drawImage(img, x, y, size, size);
        else if (ref === tile.imageRef) {
          pctx.fillStyle = INK.missingArt;
          pctx.fillRect(x, y, size, size);
        }
      }
    }
    return pixels;
  }

  /**
   * The outline of the block and the party dot, over the terrain.
   * @param {MiniMapView} view
   * @param {number} size
   */
  function drawMarks(view, size) {
    const line = 1.5 * (window.devicePixelRatio || 1);
    ctx.save();
    ctx.lineCap = 'square';
    // The dark rim under the gold line keeps the outline visible over bright terrain.
    ctx.beginPath();
    for (const edge of groupOutline(view.group)) {
      ctx.moveTo(edge.x1 * size, edge.y1 * size);
      ctx.lineTo(edge.x2 * size, edge.y2 * size);
    }
    ctx.lineWidth = line * 2.5;
    ctx.strokeStyle = INK.regionRim;
    ctx.stroke();
    ctx.lineWidth = line;
    ctx.strokeStyle = INK.goldLit;
    ctx.stroke();
    if (view.partyCell) {
      const { x, y } = view.partyCell;
      ctx.beginPath();
      ctx.arc(
        (x + 0.5) * size,
        (y + 0.5) * size,
        Math.max(line * 2.5, size * 0.45),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = INK.gold;
      ctx.fill();
      ctx.strokeStyle = INK.goldRim;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The screen-reader text of the picture.
   * @param {MiniMapView} view
   */
  function describe(view) {
    const { parent, partyCell } = view;
    if (!partyCell) return `Mini-map of ${parent.name}.`;
    return `Mini-map of ${parent.name}. The party is in the ${compassArea(partyCell, parent.width, parent.height)} of it.`;
  }

  function update() {
    const view = open ? options.getView() : null;
    root.hidden = !view;
    if (!view) return;
    const { parent } = view;
    const scale = window.devicePixelRatio || 1;
    const size = miniMapTileSize(parent.width, parent.height, MAX_SIDE * scale);
    const revealAll = options.revealAll();
    if (!base || base.parent !== parent || base.revealAll !== revealAll || base.size !== size) {
      base = { parent, revealAll, size, pixels: drawBase(parent, size, revealAll) };
    }
    const { pixels } = base;
    if (canvas.width !== pixels.width || canvas.height !== pixels.height) {
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      canvas.style.width = `${pixels.width / scale}px`;
    }
    ctx.drawImage(pixels, 0, 0);
    drawMarks(view, size);
    caption.textContent = parent.name;
    canvas.setAttribute('aria-label', describe(view));
  }

  return { update, isOpen: () => open, toggle, element: root };
}
