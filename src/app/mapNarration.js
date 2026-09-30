import { describeCursor, describeNode } from '../map/MapDescription.js';
import { authoringWarning } from '../map/MapExits.js';
import { el, mustGetElement } from '../ui/dom.js';
import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The Build-rail warning for the node in view. It tells the GM when nothing
 * in the parent map leads to the node, or when an interior has no painted way
 * out. Play mode always offers a fallback exit, so both warnings point to an
 * unfinished map. The Build rail that shows them stays hidden everywhere else.
 *
 * The element stays in the document with no text, instead of being added
 * only when there is a message. A screen reader can miss a live region that
 * arrives together with its content. CSS hides the element when it is empty.
 * @param {AppContext} app
 */
export function createBuildWarning(app) {
  const { grid, navigator } = app;
  const element = mustGetElement('build-warning');
  let last = '';
  return {
    sync() {
      const node = navigator.getCurrentNode();
      const text = authoringWarning(node, grid.getParent(node)) ?? '';
      // This element is a live region, and syncExits runs on every party step
      // and every paint stroke. An unconditional write re-announces an
      // unchanged sentence each time.
      if (text === last) return;
      last = text;
      element.textContent = text;
    },
    /** A sentence set while the rail stayed hidden is never announced. A reset
     * makes the next sync write it again, once Build mode shows the rail. */
    reset() {
      last = '';
    },
  };
}

/**
 * @param {string} className
 * @param {HTMLElement} parent
 */
function liveRegion(className, parent) {
  const region = el('div', className);
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  parent.appendChild(region);
  return region;
}

/**
 * Mount the visually hidden live regions that narrate the map canvas for
 * screen readers. The canvas pixels are opaque to assistive technology.
 * aria-live="polite" announces an update without an interruption.
 * @param {AppContext} app
 * @param {{ markerVisible: (tileId: string) => boolean }} canvas
 */
export function mountMapNarration(app, canvas) {
  const { navigator, partyTracker, palette, state } = app;
  const viewport = mustGetElement('map-viewport');
  const mapDescription = liveRegion('sr-only', viewport);

  // The points of interest are an ordinary list, not part of the live region.
  // A screen reader visits it on demand. In the live region, a node with many
  // notes reads over a thousand characters on each navigation.
  const pointList = el('ul', 'sr-only');
  pointList.hidden = true;
  pointList.setAttribute('aria-label', 'Points of interest');
  viewport.appendChild(pointList);

  // This is its own region, not a line in mapDescription. The arming prompt
  // comes and goes with single keystrokes. Sharing mapDescription's region,
  // the write-if-changed check below either overwrites the prompt or
  // re-announces the whole map.
  const exitPrompt = liveRegion('sr-only', viewport);

  // The cursor narration has its own region for the same reason. It changes
  // on every arrow key, and it must not re-announce the map description or
  // overwrite an exit prompt that is still being read.
  const cursorStatus = liveRegion('sr-only', viewport);

  let lastDescription = '';
  let lastPoints = '';
  /** @param {string} id */
  const markerVisible = (id) => canvas.markerVisible(id);

  return {
    /** Re-narrate the current map. Call this wherever the node, the party,
     * the fog, or the tiles change, the same events that redraw the map. */
    refresh() {
      const { status, points } = describeNode(
        navigator.getCurrentNode(),
        partyTracker.getPosition(),
        { revealAll: state.mode === 'build', showNotes: isGM(state.role), markerVisible },
      );
      // Write only when the narration changes. Assigning textContent replaces
      // the live region's text node, and a screen reader watches that node.
      // An unconditional write re-announces the whole description even when
      // no word changed, for example on a paint stroke that only swaps tile
      // art, or a party step inside an already-explored area.
      if (status !== lastDescription) {
        lastDescription = status;
        mapDescription.textContent = status;
      }
      const joined = points.join('\n');
      if (joined === lastPoints) return;
      lastPoints = joined;
      pointList.replaceChildren(...points.map((point) => el('li', '', point)));
      pointList.hidden = points.length === 0;
    },
    /** A cursor key pressed toward a border that leads out arms the exit.
     * This message is narrated apart from the map description, which a node
     * change rewrites completely.
     * @param {import('../types/map.js').MapExit | null} exit */
    exitArmed(exit) {
      exitPrompt.textContent = exit
        ? `Press the same arrow again to return to ${exit.targetName}.`
        : '';
    },
    /** Each arrow key that lands the cursor names the cell it landed on, so a
     * screen reader user knows what Enter acts on.
     * @param {string} tileId */
    cursorMoved(tileId) {
      cursorStatus.textContent = describeCursor(navigator.getCurrentNode(), tileId, {
        revealAll: state.mode === 'build',
        markerVisible,
        labelFor: (imageRef) => palette.listAll().find((e) => e.imageRef === imageRef)?.label,
      });
    },
  };
}
