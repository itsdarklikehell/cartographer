import { mustGetElement } from '../ui/dom.js';
import { confirmModal, confirmDelete } from '../ui/Modal.js';
import { mountTravelogPanel } from '../ui/TravelogPanel.js';
import { appendEntry, createEntry, TRAVELOG_LIMIT } from '../log/Travelogue.js';
import { entriesFor } from '../log/LogVisibility.js';
import { mountNPCPanel } from '../ui/NPCPanel.js';
import {
  creaturesAt,
  creaturesNear,
  knownCreaturesAt,
  formatLocation,
} from '../entities/CreatureMap.js';
import { isGM } from '../view/ViewRole.js';
import { mountQuestPanel } from '../ui/QuestPanel.js';
import {
  createQuest,
  questRevealLine,
  toggleQuestRevealed,
  toggleQuestStatus,
} from '../quest/Quests.js';
import { completeQuest, questDetailCallbacks } from './questDetail.js';
import { replaceById, removeById } from '../entities/Roster.js';
import { wireEntityList } from './entityList.js';
import { wireHandouts } from './handoutWiring.js';
import { creatureForm } from './creatureForm.js';
import { commitCreatures } from './combatants.js';
import { storeCreature } from './combatantWrites.js';
import { setCombatantExhaustion } from './exhaustion.js';
import { addLethargy } from './lethargy.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Wires the Story tab's panels (travelogue, NPCs, quests, handouts) and the
 * `logEvent` action. Every module records travelogue entries through
 * `logEvent`.
 * @param {AppContext} app
 */
export function wireStory(app) {
  const { state } = app;

  /** A monotonic counter. It makes travelogue entry ids unique within one session. */
  let logSeq = 0;
  /**
   * A random tag for this tab. A player tab's patch pairs log entries with
   * the GM tab's by id, so two tabs that log in the same millisecond with
   * the same counter value would otherwise merge into one entry.
   */
  const tabTag = Math.random().toString(36).slice(2, 6);

  /**
   * Records a travelogue event and refreshes the panel. Ids combine the clock
   * time with a session counter and the tab tag, so two events in the same
   * millisecond never collide, in one tab or across tabs.
   * @param {import('../types/log.js').LogEntryKind} kind
   * @param {string} message
   * @param {import('../types/log.js').LogOptions} [options] marks a line that
   *   names something only the GM sees, with the line a Player tab shows
   */
  app.actions.logEvent = (kind, message, options) => {
    const now = Date.now();
    // The running fight's own lines stay past the usual cap, because the
    // combat log column lists the fight from its start.
    state.travelog = appendEntry(
      state.travelog,
      createEntry(`log-${now}-${tabTag}${logSeq++}`, kind, message, now, options, {
        clock: state.clock,
        round: state.combat?.round,
      }),
      TRAVELOG_LIMIT,
      state.combat?.startedAt ?? null,
    );
    app.views.travelogPanel.update();
    // The combat screen's log column shows the same entries. Without this
    // call, a line that changes no combatant, such as a missed attack or a
    // plain roll, never reaches it. Outside a fight, the screen is empty, and
    // the call is a no-op.
    app.views.combatScreen.update();
    app.actions.markDirty();
  };

  app.views.travelogPanel = mountTravelogPanel(mustGetElement('travelog-container'), {
    // A Player tab reads the player line of a GM-only entry, or nothing.
    getEntries: () => entriesFor(state.travelog, state.role),
    getRole: () => state.role,
    onClear: async () => {
      if (state.travelog.length === 0) return false;
      const ok = await confirmModal('Clear the travelogue? Its recorded events are lost.', {
        variant: 'danger',
        confirmLabel: 'Clear',
      });
      if (ok) {
        state.travelog = [];
        app.actions.markDirty();
      }
      return ok;
    },
  });

  /** The non-hostile creatures in a list's scope. A hostile creature lives
   * on the Encounters side, whatever list it was authored from. */
  const folkAt = (/** @type {{ nodeId: string } | null} */ position) =>
    creaturesAt(state.creatures, position).filter((c) => c.disposition !== 'hostile');

  /** The same list, cut to the tiles around the party. */
  const folkNear = (/** @type {{ nodeId: string, tileId: string } | null} */ position) =>
    creaturesNear(state.creatures, position, app.partyTracker.revealRadius * 4).filter(
      (c) => c.disposition !== 'hostile',
    );

  /** The confirm-and-delete flow shared by both NPC lists. */
  const deleteNPC = (/** @type {string} */ id) => {
    state.creatures = removeById(state.creatures, id);
    app.actions.removeCombatant(id);
    commitCreatures(app);
  };
  const confirmDeleteNPC = (/** @type {import('../types/creature.js').Creature} */ npc) =>
    confirmDelete(npc.name);

  app.views.npcPanel = mountNPCPanel(mustGetElement('npc-container'), {
    // A player learns of a placed NPC only after the party lands on its tile.
    // The GM sees who stands close enough to matter, with unmet NPCs flagged.
    // The radius is the one the Encounters panel uses for nearby foes, so both
    // sidebar lists cover the same ground. The whole node's roster stays on
    // the Build rail.
    getNPCs: () =>
      isGM(state.role)
        ? folkNear(app.partyTracker.getPosition())
        : knownCreaturesAt(state.creatures, app.partyTracker.getPosition()),
    getLocationLabel: (npc) => {
      const label = formatLocation(npc.location, (id) => app.grid.getNode(id)?.name);
      return npc.location && !npc.met ? `${label} — not yet met` : label;
    },
    onDelete: deleteNPC,
    // The chips on an NPC's row are combat state, so only the panel beside
    // the party writes them. The combat screen shows the same chips.
    onUpdate: (edited) => {
      const prev = state.creatures.find((c) => c.id === edited.id);
      // A hand edit that removes Haste leaves lethargy, as any other end does.
      const npc = prev ? addLethargy(app, prev, edited) : edited;
      storeCreature(app, prev ?? npc, npc, (c) => {
        state.creatures = replaceById(state.creatures, c);
      });
      commitCreatures(app);
      app.views.combatScreen.update();
    },
    // Exhaustion goes through the app write, not through onUpdate, because the
    // sixth level takes the NPC to 0 HP and logs both facts.
    onSetExhaustion: (npc, level) => setCombatantExhaustion(app, npc.id, level),
    // New NPCs from the Story tab default to where the party stands.
    onAdd: () =>
      creatureForm(app, null, { ...app.partyTracker.getPosition() }, { disposition: 'neutral' }),
    onEdit: (npc) => creatureForm(app, npc, null),
    confirmDelete: confirmDeleteNPC,
    getRole: () => state.role,
  });

  // This is the Build rail's NPC authoring list, the NPCs subtab beside the
  // mob roster. It lists the non-hostile creatures placed in whatever node
  // the GM views, plus unplaced ones, and lets the GM edit them without
  // moving the party there. New NPCs default onto the Build-mode selected
  // tile of the viewed node.
  app.views.buildNPCs = mountNPCPanel(mustGetElement('build-npcs-container'), {
    getNPCs: () => folkAt({ nodeId: app.navigator.getCurrentNode().id }),
    getLocationLabel: (npc) => formatLocation(npc.location, (id) => app.grid.getNode(id)?.name),
    onDelete: deleteNPC,
    onAdd: () =>
      creatureForm(
        app,
        null,
        {
          nodeId: app.navigator.getCurrentNode().id,
          tileId: app.actions.getSelectedTileId() ?? '0,0',
        },
        { disposition: 'neutral' },
      ),
    onEdit: (npc) => creatureForm(app, npc, null),
    confirmDelete: confirmDeleteNPC,
    getRole: () => state.role,
    pinAdd: true, // Leads with "New NPC", to match the Mobs subtab.
  });

  const questList = wireEntityList(app, {
    key: 'quests',
    noun: 'quest',
    fields: (quest) => [
      { name: 'title', label: 'Title', value: quest?.title ?? '' },
      { name: 'notes', label: 'Notes', value: quest?.notes ?? '' },
    ],
    create: (id, title, values) => createQuest(id, title, values.notes.trim()),
    patch: (quest, title, values) => ({ ...quest, title, notes: values.notes.trim() }),
  });

  app.views.questPanel = mountQuestPanel(mustGetElement('quest-container'), {
    getQuests: () => state.quests,
    onToggle: (quest) => {
      // Completing writes a toast and a travelogue line. Reopening is quiet.
      if (quest.status === 'active' && completeQuest(app, quest)) return;
      state.quests = replaceById(state.quests, toggleQuestStatus(quest));
      app.actions.markDirty();
    },
    onToggleRevealed: (quest) => {
      const next = toggleQuestRevealed(quest);
      state.quests = replaceById(state.quests, next);
      // logEvent saves the change.
      app.actions.logEvent('note', ...questRevealLine(next));
    },
    ...questList,
    ...questDetailCallbacks(app),
    getRole: () => state.role,
  });

  wireHandouts(app);
}
