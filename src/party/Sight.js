import { WATCHES } from '../time/GameClock.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/time.js').GameClock} GameClock */

/**
 * How far the party sees, in tiles, for each kind of place and light. An
 * outdoor map below the world map (a region, a town, the grounds of a site)
 * shows more in daylight, less at dusk, and little at night. A room inside a
 * structure has no daylight, so its sight stays the same at every hour. A
 * tile of the world map covers a whole region, so the world map keeps a
 * fixed radius that shows the regions next door.
 */
export const SIGHT = Object.freeze({ day: 3, dusk: 2, night: 1, interior: 2, world: 2 });

/**
 * The radius of fog that the party clears around each tile it stands on or
 * walks through in `node`, at the time on `clock`. Only fog reveal reads it.
 * The detection range of markers and the Nearby list use the party
 * tracker's fixed `revealRadius`, so a foe does not drop out of the Nearby
 * list when night falls.
 * @param {MapNode} node
 * @param {GameClock | null | undefined} clock
 * @returns {number}
 */
export function sightRadius(node, clock) {
  if (node.kind === 'interior') return SIGHT.interior;
  if (node.parentId === null) return SIGHT.world;
  const watch = WATCHES[clock?.watch ?? 0];
  if (watch === 'Night') return SIGHT.night;
  return watch === 'Dusk' ? SIGHT.dusk : SIGHT.day;
}
