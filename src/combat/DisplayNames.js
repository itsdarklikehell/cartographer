/**
 * Display labels for combatants that share a name. Two Roadside Bandits in
 * one fight read the same in every list, and the GM can tell them apart only
 * by their order. This module numbers them: "Roadside Bandit 1" and
 * "Roadside Bandit 2". The number is a label only, and the stored name stays
 * as the GM typed it.
 *
 * The caller passes the entries in a stable order, the order of the
 * campaign's own lists, so the same creature gets the same number in the
 * setup dialog, the encounter rows, and the fight.
 */

/**
 * The label of each entry, keyed by id. A name that appears once keeps its
 * label unchanged. Each repeat of a name gets a number after it, counting up
 * from 1 in the order given.
 * @param {readonly { id: string, name: string }[]} entries
 * @returns {Map<string, string>}
 */
export function numberedNames(entries) {
  /** @type {Map<string, number>} */
  const totals = new Map();
  for (const { name } of entries) totals.set(name, (totals.get(name) ?? 0) + 1);
  /** @type {Map<string, number>} */
  const seen = new Map();
  /** @type {Map<string, string>} */
  const labels = new Map();
  for (const { id, name } of entries) {
    if ((totals.get(name) ?? 0) < 2) {
      labels.set(id, name);
      continue;
    }
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    labels.set(id, `${name} ${n}`);
  }
  return labels;
}

/**
 * The labels of the entries whose id is in `ids`, numbered in the order of
 * `ordered`. The fight and the setup dialog pass the characters and then the
 * creatures in campaign order, so the numbers do not follow initiative.
 * @param {readonly { id: string, name: string }[]} ordered
 * @param {Iterable<string>} ids
 * @returns {Map<string, string>}
 */
export function labelsFor(ordered, ids) {
  const wanted = new Set(ids);
  return numberedNames(ordered.filter((entry) => wanted.has(entry.id)));
}
