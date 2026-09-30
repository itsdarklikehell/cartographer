import { confirmModal, promptModal } from '../ui/Modal.js';
import { addXP } from '../entities/Character.js';
import { fightEnd, splitCaption, xpSplit } from '../combat/FightEnd.js';
import { clampInt } from '../util/num.js';
import { standDown } from '../entities/CreatureMap.js';
import { combatLabels, commitCreatures, findCombatant } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../combat/FightEnd.js').FightEnd} FightEnd */

/**
 * Ask before End combat drops a fight that hostile creatures still stand
 * in. The button sits next to Next turn, so one stray click would otherwise
 * throw away a live fight. A won or lost fight closes with no question.
 * @param {AppContext} app
 * @returns {Promise<FightEnd | null>} the fight's summary, or null when the
 *   GM keeps the fight or no fight is running
 */
export async function confirmFightEnd(app) {
  const combat = app.state.combat;
  if (!combat) return null;
  const labels = combatLabels(
    app,
    combat.order.map((p) => p.id),
  );
  const end = fightEnd(combat, (id) => findCombatant(app, id), labels);
  if (end.standing === 0 || end.outcome === 'defeat') return end;
  const n = end.standing;
  const ok = await confirmModal(
    `${n} ${n === 1 ? 'foe is' : 'foes are'} still standing. End the fight anyway?`,
    { title: 'End combat', confirmLabel: 'End combat', variant: 'danger' },
  );
  // The fight can end in another tab while the dialog is open.
  return ok && app.state.combat ? end : null;
}

/**
 * Turn foes neutral when they stop fighting, after a fight or a parley. The
 * write goes through commitCreatures, so it marks the campaign dirty and
 * undo steps back over it like any other creature edit. The GM can make a
 * foe hostile again in the creature dialog.
 * @param {AppContext} app
 * @param {Set<string>} ids
 */
export function standDownFoes(app, ids) {
  const next = standDown(app.state.creatures, ids);
  if (next === app.state.creatures) return;
  app.state.creatures = next;
  commitCreatures(app);
}

/** The field name of the overcome box for one standing foe. */
const overcomeField = (/** @type {string} */ id) => `overcome:${id}`;

/**
 * When a fight ends with no defeat of the party, offer the experience points
 * of the defeated foes to the characters still alive. A foe that still
 * stands gets a box to count it as overcome, because in 5e a foe that
 * surrenders, flees, or is captured is worth its points too. Each ticked box
 * adds that foe's points and restates the per-character amount. The GM can
 * still change the amount or cancel. Each earner gets the amount through
 * addXP, so a new level becomes pending the usual way.
 *
 * A foe counted as overcome turns neutral (see standDownFoes), so a captive
 * does not start a new encounter each time the party steps onto its tile.
 * @param {AppContext} app
 * @param {FightEnd} end
 */
export async function offerFightXP(app, end) {
  const count = end.earners.length;
  if (end.outcome === 'defeat' || count === 0) return;
  const foes = end.standingFoes.filter((foe) => foe.xp > 0);
  if (end.xp <= 0 && foes.length === 0) return;
  /** @param {(name: string) => string} get */
  const totalOf = (get) =>
    end.xp + foes.reduce((sum, foe) => sum + (get(overcomeField(foe.id)) ? foe.xp : 0), 0);
  const caption = (/** @type {number} */ total) =>
    `XP per character (${splitCaption(total, count)})`;
  const values = await promptModal(
    'Award XP for the fight',
    [
      ...foes.map((foe) => ({
        name: overcomeField(foe.id),
        label: `Count ${foe.name} as overcome (surrendered, fled, or captured), ${foe.xp} XP`,
        type: /** @type {const} */ ('checkbox'),
      })),
      {
        name: 'amount',
        label: caption(end.xp),
        type: 'number',
        value: end.share,
        min: 0,
      },
    ],
    {
      submitLabel: 'Award',
      onChange: (name, form) => {
        if (name === 'amount') return;
        const total = totalOf(form.get);
        form.setLabel('amount', caption(total));
        form.set('amount', xpSplit(total, count).share);
      },
    },
  );
  if (!values) return;
  const overcome = new Set(foes.filter((foe) => values[overcomeField(foe.id)]).map((f) => f.id));
  standDownFoes(app, overcome);
  const amount = clampInt(values.amount, 0);
  if (amount <= 0) return;
  const earners = new Set(end.earners);
  app.state.characters = app.state.characters.map((c) =>
    earners.has(c.id) ? addXP(c, amount) : c,
  );
  app.actions.refreshSelectedCharacter();
  app.actions.markDirty();
  app.actions.logEvent('note', `The party is awarded ${amount} XP each for the fight.`);
  app.toasts.show(`Awarded ${amount} XP to ${count} character${count === 1 ? '' : 's'}.`);
}
