/** @typedef {import('./Autotile.js').ArmNetwork} ArmNetwork */
/** @typedef {import('./Autotile.js').Arm} Arm */

/**
 * The town wall: a square ring of wall pieces around the core, with a gate
 * where a street goes through. The pieces are town-wall-* and town-gate-*
 * overlays. A corner piece is named for its open edges, so the north-west
 * corner of the ring is `wall-corner-se`.
 */

/**
 * The piece for one cell of a ring of radius `r` around the center `c`.
 * @param {number} dx @param {number} dy the offset from the center
 * @param {number} r
 * @param {boolean} street whether a street goes through the cell
 * @returns {string}
 */
function ringPiece(dx, dy, r, street) {
  if (Math.abs(dx) === r && Math.abs(dy) === r) {
    return `wall-corner-${dy < 0 ? 's' : 'n'}${dx < 0 ? 'e' : 'w'}`;
  }
  const across = Math.abs(dy) === r ? 'h' : 'v';
  return `${street ? 'gate' : 'wall'}-${across}`;
}

/**
 * Plan a wall ring of radius `r` around the center, or return null when a
 * street meets the ring at a corner, runs along it, or crosses it on a
 * bridge. A gate takes only a street that goes straight through the wall.
 * The ring leaves a gap where the river goes through, because the palette
 * has no water gate. A ring with more than four river cells on it is also
 * refused, because there the river runs along the wall.
 * @param {{ size: number, roads: ArmNetwork, rivers: ArmNetwork }} plan
 * @param {number} c the center index @param {number} r the ring radius
 * @returns {Map<string, string> | null} wall piece per tile id
 */
export function wallRing({ roads, rivers }, c, r) {
  /** @type {Map<string, string>} */
  const walls = new Map();
  let gaps = 0;
  for (let y = c - r; y <= c + r; y++) {
    for (let x = c - r; x <= c + r; x++) {
      const dx = x - c;
      const dy = y - c;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const street = roads.has(x, y);
      if (street) {
        const arms = roads.at(x, y);
        /** @type {Arm[]} */
        const through = Math.abs(dy) === r ? ['n', 's'] : ['e', 'w'];
        const corner = Math.abs(dx) === r && Math.abs(dy) === r;
        if (corner || rivers.has(x, y) || arms.size !== 2) return null;
        if (!through.every((arm) => arms.has(arm))) return null;
      }
      if (rivers.has(x, y)) {
        gaps++;
        continue;
      }
      walls.set(`${x},${y}`, ringPiece(dx, dy, r, street));
    }
  }
  return gaps > 4 ? null : walls;
}

/**
 * Plan the wall of a town of 22 cells or more, with a chance of one in two.
 * The ring stands one cell past the core when the streets allow, then two
 * cells past, then on the core edge. It keeps at least two cells from the
 * map border, so the streets have room to leave the map. A town whose
 * streets fit no ring gets no wall.
 * @param {{ size: number, roads: ArmNetwork, rivers: ArmNetwork }} plan
 * @param {number} c the center index @param {number} core the core radius
 * @param {() => number} rng
 * @returns {Map<string, string>} wall piece per tile id, empty for no wall
 */
export function planWall(plan, c, core, rng) {
  if (plan.size < 22 || rng() >= 0.5) return new Map();
  for (const r of [core + 1, core + 2, core]) {
    if (c + r > plan.size - 3) continue;
    const walls = wallRing(plan, c, r);
    if (walls) return walls;
  }
  return new Map();
}
