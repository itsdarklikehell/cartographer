/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * The note length in characters past which an NPC card folds its notes to
 * two lines with a More button. Two lines of label text in the sidebar take
 * about 90 characters.
 */
export const NOTES_FOLD_LENGTH = 90;

/**
 * Whether an NPC card shows its condition chips and exhaustion pips. It
 * shows them while the NPC is in the fight, and also while the NPC has a
 * condition or a level of exhaustion, so a mark set during a fight stays in
 * view after it.
 * @param {Creature} npc
 * @param {boolean} inFight
 * @returns {boolean}
 */
export function showsCombatBars(npc, inFight) {
  return inFight || (npc.conditions?.length ?? 0) > 0 || (npc.exhaustion ?? 0) > 0;
}

/**
 * Whether the notes are long enough to fold behind a More button.
 * @param {string | undefined} notes
 * @returns {boolean}
 */
export function foldsNotes(notes) {
  return (notes?.length ?? 0) > NOTES_FOLD_LENGTH;
}
