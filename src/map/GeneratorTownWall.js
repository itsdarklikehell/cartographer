/** @typedef {import('./Autotile.js').ArmNetwork} ArmNetwork */
/** @typedef {import('./Autotile.js').Arm} Arm */

/**
 * The town wall: a square ring of wall pieces around the core, with a gate
 * where a street goes through and a water gate where the river goes through.
 * The pieces are town-wall-*, town-gate-*, and town-water-gate-* overlays. A
 * corner piece is named for its open edges, so the north-west corner of the
 * ring is `wall-corner-se`.
 */

/**
 * The piece for one cell of a ring of radius `r` around the center `c`.
 * @param {number} dx @param {number} dy the offset from the center
 * @param {number} r
 * @param {'wall' | 'gate' | 'water-gate'} kind what goes through the cell
 * @returns {string}
 */
function ringPiece(dx, dy, r, kind) {
  if (Math.abs(dx) === r && Math.abs(dy) === r) {
    return `wall-corner-${dy < 0 ? 's' : 'n'}${dx < 0 ? 'e' : 'w'}`;
  }
  return `${kind}-${Math.abs(dy) === r ? 'h' : 'v'}`;
}

/**
 * Whether the network goes straight through a ring cell and nowhere else.
 * @param {ArmNetwork} network
 * @param {number} x @param {number} y
 * @param {boolean} across whether the cell is on the north or south side
 * @returns {boolean}
 */
function straightThrough(network, x, y, across) {
  const arms = network.at(x, y);
  /** @type {Arm[]} */
  const through = across ? ['n', 's'] : ['e', 'w'];
  return arms.size === 2 && through.every((arm) => arms.has(arm));
}

/**
 * Plan a wall ring of radius `r` around the center, or return null when a
 * street or the river meets the ring at a corner, runs along it, or turns
 * on it, or when a street crosses the ring on a bridge. A gate or a water
 * gate takes only a street or a river that goes straight through the wall.
 * @param {{ size: number, roads: ArmNetwork, rivers: ArmNetwork }} plan
 * @param {number} c the center index @param {number} r the ring radius
 * @returns {Map<string, string> | null} wall piece per tile id
 */
export function wallRing({ roads, rivers }, c, r) {
  /** @type {Map<string, string>} */
  const walls = new Map();
  for (let y = c - r; y <= c + r; y++) {
    for (let x = c - r; x <= c + r; x++) {
      const dx = x - c;
      const dy = y - c;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const street = roads.has(x, y);
      const river = rivers.has(x, y);
      if (street || river) {
        const across = Math.abs(dy) === r;
        const network = street ? roads : rivers;
        if (street && river) return null;
        if (Math.abs(dx) === r && across) return null;
        if (!straightThrough(network, x, y, across)) return null;
      }
      const kind = street ? 'gate' : river ? 'water-gate' : 'wall';
      walls.set(`${x},${y}`, ringPiece(dx, dy, r, kind));
    }
  }
  return walls;
}

/**
 * The ring radii that a town wall tries, in order: one cell past the core,
 * two cells past, then on the core edge. A ring keeps at least two cells
 * from the map border, so the streets have room to leave the map. A town
 * under 22 cells gets no wall and so has no radii.
 * @param {number} size @param {number} c the center index
 * @param {number} core the core radius
 * @returns {number[]}
 */
export function wallRadii(size, c, core) {
  if (size < 22) return [];
  return [core + 1, core + 2, core].filter((r) => c + r <= size - 3);
}

/**
 * Plan the wall of a town of 22 cells or more, with a chance of one in two.
 * The wall takes the first ring from `wallRadii` that the streets and the
 * river allow. `townRiver` keeps the first ring clear, so a river alone
 * never stops a wall. A town whose streets and river fit no ring gets no
 * wall.
 * @param {{ size: number, roads: ArmNetwork, rivers: ArmNetwork }} plan
 * @param {number} c the center index @param {number} core the core radius
 * @param {() => number} rng
 * @returns {Map<string, string>} wall piece per tile id, empty for no wall
 */
export function planWall(plan, c, core, rng) {
  if (plan.size < 22 || rng() >= 0.5) return new Map();
  for (const r of wallRadii(plan.size, c, core)) {
    const walls = wallRing(plan, c, r);
    if (walls) return walls;
  }
  return new Map();
}
