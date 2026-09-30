/**
 * The Stealth contest before a fight, and the log lines of the setup dialog.
 *
 * One side sneaks. Each sneaker rolls Dexterity (Stealth), and the GM can type
 * a total in place of the roll. Each creature on the other side compares its
 * passive Perception with those totals. It notices the threat when its passive
 * score beats at least one total. A watcher that notices no sneaker is
 * surprised. A sneaker with no total yet takes no part, so the GM can fill the
 * rows one at a time.
 */

import { stealthPenalty, unproficientWear } from '../entities/Armor.js';
import { checkBonus, passivePerception, passiveScore, resolveCheck } from '../entities/Checks.js';
import { rollMode } from '../entities/ConditionEffects.js';
import { creatureCheckBonus } from '../entities/CreatureChecks.js';
import { riderSources } from '../entities/FeatChoices.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {'party' | 'foe'} Side */

/**
 * Whether a watcher with this passive Perception notices none of the sneakers.
 * A Stealth total equal to the passive score stays hidden, because the passive
 * score is the DC of the Stealth check, and a check that meets its DC passes.
 * @param {number[]} totals the Stealth totals of the sneakers
 * @param {number} passive
 * @returns {boolean} false when the list is empty, because no one sneaks
 */
export function isSurprised(totals, passive) {
  return totals.length > 0 && totals.every((total) => total >= passive);
}

/**
 * Run the contest for one sneaking side.
 * @param {{ id: string, total: number | null }[]} sneakers
 * @param {{ id: string, passive: number }[]} watchers
 * @returns {{ surprised: string[], noticed: string[] }} watcher ids, in the
 *   order given; both lists are empty when no sneaker has a total
 */
export function stealthContest(sneakers, watchers) {
  const totals = sneakers.flatMap((s) => (s.total === null ? [] : [s.total]));
  if (totals.length === 0) return { surprised: [], noticed: [] };
  /** @type {string[]} */
  const surprised = [];
  /** @type {string[]} */
  const noticed = [];
  for (const w of watchers) (isSurprised(totals, w.passive) ? surprised : noticed).push(w.id);
  return { surprised, noticed };
}

/**
 * Join names into an English list: "A", "A and B", "A, B, and C".
 * @param {string[]} names
 * @returns {string}
 */
export function nameList(names) {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * The outcome line of a contest, for the dialog and the travelogue. It names
 * each sneaker's total and who is surprised.
 * @param {Side} side the side that sneaks
 * @param {{ name: string, total: number }[]} sneakers
 * @param {string[]} surprised the names of the surprised watchers
 * @returns {string}
 */
export function stealthLine(side, sneakers, surprised) {
  const who = side === 'party' ? 'The party sneaks' : 'The foes sneak';
  const rolls = sneakers.map((s) => `${s.name} ${s.total}`).join(', ');
  const outcome =
    surprised.length === 0
      ? 'No one is surprised.'
      : `${nameList(surprised)} ${surprised.length === 1 ? 'is' : 'are'} surprised.`;
  return `${who} (Stealth ${rolls}). ${outcome}`;
}

/**
 * The travelogue line of a parley, which ends the encounter with no fight.
 * @param {string[]} foes the names of the foes the party talks down
 * @returns {string}
 */
export function parleyLine(foes) {
  return foes.length === 0
    ? 'The party settles the encounter without a fight.'
    : `The party settles the encounter with ${nameList(foes)} without a fight.`;
}

/**
 * Roll one Dexterity (Stealth) check for the contest. A character adds its
 * own check bonus and a creature its stat-block bonus. The chips of the roller
 * slant the d20, and so do noisy armor and armor the character is not trained
 * for, as on a Stealth roll from the sheet. Riders such as Guidance add to it.
 * @param {Character | Creature} entity
 * @param {'character' | 'creature'} kind
 * @param {() => number} [rng]
 * @returns {number} the total
 */
export function rollStealth(entity, kind, rng = Math.random) {
  const query = /** @type {const} */ ({
    roller: entity.conditions,
    kind: 'check',
    ability: 'DEX',
  });
  /** @type {import('../entities/ConditionEffects.js').Slant[]} */
  const wear = [];
  let bonus;
  if (kind === 'character') {
    const character = /** @type {Character} */ (entity);
    if (unproficientWear(character).length > 0) wear.push('disadvantage');
    if (stealthPenalty(character)) wear.push('disadvantage');
    bonus = checkBonus(character, 'stealth');
  } else {
    bonus = creatureCheckBonus(/** @type {Creature} */ (entity), 'stealth');
  }
  const mode = rollMode(query, wear);
  return resolveCheck(bonus, null, {
    ...(mode ? { mode } : {}),
    rng,
    conditions: riderSources(entity),
  }).total;
}

/**
 * The passive Perception of a character or a creature.
 * @param {Character | Creature} entity
 * @param {'character' | 'creature'} kind
 * @returns {number}
 */
export function passivePerceptionOf(entity, kind) {
  return kind === 'character'
    ? passivePerception(/** @type {Character} */ (entity))
    : passiveScore(creatureCheckBonus(/** @type {Creature} */ (entity), 'perception'));
}
