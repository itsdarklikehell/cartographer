/**
 * The cost of one Play-mode party step as the node grows.
 *
 * `scale-bench.js` grows the world by adding nodes, and its `step ms` column
 * walks the example world node, which keeps one size. This table walks
 * square nodes from 48 to 400 cells on a side (see `sweepNode` and
 * `walkParty` in `party-step.js`). A step cost that stays flat down the
 * column is O(reveal radius squared). A cost that grows about fourfold from
 * one row to the next comes from a scan of every tile.
 *
 * Usage:
 *   pnpm bench:step
 */

import { partyPath, sweepNode, walkParty } from './party-step.js';

/**
 * The median of several timed walks, divided by the steps in one walk.
 * @param {import('../src/types/map.js').MapNode} node
 * @param {number} rounds
 */
function stepMs(node, rounds) {
  const path = partyPath(node);
  walkParty(node, path); // one warm round, so the report excludes first-call compilation
  const times = [];
  for (let i = 0; i < rounds; i++) {
    const started = performance.now();
    walkParty(node, path);
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(rounds / 2)] / path.length;
}

process.stdout.write(`${'node'.padEnd(12)}${'tiles'.padStart(8)}${'step ms'.padStart(10)}\n`);
for (const size of [48, 100, 200, 400]) {
  const node = sweepNode(size);
  const ms = stepMs(node, size > 200 ? 3 : 7);
  const label = `${size}x${size}`;
  process.stdout.write(
    `${label.padEnd(12)}${String(node.tiles.length).padStart(8)}${ms.toFixed(3).padStart(10)}\n`,
  );
}
