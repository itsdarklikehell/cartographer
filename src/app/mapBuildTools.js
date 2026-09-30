import {
  renderNodeToCanvas,
  downloadCanvasPNG,
  exportFilename,
  exportTileSize,
  EXPORT_TILE_SIZE,
} from '../map/MapExport.js';
import { findRegionGroups } from '../map/RegionGroups.js';
import { mustGetElement } from '../ui/dom.js';

/**
 * Wire the Build-rail map tools: stroke-level undo, and a fog-free PNG export
 * of the current node. These live in the Build rail, so only the GM in Build
 * mode sees them. A player never sees these tools.
 * @param {import('../types/app.js').AppContext} app
 * @param {import('./mapWiring.js').MapEnv} env
 * @param {() => void} undoStroke
 */
export function wireMapBuildTools(app, env, undoStroke) {
  const { grid, navigator, toasts } = app;
  mustGetElement('stroke-undo-btn').addEventListener('click', undoStroke);
  mustGetElement('export-png-btn').addEventListener('click', async () => {
    const node = navigator.getCurrentNode();
    // Browsers cap the area and the sides of a canvas. The render scales the
    // tiles down to fit, and refuses a node that cannot fit at any readable
    // size. The toast below names the size it settled on.
    const tileSize = exportTileSize(node);
    const canvas = await renderNodeToCanvas(node, {
      tileSize: EXPORT_TILE_SIZE,
      regionGroups: findRegionGroups(node),
      getNodeName: (id) => grid.getNode(id)?.name,
      imageCache: env.mapCanvas.renderer.imageCache,
    });
    if (!canvas) {
      toasts.show(`"${node.name}" is too large to export as PNG.`);
      return;
    }
    downloadCanvasPNG(canvas, exportFilename(node.name));
    toasts.show(
      tileSize < EXPORT_TILE_SIZE
        ? `Exported "${node.name}" as PNG at ${tileSize} pixels per tile. A larger image is past the limit of the browser.`
        : `Exported "${node.name}" as PNG.`,
    );
  });
}
