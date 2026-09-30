/**
 * Where the toast stack goes on the screen. The stack sits at the right end
 * of the breadcrumb row, above the map. The trail of crumbs starts at the
 * left of that row and is short, so the right end is empty. A toast in a
 * bottom corner covers the party roster or the encounter stats after each
 * autosave, and a centered toast covers the HP bar of the sheet.
 *
 * The row moves with the header, which wraps onto more lines on a narrow
 * screen, and it scrolls away with the page. The stack therefore reads the
 * row's box when a toast appears. A row that is hidden or scrolled out of
 * view gives null, and the stack then uses its CSS place in the top-right
 * corner of the window.
 */

/** The smallest gap in pixels between the stack and the top of the window. */
const EDGE = 8;

/**
 * @param {{ top: number, bottom: number, right: number, height: number }} row
 *   the box of the breadcrumb row, in window coordinates
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @returns {{ top: number, right: number } | null} the offsets in pixels
 *   from the top and the right edge of the window, or null for the CSS place
 */
export function toastPlace(row, viewportWidth, viewportHeight) {
  if (row.height === 0 || row.bottom <= 0 || row.top >= viewportHeight) return null;
  return {
    top: Math.max(EDGE, Math.round(row.top)),
    right: Math.max(EDGE, Math.round(viewportWidth - row.right)),
  };
}
