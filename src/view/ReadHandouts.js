/**
 * The handouts a Player tab has listed, kept per browser. The Handouts panel
 * of a Player tab lists them under "Read earlier" after the party leaves
 * their spot. A set in memory is empty after a reload, so the group would
 * lose every handout the players read before it.
 *
 * The record goes into localStorage and is keyed by the bound character, so
 * two Player tabs of one browser that play different characters keep apart
 * what each one listed. A spectator tab uses the empty key. The panel reads
 * the record at each render, so a Player tab also picks up a New, Load
 * example, or Import from the GM tab, which removes the record. The ids are
 * pruned to the handouts of the live campaign at each write, so the record
 * stays small. Storage that is full or blocked gives an empty set and drops
 * the write, and the group then lasts only until the next render. The
 * storage is passed in, so a test can use a plain object.
 */

export const READ_HANDOUTS_KEY = 'campaign-builder:read-handouts';

/** @typedef {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} ReadStorage */

/**
 * @param {ReadStorage} storage
 * @returns {Record<string, string[]>}
 */
function readRecord(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(READ_HANDOUTS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Add the handouts listed now to the ones this viewer listed before, and
 * give back the whole set.
 * @param {ReadStorage} storage
 * @param {string | null} viewer the bound character id, or null for a spectator
 * @param {string[]} listed the ids the panel lists at the party's spot
 * @param {Set<string>} known the ids of every handout in the campaign
 * @returns {Set<string>}
 */
export function recordReadHandouts(storage, viewer, listed, known) {
  const record = readRecord(storage);
  const key = viewer ?? '';
  const stored = Array.isArray(record[key]) ? record[key] : [];
  const seen = new Set(stored.filter((id) => typeof id === 'string' && known.has(id)));
  for (const id of listed) seen.add(id);
  if (seen.size !== stored.length || stored.some((id) => !seen.has(id))) {
    try {
      storage.setItem(READ_HANDOUTS_KEY, JSON.stringify({ ...record, [key]: [...seen] }));
    } catch {
      // The group is a convenience. The panel lists it from memory this time.
    }
  }
  return seen;
}

/**
 * Remove the record. A campaign that replaces the live one calls this, so
 * its handouts do not list as read because an id matches a handout of the
 * campaign before.
 * @param {ReadStorage} storage
 */
export function forgetReadHandouts(storage) {
  try {
    storage.removeItem(READ_HANDOUTS_KEY);
  } catch {
    // Blocked storage has no record to remove.
  }
}
