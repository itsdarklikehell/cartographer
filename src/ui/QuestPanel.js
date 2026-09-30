import { el } from './dom.js';
import { groupByStatus, visibleQuests } from '../quest/Quests.js';
import { objectiveProgress } from '../quest/Objectives.js';
import { icon } from './icons.js';
import { isGM } from '../view/ViewRole.js';
import { mountListPanel } from './listPanel.js';
import { gmObjectiveChecks, gmQuestDetail, playerObjectives } from './QuestDetail.js';

/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Mount the quest/session log: active quests first, then completed quests
 * below, each with a toggle-complete, a reveal, and a details control, plus
 * a "New quest" control. The panel owns no state. `getQuests` supplies the
 * rows, and every mutation flows back through a callback, matching the other
 * panels. Modals for add, edit, and confirm live in the wiring modules.
 *
 * When `getRole` reports a player view, the log is read-only and lists only
 * the revealed quests, each as `playerQuestView` gives it. A player row has
 * a static status glyph, the title, and the objectives that are not hidden.
 * The copy has no notes, no hidden objectives, and no links, since those
 * are the GM's leads and spoilers. The panel omits the add control.
 *
 * In a GM tab, a quest's details start hidden behind a per-row toggle, and
 * the panel scrolls once the list outgrows its room. The details are the
 * notes, the objectives with their controls, the links, and the edit and
 * delete buttons (see `QuestDetail.js`). A collapsed active row lists its
 * objectives with only their check-off toggles. A long-running campaign collects dozens of quests with
 * a paragraph each, and with every quest open the list pushes the rest of
 * the rail off the screen. The set of expanded rows lives in this closure,
 * not in the campaign, so it is per browser and resets with a reload.
 * @param {HTMLElement} container
 * @param {{
 *   getQuests: () => Quest[],
 *   onToggle: (quest: Quest) => void,
 *   onToggleRevealed: (quest: Quest) => void,
 *   onEdit: (quest: Quest) => Promise<boolean> | boolean,
 *   onDelete: (id: string) => Promise<boolean> | boolean,
 *   onAdd: () => Promise<Quest | null>,
 *   getRole?: () => ViewRole,
 *   linkTargets?: () => unknown,
 * } & import('./QuestDetail.js').QuestDetailCallbacks} callbacks
 * @returns {{ update: () => void }}
 */
export function mountQuestPanel(container, callbacks) {
  /** The ids of the quests showing their details. @type {Set<string>} */
  const expanded = new Set();

  return mountListPanel(container, {
    className: 'quest-panel',
    gate: () => !callbacks.getRole || isGM(callbacks.getRole()),
    // The two status groups start as one flat list. `groupOf` re-splits the
    // list into the Active and Completed sections.
    // A link chip names its node or creature, which the quest rows do not
    // describe, so a creature edit repaints the log as well.
    dependsOn: callbacks.linkTargets,
    getRows: (gm) => {
      const { active, completed } = groupByStatus(visibleQuests(callbacks.getQuests(), gm));
      return [...active, ...completed];
    },
    groupOf: (quest) => (quest.status === 'completed' ? 'Completed' : 'Active'),
    emptyMessage: (gm) => (gm ? 'No quests yet.' : 'No quests shared yet.'),
    classes: {
      group: 'quest-panel__group',
      groupHeading: 'quest-panel__group-title',
      rowModifiers: (quest) => [quest.status === 'completed' && 'quest-panel__row--completed'],
      head: 'quest-panel__head',
      add: 'quest-panel__add',
    },
    buildBody: (quest, ctx) => {
      const done = quest.status === 'completed';
      const title = el('span', 'quest-panel__title', quest.title);

      // A player sees the status glyph, the title, and the shared objectives,
      // with no control.
      if (!ctx.gm) {
        return [
          el('span', 'quest-panel__status', icon(done ? 'check' : 'circle')),
          el('div', 'quest-panel__body u-col u-g1', title, playerObjectives(quest)),
        ];
      }

      // A completed quest's toggle shows a check, and an active quest's toggle
      // shows an empty ring. The plus stays with New quest, so the two
      // controls do not share a glyph.
      const toggle = ctx.action(
        {
          icon: done ? 'check' : 'circle',
          label: done ? `Reopen ${quest.title}` : `Complete ${quest.title}`,
          pressed: done,
          onClick: () => callbacks.onToggle(quest),
        },
        quest,
      );

      // A collapsed active quest lists its objectives with their check-off
      // toggles. The open details list them with every control, and a
      // completed quest shows only the count.
      const open = expanded.has(quest.id);
      const { done: checked, total } = objectiveProgress(quest.objectives);
      const body = el(
        'div',
        'quest-panel__body u-col u-g1',
        title,
        done && total > 0 ? el('span', 'u-muted', `${checked} of ${total} objectives done`) : null,
        !done && !open ? gmObjectiveChecks(quest, ctx, callbacks) : null,
      );

      // The details hold the add, edit, and delete controls, so every GM row
      // gets the toggle, even a quest with no notes or objectives yet.
      const detailsToggle = ctx.action(
        {
          icon: 'chevron',
          label: open ? `Hide details of ${quest.title}` : `Show details of ${quest.title}`,
          pressed: open,
          onClick: () => {
            if (open) expanded.delete(quest.id);
            else expanded.add(quest.id);
          },
        },
        quest,
      );
      detailsToggle.classList.add('quest-panel__notes-toggle');
      detailsToggle.setAttribute('aria-expanded', String(open));

      return [toggle, body, detailsToggle];
    },
    actions: (quest, ctx) =>
      ctx.gm
        ? [
            {
              icon: quest.revealed ? 'eye' : 'eye-off',
              label: quest.revealed
                ? `Hide ${quest.title} from players`
                : `Reveal ${quest.title} to players`,
              pressed: quest.revealed,
              onClick: () => callbacks.onToggleRevealed(quest),
            },
          ]
        : [],
    buildExtras: (quest, row, ctx) => {
      if (ctx.gm && expanded.has(quest.id)) row.appendChild(gmQuestDetail(quest, ctx, callbacks));
    },
    addButtons: () => [{ label: 'New quest', icon: 'add', onClick: callbacks.onAdd }],
  });
}
