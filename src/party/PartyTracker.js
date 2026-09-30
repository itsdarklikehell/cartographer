import { revealAlong, revealAround } from '../map/FogOfWar.js';

/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../map/TileGrid.js').TileGrid} TileGrid */

/**
 * Tracks the party's current position: which node, and which tile within
 * it. This class reveals fog around that tile whenever the party moves, and
 * writes the revealed node straight back into the given TileGrid.
 */
export class PartyTracker {
  /**
   * @param {TileGrid} grid
   * @param {PartyPosition} position
   * @param {{ revealRadius?: number }} [options]
   */
  constructor(grid, position, options = {}) {
    this.grid = grid;
    this.revealRadius = options.revealRadius ?? 2;
    this.position = position;
    this._revealAroundCurrent();
  }

  /** @returns {PartyPosition} */
  getPosition() {
    return this.position;
  }

  /**
   * Move the party to a tile, and reveal fog around it. The tile can be in a
   * different node than the party's current one, for example after zooming
   * in or out. A walk across the node passes the tiles it went through as
   * `path`, and the fog clears around each of them too.
   * @param {string} nodeId
   * @param {string} tileId
   * @param {readonly string[]} [path] tiles of `nodeId` that the walk passed
   */
  moveTo(nodeId, tileId, path = []) {
    this.position = { nodeId, tileId };
    this._revealAroundCurrent(path);
  }

  /** @param {readonly string[]} [path] */
  _revealAroundCurrent(path = []) {
    const node = this.grid.getNode(this.position.nodeId);
    if (!node) throw new Error(`PartyTracker: unknown node "${this.position.nodeId}"`);
    const walked = revealAlong(node, path, this.revealRadius);
    this.grid.updateNode(revealAround(walked, this.position.tileId, this.revealRadius));
  }
}
