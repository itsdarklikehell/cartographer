import { blockRect, cellEdge, newBlockRect, parseCoords } from './MapGeometry.js';
import { groupOutline, regionSlots } from './RegionOutline.js';
import { INK } from './CanvasInk.js';
import { drawPlatedLabel, labelFont } from './CanvasText.js';
import { labelSpots, placeLabels } from './RegionLabels.js';

/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */
/** @typedef {import('./MapRenderer.js').MapView} MapView */
/** @typedef {import('./RegionLabels.js').LabelSpot} LabelSpot */

/** The font size of a region name, in CSS pixels. */
const REGION_LABEL_PX = 12;

/**
 * Draw the region overlays of the node in view: a tint over each region's
 * cells, a border along its outline, and its name. Each region takes the
 * color of its `regionSlots` slot, so two regions that share a border show
 * two colors. The tint and the border are clipped to the region's cells, and
 * in Play mode to the cells the party has revealed, so a region never shows
 * its extent through the fog. The border line is twice its drawn width and
 * centered on the cell edge, and the clip keeps only the inner half. Two
 * regions that touch then each draw their own color on their own side of
 * the shared edge. Outside Build mode, a region with no revealed cell draws
 * nothing, so the world map does not show where each unexplored region is.
 * @param {CanvasRenderingContext2D} ctx
 * @param {MapView} view
 * @param {import('./TileIndex.js').RevealedIds | null} revealedIds the revealed tile ids, or null in Build mode
 * @param {number} tileSize base tile size in buffer px at scale 1
 * @param {((nodeId: string) => string | undefined) | undefined} getNodeName
 * @param {string[]} [blockedIds] tiles with a token or marker, which no name plate covers
 */
export function renderRegionOverlays(
  ctx,
  view,
  revealedIds,
  tileSize,
  getNodeName,
  blockedIds = [],
) {
  if (!view.node || view.regionGroups.length === 0) return;
  const size = tileSize * view.scale;
  // The view's groups, not the groups of view.node. During a stroke the
  // canvas keeps the groups from before the stroke, and a region paint
  // stroke gives view.node new links on every cell.
  const slots = regionSlots(view.regionGroups);
  const rect = newBlockRect();
  const px = view.pixelRatio ?? 1;
  for (const group of view.regionGroups) {
    blockRect(rect, group, view, size);
    if (!rect.visible) continue;
    const clip = new Path2D();
    let any = false;
    for (let i = 0; i < group.tileIds.length; i++) {
      if (revealedIds && !revealedIds.has(group.tileIds[i])) continue;
      const cell = group.cells[i];
      const cx = cellEdge(cell.x, size, view.offsetX);
      const cy = cellEdge(cell.y, size, view.offsetY);
      clip.rect(
        cx,
        cy,
        cellEdge(cell.x + 1, size, view.offsetX) - cx,
        cellEdge(cell.y + 1, size, view.offsetY) - cy,
      );
      any = true;
    }
    if (!any) continue;
    const hue = INK.regionHues[(slots.get(group.childNodeId) ?? 0) % INK.regionHues.length];
    // The target of the Region brush draws its tint three times over and a
    // wider border, so its cells stand out from the other regions.
    const emphasis = group.childNodeId === view.highlightRegionId ? 3 : 1;

    ctx.save();
    ctx.clip(clip);
    ctx.fillStyle = hue.tint;
    for (let i = 0; i < emphasis; i++) ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    const outline = new Path2D();
    for (const e of groupOutline(group)) {
      outline.moveTo(cellEdge(e.x1, size, view.offsetX), cellEdge(e.y1, size, view.offsetY));
      outline.lineTo(cellEdge(e.x2, size, view.offsetX), cellEdge(e.y2, size, view.offsetY));
    }
    const width = Math.max(2, Math.min(4, size / 12)) * px * (emphasis > 1 ? 2 : 1);
    ctx.lineCap = 'square';
    ctx.strokeStyle = INK.regionRim;
    ctx.lineWidth = width * 2 + 2 * px;
    ctx.stroke(outline);
    ctx.strokeStyle = hue.border;
    ctx.lineWidth = width * 2;
    ctx.stroke(outline);
    ctx.restore();
  }
  renderRegionNames(ctx, view, revealedIds, size, getNodeName, blockedIds);
}

/**
 * Draw the name of each region, after every tint, so a later region's tint
 * never covers an earlier region's name. A name draws outside the region's
 * clip, so a long name on a small region reads in full. Its default spot is
 * the region's first cell in reading order. In Play mode that is the first
 * revealed cell, so the plate never sits in fog. `placeLabels` moves a name
 * that would overlap an earlier one to a later spot, or leaves it out until
 * a zoom makes room. A name also moves off a tile with the party token, a
 * character token, or a visible creature marker, often to the spot above
 * the region. The layout covers the regions out of view too, so a
 * name does not change spot when a pan moves another region off the canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {MapView} view
 * @param {import('./TileIndex.js').RevealedIds | null} revealedIds
 * @param {number} size the on-screen tile size in buffer px
 * @param {((nodeId: string) => string | undefined) | undefined} getNodeName
 * @param {string[]} blockedIds
 */
function renderRegionNames(ctx, view, revealedIds, size, getNodeName, blockedIds) {
  const node = view.node;
  if (!node || !getNodeName) return;
  const px = view.pixelRatio ?? 1;
  const fontSize = Math.round(REGION_LABEL_PX * px);
  const padX = 4 * px;
  const padY = 2 * px;
  const h = fontSize + padY * 2;
  /** @type {string[]} */
  const names = [];
  /** @type {number[]} */
  const widths = [];
  /** @type {LabelSpot[][]} */
  const spots = [];
  ctx.save();
  ctx.font = labelFont(fontSize, '400');
  for (const group of view.regionGroups) {
    const name = getNodeName(group.childNodeId);
    if (!name) continue;
    const cells = revealedIds
      ? group.cells.filter((_, i) => revealedIds.has(group.tileIds[i]))
      : group.cells;
    if (cells.length === 0) continue;
    names.push(name);
    widths.push(ctx.measureText(name).width + padX * 2);
    spots.push(labelSpots(cells, node.height));
  }
  ctx.restore();
  const boxes = placeLabels(
    spots,
    (i, spot) => {
      const y = cellEdge(spot.y, size, view.offsetY);
      return {
        x: cellEdge(spot.x, size, view.offsetX),
        y: spot.above ? y - h : y,
        w: widths[i],
        h,
      };
    },
    px,
    cellBoxes(blockedIds, view, size),
  );
  boxes.forEach((box, i) => {
    if (!box || box.x > view.canvasWidth || box.y > view.canvasHeight) return;
    if (box.x + box.w < 0 || box.y + box.h < 0) return;
    drawPlatedLabel(ctx, names[i], box.x + padX, box.y + padY, {
      fontSize,
      weight: '400',
      align: 'left',
      baseline: 'top',
      plate: 'rect',
      plateColor: INK.regionLabelPlate,
      color: INK.regionLabelText,
      padX,
      padY,
    });
  });
}

/**
 * The screen boxes of the listed tiles, for the label layout to keep clear.
 * @param {string[]} ids tile ids in "x,y" form
 * @param {MapView} view
 * @param {number} size the on-screen tile size in buffer px
 * @returns {import('./RegionLabels.js').LabelBox[]}
 */
export function cellBoxes(ids, view, size) {
  /** @type {import('./RegionLabels.js').LabelBox[]} */
  const boxes = [];
  for (const id of ids) {
    const c = parseCoords(id);
    if (!c) continue;
    const x = cellEdge(c.x, size, view.offsetX);
    const y = cellEdge(c.y, size, view.offsetY);
    const w = cellEdge(c.x + 1, size, view.offsetX) - x;
    boxes.push({ x, y, w, h: cellEdge(c.y + 1, size, view.offsetY) - y });
  }
  return boxes;
}
