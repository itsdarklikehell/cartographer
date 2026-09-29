/**
 * The retained-heap reading that `scale-bench.js` and `commit-bench.js`
 * share.
 */

import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { deserialize, serialize, toTileGrid } from '../src/storage/SaveManager.js';

// A forced collection before and after the reading keeps garbage out of it.
// The flag set at run time exposes `gc` to contexts made after it, so the
// scripts need no `--expose-gc` on their command line.
setFlagsFromString('--expose-gc');
const gc = /** @type {() => void} */ (runInNewContext('gc'));

/**
 * The heap that a campaign loaded from `json` keeps after its first save,
 * per tile. The load and the save run the same steps as a page load
 * followed by an autosave, so every cache that those steps fill counts.
 * @param {string} json
 * @param {import('../src/types/storage.js').CampaignState} state the state
 *   `json` was written from, which supplies every field but the nodes
 * @returns {number}
 */
export function heapPerTile(json, state) {
  gc();
  const before = process.memoryUsage().heapUsed;
  const nodes = [...toTileGrid(deserialize(json)).nodes.values()];
  serialize({ ...state, nodes });
  gc();
  const kept = process.memoryUsage().heapUsed - before;
  // The tile count reads the nodes after the second collection, so they are
  // still live when it runs.
  const tiles = nodes.reduce((sum, node) => sum + node.tiles.length, 0);
  return kept / tiles;
}
