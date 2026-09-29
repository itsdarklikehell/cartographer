import { advanceTurn, currentParticipant } from '../combat/Initiative.js';
import { skipsTurn } from '../combat/CombatView.js';
import { findCombatant } from './combatants.js';
import { endTurnEffects, startTurnEffects } from './turnEffects.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/**
 * Move the turn pointer to the next combatant who can act, and run the turn
 * boundaries on the way (see `turnEffects.js`).
 *
 * The turn now ending runs its end-of-turn work first. That work can deal
 * damage, and damage can end a spell whose summons then leave the order, so
 * the pointer moves from the order as it stands afterward, never from a copy
 * taken before. The new order is stored, and a round that wrapped ticks,
 * before any later turn boundary runs.
 *
 * A combatant that the pointer steps past because a chip leaves it unable to
 * act (Paralyzed, Stunned) still has a turn that starts and ends. Its retry
 * rolls then, which is how a Hold Person target gets out: a success ends the
 * chip at the end of that turn, so the combatant still loses the turn it was
 * held for. A downed or missing combatant rolls nothing, and only the chips
 * keyed to its turns count the boundary. The combatant the pointer lands on
 * then starts its turn.
 * @param {AppContext} app
 * @param {{
 *   setCombat: (next: CombatState) => void,
 *   tickRound: () => void,
 *   rng?: RandomFn,
 * }} hooks `setCombat` stores the moved order, and `tickRound` runs the
 *   round-wrap ticks
 * @returns {ReturnType<typeof advanceTurn> | null} null when no fight is running
 */
export function advancePastHeld(app, { setCombat, tickRound, rng = Math.random }) {
  const acting = app.state.combat ? currentParticipant(app.state.combat) : null;
  if (acting) endTurnEffects(app, acting.id, { rng });
  const combat = app.state.combat;
  if (!combat) return null;
  /** @type {string[]} */
  const skipped = [];
  const result = advanceTurn(combat, (p) => {
    if (!skipsTurn(findCombatant(app, p.id))) return false;
    skipped.push(p.id);
    return true;
  });
  setCombat(result.state);
  if (result.wrapped) tickRound();
  for (const id of skipped) {
    startTurnEffects(app, id);
    endTurnEffects(app, id, { rng });
  }
  const landing = app.state.combat ? currentParticipant(app.state.combat) : null;
  if (landing && !skipped.includes(landing.id)) startTurnEffects(app, landing.id);
  return result;
}
