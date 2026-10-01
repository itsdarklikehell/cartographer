import { createMapAuthoring } from '../../src/app/mapAuthoring.js';
import { TileGrid, createMapNode, createTile } from '../../src/map/TileGrid.js';
import { MapNavigator } from '../../src/map/MapNavigator.js';
import { TilePalette } from '../../src/map/TilePalette.js';
import { fillTiles } from './grid.js';
import { stubApp } from './app.js';

/** @param {string} nodeId @param {string} tileId */
export const at = (nodeId, tileId) => ({ nodeId, tileId });

export const INTERIOR = 'assets/tiles/interior/interior';

/**
 * A one-node interior plus the recording app and env the authoring gestures
 * read. Every derived-state call a gesture makes appends its name to `calls`, so
 * a test asserts what a stroke settled rather than reaching into a canvas.
 */
export function authoring({ mode = 'build', scale = 1 } = {}) {
  const palette = new TilePalette();
  const grid = new TileGrid();
  grid.addNode(
    fillTiles(createMapNode('keep', 'Thornhold Keep', 'world', 4, 4, { kind: 'interior' }), (id) =>
      createTile(id, `${INTERIOR}-floor-1.svg`),
    ),
  );
  const navigator = new MapNavigator(grid, 'keep');

  /** @type {string[]} */
  const toastMessages = [];
  const partyTracker = /** @type {any} */ ({
    moveTo: (/** @type {string} */ nodeId, /** @type {string} */ tileId) => {
      partyTracker.position = { nodeId, tileId };
    },
    getPosition: () => partyTracker.position,
    position: { nodeId: 'keep', tileId: '0,0' },
    revealRadius: 1,
  });
  const app = stubApp({
    grid,
    navigator,
    partyTracker,
    palette,
    state: { mode },
    toasts: { show: (/** @type {string} */ message) => toastMessages.push(message) },
  });
  // The gestures record through the app as well as through the env below, so
  // one list holds a stroke's whole trail of derived-state calls.
  const calls = app.calls;
  /** @type {any[]} */
  const inspected = [];
  const env = /** @type {any} */ ({
    selectedTileId: null,
    activeBrush: { type: 'interior', imageRef: `${INTERIOR}-door-v.svg` },
    buildTab: 'build-tab-paint',
    fogTool: null,
    syncBuildTool: () => {},
    mapCanvas: {
      refreshNodeTiles: () => {},
      refreshNode: () => {},
      setNode: () => calls.push('setNode'),
      tileSize: 32,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    },
    inspector: { setTile: (/** @type {any} */ tile) => inspected.push(tile) },
    palettePanel: {
      getScale: () => scale,
      // The Region brush paints whichever child the picker names. `regions`
      // lists the children it offers.
      regionPicker: {
        target: /** @type {string | null} */ (null),
        regions: /** @type {string[]} */ ([]),
        getTarget() {
          return this.target;
        },
        hasRegions() {
          return this.regions.length > 0;
        },
        pick(/** @type {string} */ id) {
          this.regions.push(id);
          this.target = id;
        },
        refresh: () => {},
      },
    },
    selectTile: () => calls.push('selectTile'),
    refreshMapDescription: () => calls.push('refreshMapDescription'),
    syncExits: () => calls.push('syncExits'),
    clearSelection: () => calls.push('clearSelection'),
    syncPartyMarker: () => calls.push('syncPartyMarker'),
    syncPaletteKind: () => calls.push('syncPaletteKind'),
    breadcrumb: { update: () => calls.push('breadcrumb') },
    worldTree: { update: () => calls.push('worldTree') },
    regionTree: { update: () => calls.push('regionTree') },
  });
  return {
    gestures: createMapAuthoring(app, env),
    app,
    env,
    grid,
    navigator,
    partyTracker,
    calls,
    toastMessages,
    inspected,
  };
}

/** The derived-state work a gesture settled, without the save marker. */
export const settled = (/** @type {string[]} */ calls) => calls.filter((c) => c !== 'markDirty');
