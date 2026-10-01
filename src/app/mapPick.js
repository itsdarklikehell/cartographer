import { tileIdAt } from '../map/MapGeometry.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/**
 * The map callbacks that a tile pick takes over. A Play-mode click arrives
 * as `onCellClick`, and a Build-mode click arrives as a one-cell stroke.
 * @typedef {Pick<import('../map/MapCanvas.js').MapCanvas,
 *   'onCellClick' | 'onStrokeCell' | 'onStrokeEnd' | 'onExitClick' | 'onCellContextMenu'>} PickHost
 */

/**
 * Make the next map click call `onPick` with the cell, in place of its usual
 * action. A click in Play mode does not move the party, and a click in Build
 * mode does not paint. A Build-mode drag picks its first cell when the drag
 * ends, and paints no tiles. The pick waits for the end of the drag because
 * the caller can open a dialog in `onPick`, and the canvas behind a modal
 * dialog gets no pointerup. Exit arrows and the right-click menu do nothing
 * while the pick waits. The returned function puts the usual callbacks back.
 * It runs by itself before `onPick`, and a caller runs it to cancel.
 * @param {PickHost} host
 * @param {(x: number, y: number) => void} onPick
 * @returns {() => void}
 */
export function armTilePick(host, onPick) {
  const saved = {
    onCellClick: host.onCellClick,
    onStrokeCell: host.onStrokeCell,
    onStrokeEnd: host.onStrokeEnd,
    onExitClick: host.onExitClick,
    onCellContextMenu: host.onCellContextMenu,
  };
  const disarm = () => Object.assign(host, saved);
  /** @type {{ x: number, y: number } | null} */
  let first = null;
  const pick = (/** @type {number} */ x, /** @type {number} */ y) => {
    disarm();
    onPick(x, y);
  };
  const ignore = () => {};
  Object.assign(host, {
    onCellClick: pick,
    onStrokeCell: (/** @type {number} */ x, /** @type {number} */ y) => {
      first ??= { x, y };
    },
    onStrokeEnd: () => {
      if (first) pick(first.x, first.y);
    },
    onExitClick: ignore,
    onCellContextMenu: ignore,
  });
  return disarm;
}

/**
 * Wait for the GM to click one tile of the map in view. A hint over the map
 * says what to do, and Escape cancels. The result is the map and tile that
 * the GM clicked, or null on cancel.
 * @param {AppContext} app
 * @param {string} [hint]
 * @returns {Promise<EncounterLocation | null>}
 */
export function pickMapTile(
  app,
  hint = 'Click a tile to place the creature. Press Escape to cancel.',
) {
  const canvas = app.views.mapCanvas;
  const note = document.createElement('p');
  note.className = 'map-pick-hint';
  note.setAttribute('role', 'status');
  note.textContent = hint;
  canvas.canvas.parentElement?.appendChild(note);
  return new Promise((resolve) => {
    // A pick puts the map callbacks back by itself, after the click or at
    // the end of the drag. Escape puts them back at once.
    /** @param {EncounterLocation | null} result */
    const finish = (result) => {
      document.removeEventListener('keydown', onKey, true);
      note.remove();
      resolve(result);
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      disarm();
      finish(null);
    };
    const disarm = armTilePick(canvas, (x, y) =>
      finish({ nodeId: app.navigator.getCurrentNode().id, tileId: tileIdAt(x, y) }),
    );
    document.addEventListener('keydown', onKey, true);
    canvas.canvas.focus();
  });
}
