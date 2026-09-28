import { blockRect, cellEdge, newBlockRect } from './MapGeometry.js';
import { groupOutline, regionSlots } from './RegionOutline.js';
import { INK } from './CanvasInk.js';
import { drawPlatedLabel } from './CanvasText.js';

/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */
/** @typedef {import('./MapRenderer.js').MapView} MapView */

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
 * @param {Set<string> | null} revealedIds the revealed tile ids, or null in Build mode
 * @param {number} tileSize base tile size in buffer px at scale 1
 * @param {((nodeId: string) => string | undefined) | undefined} getNodeName
 */
export function renderRegionOverlays(ctx, view, revealedIds, tileSize, getNodeName) {
  if (!view.node || view.regionGroups.length === 0) return;
  const size = tileSize * view.scale;
  const slots = regionSlots(view.node);
  const rect = newBlockRect();
  const px = view.pixelRatio ?? 1;
  for (const group of view.regionGroups) {
    blockRect(rect, group, view, size);
    if (!rect.visible) continue;
    const clip = new Path2D();
    /** @type {{ x: number, y: number } | null} */
    let first = null;
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
      if (!first || cell.y < first.y || (cell.y === first.y && cell.x < first.x)) first = cell;
    }
    if (!first) continue;
    const hue = INK.regionHues[(slots.get(group.childNodeId) ?? 0) % INK.regionHues.length];

    ctx.save();
    ctx.clip(clip);
    ctx.fillStyle = hue.tint;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    const outline = new Path2D();
    for (const e of groupOutline(group)) {
      outline.moveTo(cellEdge(e.x1, size, view.offsetX), cellEdge(e.y1, size, view.offsetY));
      outline.lineTo(cellEdge(e.x2, size, view.offsetX), cellEdge(e.y2, size, view.offsetY));
    }
    const width = Math.max(2, Math.min(4, size / 12)) * px;
    ctx.lineCap = 'square';
    ctx.strokeStyle = INK.regionRim;
    ctx.lineWidth = width * 2 + 2 * px;
    ctx.stroke(outline);
    ctx.strokeStyle = hue.border;
    ctx.lineWidth = width * 2;
    ctx.stroke(outline);
    ctx.restore();

    // The name draws outside the clip, from the region's first cell in
    // reading order, so a long name on a small region reads in full. In Play
    // mode that is the first revealed cell, so the plate never sits in fog.
    const name = getNodeName?.(group.childNodeId);
    if (!name) continue;
    const padX = 4 * px;
    const padY = 2 * px;
    drawPlatedLabel(
      ctx,
      name,
      cellEdge(first.x, size, view.offsetX) + padX,
      cellEdge(first.y, size, view.offsetY) + padY,
      {
        fontSize: Math.round(REGION_LABEL_PX * px),
        weight: '400',
        align: 'left',
        baseline: 'top',
        plate: 'rect',
        plateColor: INK.regionLabelPlate,
        color: INK.regionLabelText,
        padX,
        padY,
      },
    );
  }
}
