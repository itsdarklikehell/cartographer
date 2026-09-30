import { CONSUMABLE_PRESETS } from './EquipmentPresets.js';
import { isDead } from './DeathSaves.js';

/** @typedef {{ count: number, sides: number, bonus: number }} PotionHeal */
/** @typedef {import('../types/dice.js').DiceSelection} DiceSelection */

/**
 * The heal dice of a healing potion, found by the item name. Any other
 * item returns null, and "Use one" then only takes it off the stack.
 * @param {string} name
 * @returns {PotionHeal | null}
 */
export function potionHeals(name) {
  return CONSUMABLE_PRESETS.find((p) => p.name === name)?.heals ?? null;
}

/**
 * The dice tray selection that rolls a potion's heal.
 * @param {PotionHeal} heals
 * @returns {DiceSelection}
 */
export function potionSelection(heals) {
  return { counts: { [`d${heals.sides}`]: heals.count }, modifier: heals.bonus };
}

/**
 * The reason a potion cannot go to a character, or null when it can. A
 * potion does not raise the dead, so a dead drinker keeps the potion.
 * @param {import('../types/entities.js').Character} recipient
 * @returns {string | null}
 */
export function potionBlocked(recipient) {
  return isDead(recipient) ? `${recipient.name} is dead. A potion does not help.` : null;
}
