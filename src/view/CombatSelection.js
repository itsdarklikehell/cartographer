/**
 * How long the board-picked target of the combat screen stays held. The
 * target belongs to one turn. A GM who picked a foe for Mirelle's attack
 * would otherwise see the next combatant's HP box and attack dialog open on
 * that same foe, which can be the combatant whose turn it is.
 */

/** @typedef {import('../types/combat.js').CombatState} CombatState */

/**
 * The key of the turn in progress, or null when no fight runs. Two refreshes
 * on one turn give the same key, and a new round on the same index does not.
 * @param {CombatState | null} combat
 * @returns {string | null}
 */
export function turnKey(combat) {
  return combat ? `${combat.round}:${combat.index}` : null;
}

/**
 * The target that stays held after a refresh. It is released when the turn
 * changes, when it leaves the order, or when `gone` says it left the fight
 * for good (a defeated creature or a dead character). A dying ally stays
 * held on its turn, so the HP box can target it for a heal.
 * @param {{
 *   selectedId: string | null,
 *   heldTurn: string | null,
 *   combat: CombatState | null,
 *   gone: (id: string) => boolean,
 * }} input `heldTurn` is the turn key at the time of the last refresh
 * @returns {{ selectedId: string | null, heldTurn: string | null }}
 */
export function heldTarget({ selectedId, heldTurn, combat, gone }) {
  const turn = turnKey(combat);
  if (!selectedId || turn !== heldTurn) return { selectedId: null, heldTurn: turn };
  const inOrder = combat?.order.some((p) => p.id === selectedId) ?? false;
  return { selectedId: inOrder && !gone(selectedId) ? selectedId : null, heldTurn: turn };
}
