import { buildBuiltins } from './TileCatalog.js';

/** @typedef {{ id: string, type: string, label: string, imageRef: string, custom: boolean }} PaletteEntry */

/**
 * Holds the built-in tile catalog plus any user-supplied custom tile images,
 * keyed by id so callers can look up an imageRef when placing a tile.
 */
export class TilePalette {
  constructor() {
    /** @type {Map<string, PaletteEntry>} */
    this.entries = new Map(buildBuiltins().map((entry) => [entry.id, entry]));
  }

  /**
   * Register a custom tile image, for example a data: URL read from a file
   * input. Throws if the id collides with an existing built-in entry.
   * @param {string} id
   * @param {string} label
   * @param {string} imageRef
   * @param {string} [type]
   * @returns {PaletteEntry}
   */
  addCustom(id, label, imageRef, type = 'custom') {
    const existing = this.entries.get(id);
    if (existing && !existing.custom) {
      throw new Error(`Cannot override built-in tile "${id}"`);
    }
    const entry = { id, type, label, imageRef, custom: true };
    this.entries.set(id, entry);
    return entry;
  }

  /**
   * Remove a custom tile entry. The function does nothing, and refuses, for
   * built-in entries.
   * @param {string} id
   */
  removeCustom(id) {
    const existing = this.entries.get(id);
    if (!existing || !existing.custom) return;
    this.entries.delete(id);
  }

  /**
   * @param {string} id
   * @returns {PaletteEntry | undefined}
   */
  get(id) {
    return this.entries.get(id);
  }

  /**
   * All entries, built-in and custom, that belong to a given type.
   * @param {string} type
   * @returns {PaletteEntry[]}
   */
  listVariants(type) {
    return [...this.entries.values()].filter((e) => e.type === type);
  }

  /**
   * Pick a random variant of a terrain type. The caller supplies the RNG so
   * tests can control it.
   * @param {string} type
   * @param {() => number} rng returns a float in [0, 1)
   * @returns {PaletteEntry}
   */
  pickVariant(type, rng) {
    const variants = this.listVariants(type);
    if (variants.length === 0) throw new Error(`No variants registered for type "${type}"`);
    return variants[Math.floor(rng() * variants.length) % variants.length];
  }

  /**
   * Look up a specific road connector piece by kind, for example "h",
   * "corner-ne", or "end-n".
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getRoadPiece(kind) {
    return this.entries.get(`road-${kind}`);
  }

  /**
   * Look up a specific river connector piece by kind, for example "h",
   * "corner-ne", or "bridge-h".
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getRiverPiece(kind) {
    return this.entries.get(`river-${kind}`);
  }

  /**
   * Look up a coast transition piece by the edge its water half faces, for
   * example "n", "s", "e", or "w".
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getCoastPiece(kind) {
    return this.entries.get(`coast-${kind}`);
  }

  /**
   * Look up a town wall piece by kind, for example "wall-h",
   * "wall-corner-se", or "gate-v".
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getTownWallPiece(kind) {
    return this.entries.get(`town-${kind}`);
  }

  /**
   * Look up a specific interior piece by kind, for example "floor-1",
   * "wall-h", or "stairs-up".
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getInteriorPiece(kind) {
    return this.entries.get(`interior-${kind}`);
  }

  /** @returns {PaletteEntry[]} */
  listBuiltins() {
    return [...this.entries.values()].filter((e) => !e.custom);
  }

  /** @returns {PaletteEntry[]} */
  listCustom() {
    return [...this.entries.values()].filter((e) => e.custom);
  }

  /** @returns {PaletteEntry[]} */
  listAll() {
    return [...this.entries.values()];
  }
}
