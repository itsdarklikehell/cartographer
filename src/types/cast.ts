import type { CombatTarget } from '../app/combatants.js';
import type { ActionCost } from './combat.js';
import type { SpellCaster } from './entities.js';
import type { ModalField } from './modal.js';
import type { Ability, CastingTime, Spell } from './spell.js';

/** Why a cast cannot go ahead. The caller shows the message and stops.
 * There are two reasons: nothing to target, and no slot high enough for a
 * leveled spell. */
export interface CastRefused {
  ok: false;
  message: string;
}

/** Everything a cast needs, worked out before the dialog opens. This is the
 * contract between the four cast modules: `spellCast.js` builds it,
 * `spellCastFields.js` restates its fields when one changes, and
 * `spellCastResolve.js` rolls and applies it.
 *
 * `actionCost` is what the cast takes off the caster's turn. It is null when
 * nothing does: no fight is running, or the casting time is longer than a
 * turn. `actionBlocked` is true when the turn cannot pay for the cast, which
 * the opt-out in the dialog is the way past. */
export interface CastPlan {
  ok: true;
  /** The character or combatant casting. The write-back decides its shape. */
  entity: any;
  spell: Spell;
  caster: SpellCaster;
  targets: CombatTarget[];
  saveAbility: Ability | null;
  slotLevels: number[];
  /** True for a Wizard's unprepared ritual, which casts only as a ritual. */
  ritualOnly?: boolean;
  sourceClass: string | undefined;
  dc: number;
  material: ReturnType<typeof import('../entities/MaterialCheck.js').materialCheck>;
  armor: string[];
  actionCost?: ActionCost | null;
  actionBlocked?: boolean;
  /** Why the bonus action spell rule blocks this cast, or null (see `SpellRule.js`). */
  ruleBlock?: string | null;
  /** The turn flag this cast sets for the rule, or null. */
  spellFlag?: import('./combat.js').TurnFlag | null;
  castingTime?: CastingTime;
  /** Present for a cast that spends no slot because an earlier turn paid for
   * it: a repeat of a spell the caster still keeps open. */
  free?: CastFree | null;
  /** Present for a cast through a warlock invocation: at will with no slot,
   * or once per long rest with a slot. */
  invocation?: import('./invocation.js').InvocationCast | null;
  fields: ModalField[];
}

/** A cast that costs no slot. It resolves at `slotLevel`, the level the first
 * cast used. `repeat` marks a repeat of a spell still open from an earlier
 * turn, which needs no concentration of its own and no component. A cast at
 * will through an invocation has no `repeat` and resolves at the spell's own
 * level. */
export interface CastFree {
  slotLevel: number;
  repeat?: boolean;
}

/** How the GM picked to pay for a cast that has more than one way (see
 * `CastRoute.castRoutes`): repeat an open spell for free or cast it anew, or
 * cast an invocation's spell at will or with a slot. */
export type CastRoute = 'repeat' | 'anew' | 'invocation' | 'slot';
