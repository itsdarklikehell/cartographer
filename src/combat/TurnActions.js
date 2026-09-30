import { classLevelOf } from '../entities/Multiclass.js';
import { COST_LABELS } from './ActionBudget.js';

/**
 * Pure list of the turn actions that the combat screen offers as buttons,
 * besides weapon swings and spells. 5e gives every combatant the standard
 * actions (Dash, Disengage, Dodge, Help, Hide, Ready). The app does not
 * move tokens or track hidden creatures, so most of them only spend the
 * action and write a log line. Dodge also leaves a Dodging chip on the
 * combatant until the start of its next turn.
 *
 * Each entry names its cost and a group, and the action bar draws one row
 * of buttons per group. A class feature that grants another use of a turn
 * adds entries with its own group, such as the Cunning Action of a rogue,
 * which offers Dash, Disengage, and Hide as a bonus action.
 */

/** @typedef {import('../types/combat.js').ActionCost} ActionCost */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * One button of the action bar.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   cost: ActionCost,
 *   group: string,
 *   title: string,
 *   source?: string,
 * }} TurnAction
 */

/** The standard actions of 5e, in the order the bar shows them. */
export const STANDARD_ACTIONS = Object.freeze([
  { id: 'dash', name: 'Dash', effect: 'gains extra movement equal to its speed this turn' },
  {
    id: 'disengage',
    name: 'Disengage',
    effect: 'moves without provoking opportunity attacks this turn',
  },
  {
    id: 'dodge',
    name: 'Dodge',
    effect: 'makes attacks against it roll at disadvantage until its next turn',
  },
  { id: 'help', name: 'Help', effect: 'gives an ally advantage on its next check or attack' },
  { id: 'hide', name: 'Hide', effect: 'rolls Dexterity (Stealth) to hide' },
  { id: 'ready', name: 'Ready', effect: 'readies an action for a trigger it names' },
]);

/** The standard actions that Cunning Action lets a rogue take as a bonus action. */
const CUNNING = new Set(['dash', 'disengage', 'hide']);

/** The group label of the standard actions. */
export const STANDARD_GROUP = 'Standard actions';

/**
 * Whether a character has Cunning Action: a rogue of level 2 or higher.
 * @param {Character} character
 * @returns {boolean}
 */
export function hasCunningAction(character) {
  return classLevelOf(character, 'rogue') >= 2;
}

/**
 * The turn actions a combatant can take, as bar entries. Every combatant has
 * the standard actions. `cunningAction` adds the bonus-action copies of
 * Dash, Disengage, and Hide.
 * @param {{ cunningAction?: boolean }} [features]
 * @returns {TurnAction[]}
 */
export function turnActions({ cunningAction = false } = {}) {
  /** @type {TurnAction[]} */
  const list = STANDARD_ACTIONS.map((a) => ({
    id: a.id,
    name: a.name,
    cost: /** @type {ActionCost} */ ('action'),
    group: STANDARD_GROUP,
    title: `Take the ${a.name} action: ${a.effect}`,
  }));
  if (cunningAction) {
    for (const a of STANDARD_ACTIONS.filter((s) => CUNNING.has(s.id))) {
      list.push({
        id: a.id,
        name: a.name,
        cost: 'bonus',
        group: 'Cunning Action (bonus action)',
        title: `Take the ${a.name} action as a bonus action: ${a.effect}`,
        source: 'Cunning Action',
      });
    }
  }
  return list;
}

/**
 * The log line for a turn action.
 * @param {string} actorName
 * @param {TurnAction} action
 * @returns {string} for example "Wren takes the Hide action as a bonus
 *   action (Cunning Action)."
 */
export function turnActionLine(actorName, action) {
  const base = `${actorName} takes the ${action.name} action`;
  if (action.cost === 'action') return `${base}.`;
  const via = action.source ? ` (${action.source})` : '';
  return `${base} as a ${COST_LABELS[action.cost].toLowerCase()}${via}.`;
}
