import { tileIdAt } from '../map/MapGeometry.js';
import { mustGetElement } from '../ui/dom.js';
import { confirmDelete, alertModal } from '../ui/Modal.js';
import { openContextMenu } from '../ui/ContextMenu.js';
import { mountEncounterPanel } from '../ui/EncounterPanel.js';
import { mountBuildEncounterPanel } from '../ui/BuildEncounterPanel.js';
import { toTemplate } from '../entities/CreatureTemplate.js';
import {
  clearableDefeated,
  creaturesAt,
  creaturesNear,
  creaturesOnTile,
  discoveredHostiles,
  hostileCreaturesOnTile,
  liveCreaturesOnTile,
} from '../entities/CreatureMap.js';
import { difficultyLine } from '../entities/EncounterDifficulty.js';
import { arrivalAlert } from '../combat/Arrival.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { isGM } from '../view/ViewRole.js';
import { addLethargy } from './lethargy.js';
import { creatureForm, deleteCreature, addFromLibrary, clearDefeated } from './creatureForm.js';
import { commitCreatures } from './combatants.js';
import { logDefeatTransition, storeCreature } from './combatantWrites.js';
import { setCombatantExhaustion } from './exhaustion.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * This module wires the panels that list creatures by place: the Encounters
 * panel of the Play sidebar, the Build rail's foe list, and the Build-mode
 * right-click menu of a tile. It also registers `maybeTriggerEncounter`, the
 * alert when the party walks into a threat. The running fight is in
 * `encounterWiring.js`, which calls this function and passes the start of a
 * fight in as `onStartCombat`.
 * @param {AppContext} app
 * @param {{ onStartCombat: () => Promise<void> }} fight
 */
export function wireEncounterPanels(app, { onStartCombat }) {
  const { state } = app;

  /**
   * If the party's current tile holds a threat, show it in a modal over the
   * map. A threat is an undefeated hostile creature standing there. A
   * friendly or neutral creature is not a threat: it lists in the panel and
   * the travelogue announces meeting it, but no modal opens. The
   * first-meeting travelogue line lives in `meetCreaturesHere`
   * (mapTravel.js), on the same arrival path.
   *
   * The threat stays in place: a party that flees or ignores it still sees it
   * in the sidebar for that node. This is only a walk-into-something alert.
   * The readout follows the viewer role. The GM sees exact HP. A player sees
   * the coarse status band. The app calls this
   * after a real move, not on the initial render, so a fresh load does not
   * show a popup. It defaults to the whole party at its shared position. A
   * player who moves their own token passes that character's tile and name
   * instead.
   * @param {import('../types/map.js').PartyPosition} [position]
   * @param {string} [subject]
   */
  app.actions.maybeTriggerEncounter = (
    position = app.partyTracker.getPosition(),
    subject = 'The party',
  ) => {
    const here = hostileCreaturesOnTile(state.creatures, position);
    if (here.length === 0) return;
    const node = app.grid.getNode(position.nodeId);
    const region = node ? node.name : position.nodeId;
    const alert = arrivalAlert(here, {
      gm: isGM(state.role),
      subject,
      region,
    });
    if (alert) alertModal(alert.message, { title: alert.title, label: 'Continue' });
  };

  app.views.encounterPanel = mountEncounterPanel(mustGetElement('encounter-container'), {
    // The panel shows only what is relevant to the party's current position,
    // split into two tabs. The Active tab lists every live creature on the
    // party's exact tile, bystanders included. This is who the party stands
    // with, and it is what a fight started here would draw in. Only the
    // hostile ones raised the arrival alert. The Nearby tab lists the
    // remaining hostiles within range. For the GM, this means hostile
    // creatures within four times the fog reveal radius of the party, plus
    // unplaced ones. For a player, this means only discovered hostiles: one
    // on a tile the fog has revealed, or an unplaced one the party walked
    // into.
    getActiveEncounters: () => liveCreaturesOnTile(state.creatures, app.partyTracker.getPosition()),
    // The hint rates the same list the Active tab shows, so what the GM reads
    // is the fight the Start combat button would begin.
    getDifficulty: () =>
      difficultyLine(
        state.characters,
        liveCreaturesOnTile(state.creatures, app.partyTracker.getPosition()),
      ),
    getNearbyEncounters: () => {
      const position = app.partyTracker.getPosition();
      const hereIds = new Set(liveCreaturesOnTile(state.creatures, position).map((c) => c.id));
      const list = isGM(state.role)
        ? creaturesNear(state.creatures, position, app.partyTracker.revealRadius * 4).filter(
            (c) => c.disposition === 'hostile',
          )
        : discoveredHostiles(state.creatures, position, app.grid.getNode(position.nodeId) ?? null);
      return list.filter((c) => !hereIds.has(c.id));
    },
    onUpdate: (edited) => {
      // Log the transition into defeat exactly once. Compare against the
      // pre-update creature so damage that keeps it down does not log again.
      const prev = state.creatures.find((c) => c.id === edited.id);
      // A hand edit that removes Haste leaves lethargy, as any other end does.
      const next = prev ? addLethargy(app, prev, edited) : edited;
      if (prev) logDefeatTransition(app, prev, next);
      // An HP or chip edit can also break the spell the creature holds.
      storeCreature(app, prev ?? next, next, (c) => {
        state.creatures = replaceById(state.creatures, c);
      });
      // The panel re-renders its own rows once this call resolves. It skips
      // that part of the refresh.
      commitCreatures(app, { panel: false });
    },
    onDelete: (id) => {
      state.creatures = removeById(state.creatures, id);
      app.actions.removeCombatant(id);
      commitCreatures(app, { panel: false });
    },
    // Exhaustion goes through the app write, not through onUpdate, because the
    // sixth level takes the creature to 0 HP and logs both facts.
    onSetExhaustion: (encounter, level) => setCombatantExhaustion(app, encounter.id, level),
    // Authoring, including new foes and spawning from the bestiary, lives
    // in the Build rail. The Play panel edits an existing creature's HP and
    // placement, and saves one as a template mid-session.
    onEdit: (creature) => creatureForm(app, creature, null),
    // Save a creature's blueprint (name, max HP, stat block) to the
    // bestiary. This avoids typing the next Goblin from scratch. Saves with
    // the same name stack as separate templates, because a template is a
    // snapshot, not a live link.
    onSaveTemplate: (creature) => {
      state.bestiary = [
        ...state.bestiary,
        toTemplate(
          slugId(
            creature.name,
            state.bestiary.map((t) => t.id),
          ),
          creature,
        ),
      ];
      app.actions.markDirty();
      app.toasts.show(`Saved "${creature.name}" to the bestiary.`);
    },
    confirmDelete: (creature) => confirmDelete(creature.name),
    // Only the GM can start combat. The button shows only to the GM, and
    // only while the party stands on a tile holding a live creature, with
    // no fight running. A non-hostile creature is enough: a party that
    // turns on a bystander is not stopped, it only gets no arrival alert.
    canStartCombat: () => isGM(state.role) && state.combat === null && creaturesHere(),
    onStartCombat,
    getRole: () => state.role,
  });

  // This is the Build rail's foe authoring list. It lists the hostile
  // creatures staged in the node the GM is viewing, plus unplaced ones, and
  // lets the GM edit them without moving the party there. A new foe
  // defaults to the Build-mode selected tile of the viewed node, so the GM
  // can select a tile and add a foe there directly.
  app.views.buildFoes = mountBuildEncounterPanel(mustGetElement('build-encounters-container'), {
    getEncounters: () =>
      creaturesAt(state.creatures, {
        nodeId: app.navigator.getCurrentNode().id,
      }).filter((c) => c.disposition === 'hostile'),
    onAdd: () =>
      creatureForm(
        app,
        null,
        {
          nodeId: app.navigator.getCurrentNode().id,
          tileId: app.actions.getSelectedTileId() ?? '0,0',
        },
        { disposition: 'hostile', level: 1 },
      ),
    onAddFromTemplate: () => addFromLibrary(app),
    onClearDefeated: () => clearDefeated(app, app.navigator.getCurrentNode().id),
    defeatedCount: () =>
      clearableDefeated(state.creatures, state.combat, app.navigator.getCurrentNode().id).length,
    onEdit: (creature) => creatureForm(app, creature, null),
    onDelete: (creature) => deleteCreature(app, creature),
    // Persist base stat edits from the Build rail's chips. The Play panel
    // shows the same creature and picks up the change.
    onUpdate: (edited) => {
      const prev = state.creatures.find((c) => c.id === edited.id);
      const next = prev ? addLethargy(app, prev, edited) : edited;
      storeCreature(app, prev ?? next, next, (c) => {
        state.creatures = replaceById(state.creatures, c);
      });
      app.views.encounterPanel.update();
      app.actions.markDirty();
    },
    // Selecting a placed creature moves the map view to its staged location.
    onFocus: (creature) => {
      if (creature.location) app.actions.focusLocation(creature.location);
    },
  });

  /**
   * This is the Build-mode right-click menu for a tile of the viewed node.
   * It opens at the pointer. It can create a new foe or NPC on that tile,
   * or edit one already staged there. Every choice opens the one shared
   * creature dialog. The two "New" items differ only in their seed: a foe
   * starts as a level-1 hostile, and an NPC starts as an unleveled neutral.
   * @param {number} x
   * @param {number} y
   * @param {number} clientX
   * @param {number} clientY
   */
  app.actions.openEncounterContextMenu = (x, y, clientX, clientY) => {
    const location = {
      nodeId: app.navigator.getCurrentNode().id,
      tileId: tileIdAt(x, y),
    };
    const here = creaturesOnTile(state.creatures, location);
    openContextMenu(
      [
        {
          label: 'New foe here',
          onSelect: () => creatureForm(app, null, location, { disposition: 'hostile', level: 1 }),
        },
        {
          label: 'New NPC here',
          onSelect: () => creatureForm(app, null, location, { disposition: 'neutral' }),
        },
        ...here.map((c) => ({
          label: `Edit ${c.name}`,
          onSelect: () => creatureForm(app, c, null),
        })),
      ],
      { clientX, clientY },
    );
  };

  // Whether the party stands on anything a fight could involve: at least
  // one live creature on its exact tile, whatever its disposition. The
  // arrival alert keeps its own, hostile-only read.
  function creaturesHere() {
    return liveCreaturesOnTile(state.creatures, app.partyTracker.getPosition()).length > 0;
  }
}
