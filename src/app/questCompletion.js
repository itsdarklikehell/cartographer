/**
 * Completing a quest: the dialog that asks the GM, and the write that
 * follows. The dialog functions can be injected, so tests can run the logic
 * with no DOM, the same as `entityList.js`.
 */

import { confirmModal, promptModal } from '../ui/Modal.js';
import { replaceById } from '../entities/Roster.js';
import { questRevealLine, setQuestStatus, toggleQuestRevealed } from '../quest/Quests.js';
import { hiddenUnlocks, parseUnlocks } from '../quest/QuestUnlocks.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/quest.js').Quest} Quest */

/**
 * Mark a quest completed, show a toast, and write a travelogue line. The
 * line names the quest, so the line of a quest that players cannot see is
 * GM-only, and a Player tab leaves it out. Each quest in `reveal` that is
 * still hidden is then revealed, with its own line. `logEvent` saves the
 * change.
 * @param {AppContext} app
 * @param {Quest} quest
 * @param {string[]} [reveal] the ids of the quests to reveal with it
 * @returns {boolean} false when the quest is gone or already completed
 */
export function completeQuest(app, quest, reveal = []) {
  const { state } = app;
  const current = state.quests.find((q) => q.id === quest.id);
  if (!current || current.status === 'completed') return false;
  state.quests = replaceById(state.quests, setQuestStatus(current, 'completed'));
  app.toasts.show(`Completed ${current.title}.`);
  app.actions.logEvent(
    'note',
    `The party completes the quest ${current.title}.`,
    current.revealed ? undefined : { gm: true },
  );
  for (const id of reveal) {
    const next = state.quests.find((q) => q.id === id);
    if (!next || next.revealed) continue;
    const shown = toggleQuestRevealed(next);
    state.quests = replaceById(state.quests, shown);
    app.actions.logEvent('note', ...questRevealLine(shown));
  }
  return true;
}

/**
 * Ask the GM to complete a quest. When the quest unlocks hidden quests, the
 * dialog lists each one under "Also reveal", ticked, so the GM can reveal
 * the next step of the story in the same click. Without hidden unlocks, the
 * dialog is a plain confirm, or no dialog at all when `askPlain` is false.
 * @param {AppContext} app
 * @param {Quest} quest
 * @param {string} message
 * @param {{ prompt?: typeof promptModal, confirm?: typeof confirmModal, askPlain?: boolean }} [options]
 * @returns {Promise<string[] | null>} the ids to reveal, or null when the GM declines
 */
export async function askCompletion(
  app,
  quest,
  message,
  { prompt = promptModal, confirm = confirmModal, askPlain = true } = {},
) {
  const buttons = { confirmLabel: 'Complete quest', cancelLabel: 'Not yet' };
  const hidden = hiddenUnlocks(app.state.quests, quest);
  if (hidden.length === 0) {
    if (!askPlain) return [];
    return (await confirm(message, { title: 'Quest done', ...buttons })) ? [] : null;
  }
  const ids = hidden.map((q) => q.id);
  const values = await prompt(
    'Quest done',
    [
      {
        name: 'reveal',
        label: 'Also reveal',
        type: 'multiselect',
        value: ids.join(','),
        options: hidden.map((q) => ({ value: q.id, label: q.title })),
      },
    ],
    { message, submitLabel: buttons.confirmLabel, cancelLabel: buttons.cancelLabel },
  );
  return values ? parseUnlocks(values.reveal, quest.id).filter((id) => ids.includes(id)) : null;
}
