import { COST_LABELS } from '../combat/ActionBudget.js';
import { hasCunningAction, turnActionLine, turnActions } from '../combat/TurnActions.js';
import { findCombatant } from './combatants.js';
import { applyConditionToTarget } from './combatantWrites.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').ActionCost} ActionCost */
/** @typedef {import('../combat/TurnActions.js').TurnAction} TurnAction */

/**
 * The turn actions of the combat screen's action bar, and the budget pips
 * the GM can press to mark a cost spent or free. The pure list of actions
 * lives in `combat/TurnActions.js`. This module finds out which features a
 * combatant has, spends the cost through `spendBudget`, and writes the log
 * line and the Dodging chip.
 */

/**
 * The turn actions one combatant can take. A character reads its class
 * levels for Cunning Action. A creature has the standard actions only.
 * @param {AppContext} app
 * @param {string} id
 * @returns {TurnAction[]}
 */
export function turnActionsOf(app, id) {
  const found = findCombatant(app, id);
  if (!found) return [];
  return turnActions({
    cunningAction: found.kind === 'character' && hasCunningAction(found.entity),
  });
}

/**
 * Take one turn action. The cost comes off the budget first, and a turn
 * that already spent it refuses with a toast. The GM can press the budget
 * chip to give the cost back and try again. Dodge also leaves a Dodging
 * chip that ends at the start of the combatant's next turn.
 * @param {AppContext} app
 * @param {string} id
 * @param {TurnAction} action
 * @returns {boolean} whether the action went through
 */
export function takeTurnAction(app, id, action) {
  const found = findCombatant(app, id);
  if (!found) return false;
  const name = found.entity.name;
  if (app.actions.spendBudget && !app.actions.spendBudget(id, action.cost)) {
    app.toasts.show(`${name} has no ${COST_LABELS[action.cost].toLowerCase()} left this turn.`);
    return false;
  }
  app.actions.logEvent('combat', turnActionLine(name, action));
  if (action.id === 'dodge') {
    applyConditionToTarget(app, id, 'Dodging', null, undefined, null, {
      expires: { who: id, at: 'start', count: 1 },
    });
  }
  return true;
}

/**
 * Mark one cost of a combatant's turn spent, or free it again. This is the
 * GM's manual override for a turn spent on something the app does not
 * model, or a spend made by mistake. The write goes through the
 * `toggleBudget` action of encounterWiring, the only writer of
 * `state.combat`. A combatant not in the running fight changes nothing.
 * @param {AppContext} app
 * @param {string} id
 * @param {ActionCost} cost
 */
export function toggleBudget(app, id, cost) {
  const spent = app.actions.toggleBudget?.(id, cost) ?? null;
  if (spent === null) return;
  // The log keeps a record of the override, because nothing else does.
  const name = findCombatant(app, id)?.entity.name ?? 'Unknown combatant';
  const label = COST_LABELS[cost].toLowerCase();
  app.actions.logEvent('combat', `${name}'s ${label} is marked ${spent ? 'used' : 'free'}.`);
}
