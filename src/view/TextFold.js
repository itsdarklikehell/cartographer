/**
 * The note length in characters past which an NPC card folds its notes to
 * two lines with a More button. Two lines of label text in the sidebar take
 * about 90 characters.
 */
export const NOTES_FOLD_LENGTH = 90;

/**
 * The body length past which a GM's handout row folds the read-aloud text
 * to three lines. A player row always shows the whole text.
 */
export const HANDOUT_FOLD_LENGTH = 160;

/**
 * Whether a text is long enough to fold behind a More button.
 * @param {string | undefined} text
 * @param {number} limit
 * @returns {boolean}
 */
export function foldsText(text, limit) {
  return (text?.length ?? 0) > limit;
}
