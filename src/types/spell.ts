import type { ChipMods, DamagePart, HitRider, RollRider } from './entities.js';

/** The six ability scores, the keys of a character's stat block. */
export type Ability = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

/** The eight schools of magic. */
export type SpellSchool =
  | 'abjuration'
  | 'conjuration'
  | 'divination'
  | 'enchantment'
  | 'evocation'
  | 'illusion'
  | 'necromancy'
  | 'transmutation';

/** Several separately rolled projectiles fired by one cast, for example
 * Scorching Ray's rays, Eldritch Blast's beams, or Magic Missile's darts.
 * Each projectile picks its own creature and rolls its own attack. Its
 * presence changes how the effect's `damage` reads: per projectile, not per
 * target. */
export interface SpellProjectiles {
  /** How many the spell fires at its base level. */
  count: number;
  /** How many more per scaling increment: a slot level above the spell's
   * own for a leveled spell, or a cantrip breakpoint for a cantrip. */
  perStep?: number;
  /** True when the projectiles hit without an attack roll (Magic Missile). */
  autoHit?: boolean;
}

/** A spell attack roll resolved against the target's AC, dealing damage on
 * a hit. A critical hit doubles the dice. With `projectiles` the cast rolls
 * once per projectile instead, and `damage` is what one projectile deals. */
export interface SpellAttackEffect {
  kind: 'attack';
  damage: DamagePart[];
  projectiles?: SpellProjectiles;
  /** True for a melee spell attack. Prone and an automatic critical hit read
   * this. Absent means the range decides: Touch is melee, and every other
   * range is ranged. */
  melee?: boolean;
  /** True when a miss still deals half the damage (Acid Arrow). */
  halfOnMiss?: boolean;
  /** True when the caster adds its spellcasting ability modifier to the
   * damage of each hit (Spiritual Weapon). A critical hit does not double it. */
  addsModifier?: boolean;
  /** Damage that a hit leaves on the target for later turns. */
  ongoing?: SpellOngoing;
  /** A save or a chip that a hit brings with it (Ray of Sickness). */
  onHit?: SpellOnHit;
  /** How much of the damage its hits deal, after the target's defenses, the
   * caster regains as hit points (Vampiric Touch's half). Absent means none. */
  drain?: SpellDrain;
}

/** The share of dealt damage that a draining spell gives back to its caster. */
export type SpellDrain = 'half' | 'full';

/** What a spell attack's hit does beyond its damage. With `saveAbility` the
 * creature it hits rolls that save against the caster's spell save DC, and
 * takes the condition only on a failure. Without it, every hit imposes the
 * condition. */
export interface SpellOnHit {
  /** The condition name that a hit imposes, for example 'Poisoned'. */
  condition: string;
  saveAbility?: Ability;
  /** When the condition ends, as a turn boundary. Absent means the spell's
   * own duration. */
  until?: ChipUntil;
}

/** When a chip that a spell writes ends, as a turn boundary. `caster-start`
 * is the start of the caster's next turn, `caster-end` the end of the
 * caster's next turn, and `target-end` the end of the target's next turn.
 * Outside a fight there are no turns, so such a chip lasts one round. */
export type ChipUntil = 'caster-start' | 'caster-end' | 'target-end';

/** Damage a spell deals again on the turns after the cast. It rides a chip on
 * the target and rolls at the end of each of the target's turns. With a save
 * that allows a repeated save, it rolls only when that save fails. */
export interface SpellOngoing {
  damage: DamagePart[];
  /** Extra dice for each scaling increment of the cast. */
  perStep?: DamagePart[];
  /** When the chip ends, for a chip that the ongoing damage writes itself.
   * Absent means the end of the target's next turn. A save's condition chip
   * that has the damage keeps its own duration. */
  until?: ChipUntil;
}

/** A spell that the caster can use again on later turns without a new slot,
 * while the spell lasts (Spiritual Weapon, Witch Bolt, Sunbeam). */
export interface SpellRepeat {
  /** What each repeat costs. Absent means the casting time's cost. */
  cost?: 'action' | 'bonus';
  /** Fixed damage that each repeat deals to the creatures the first cast
   * hit, with no roll (Witch Bolt). Absent means each repeat resolves the
   * spell's own effect again against new targets. */
  damage?: DamagePart[];
}

/** A saving throw that the target rolls against the caster's spell save DC.
 * On a failure the full damage lands, and any condition is imposed. On a
 * success the target takes half damage when halfOnSave, or nothing. */
export interface SpellSaveEffect {
  kind: 'save';
  saveAbility: Ability;
  damage: DamagePart[];
  halfOnSave: boolean;
  /** A condition name imposed on a failed save, for example 'Frightened'. */
  condition?: string;
  /** True when the imposed condition lets the target retry the save at the
   * end of each of its turns, ending the effect on a success (Hold Person).
   * Absent means the condition runs for the spell's whole duration. */
  saveEnds?: boolean;
  /** What the imposed condition adds to the target's later rolls (Bane's
   * -1d4). It rides on the chip, so it lasts as long as the chip does. Only
   * meaningful alongside a condition. */
  rider?: RollRider;
  /** An HP limit on the first save (Power Word Stun's 150). A target whose
   * current HP is at or under it fails that save with no roll. A target
   * above it is unaffected. Absent means every target rolls. */
  hpLimit?: number;
  /** A pool of hit points that the cast rolls instead of a save (Sleep's
   * 5d8). The targets take the effect in order of current HP, lowest first,
   * while their HP fits in what the pool has left. Each one affected takes
   * its HP out of the pool. With a pool, no target rolls a save. */
  hpPool?: SpellHpPool;
  /** True when a failed save kills the target outright (Power Word Kill,
   * whose HP limit fails the save with no roll). */
  kills?: boolean;
  /** True when the imposed condition ends as soon as its holder takes
   * damage (Sleep). Only meaningful alongside a condition. */
  endsOnDamage?: boolean;
  /** When the imposed condition ends, as a turn boundary (Sunbeam's
   * blindness until the caster's next turn). Absent means the spell's own
   * duration. */
  until?: ChipUntil;
  /** Damage that a failed save leaves on the target for later turns. With a
   * condition, the damage rides that chip. */
  ongoing?: SpellOngoing;
}

/** The dice of an HP pool, and how many more dice each scaling increment
 * adds (Sleep's +2d8 per slot level). */
export interface SpellHpPool {
  count: number;
  sides: number;
  perStep?: number;
}

/** Restorative magic: healing dice applied to the target. */
export interface SpellHealEffect {
  kind: 'heal';
  healing: DamagePart[];
  /** True when the caster adds its spellcasting ability modifier to the
   * healing roll, once per target (Cure Wounds, Healing Word). Absent means
   * the dice alone heal. */
  addsModifier?: boolean;
  /** True for a spell that raises the dead (Revivify). It heals only a dead
   * target, and it has no effect on a living one. Absent means the heal has no
   * effect on a dead target. */
  revives?: boolean;
}

/** A spell that puts a condition chip on each willing target, with no roll
 * to resolve. The chip carries the cast's source, so it comes off when the
 * caster stops holding the spell. Bless, Bane's opposite number, and
 * Guidance work this way, as does a chip that only names a state such as
 * Invisible. */
export interface SpellBuffEffect {
  kind: 'buff';
  /** What the chip is called. Absent means the chip carries the spell's own
   * name, which is what a GM who types nothing wants. */
  condition?: string;
  /** What the chip adds to the target's later rolls. Absent means the chip
   * only names a state. */
  rider?: RollRider;
  /** What the chip changes besides a roll, such as AC (Shield, Barkskin). */
  mods?: ChipMods;
  /** How much more `mods.maxHP` each scaling increment adds (Aid's 5). */
  modsPerStep?: { maxHP?: number };
  /** Temporary hit points each target gains at the cast (False Life). */
  tempHP?: SpellTempHP;
  /** True when the chip grants the caster's spell modifier as temporary HP
   * at the start of each of the holder's turns (Heroism). */
  tempEachTurn?: boolean;
  /** When the chip ends, as a turn boundary (Shield's start of the caster's
   * next turn). Absent means the spell's own duration. */
  until?: ChipUntil;
  /** Extra damage the chip adds to hits (Divine Favor). With `mark` set, the
   * chip goes on a foe, and only the caster's hits against it deal the
   * damage (Hunter's Mark). */
  hit?: HitRider;
}

/** The temporary hit points a buff grants at the cast: `count` dice of
 * `sides` plus `flat`, with `flatPerStep` more per scaling increment. False
 * Life is 1d4 + 4, and 5 more per slot level above 1st. */
export interface SpellTempHP {
  count: number;
  sides: number;
  flat: number;
  flatPerStep?: number;
}

/** A spell that puts creatures on the map. The effect names one library
 * creature template, and the cast spawns that many copies of it on the tile
 * of the party. The side they fight on comes from the disposition of the
 * template. A concentration spell owns its summons, so they leave when the
 * caster stops holding the spell. */
export interface SpellSummonsEffect {
  kind: 'summons';
  /** The name of the library creature template to spawn. The library merges
   * creature entries by name, so a name keeps its meaning after a GM
   * customizes the template. */
  creature: string;
  /** How many to spawn at the base level of the spell. */
  count: number;
  /** How many more per scaling increment, the same increment that
   * `SpellProjectiles.perStep` counts. */
  countPerStep?: number;
}

/** A spell with no roll to resolve. Its rules live in the description text. */
export interface SpellUtilityEffect {
  kind: 'utility';
}

export type SpellEffect =
  | SpellAttackEffect
  | SpellSaveEffect
  | SpellHealEffect
  | SpellBuffEffect
  | SpellSummonsEffect
  | SpellUtilityEffect;

/** How a spell grows when cast with a higher-level slot (leveled spells), or
 * as the caster levels up (cantrips scale at levels 5, 11, and 17). */
export interface SpellScaling {
  /** Extra damage or healing dice added per slot level above the spell's
   * base level (leveled spells), or at each cantrip breakpoint (cantrips). */
  damagePerLevel?: DamagePart[];
  /** Extra targets gained per slot level above base, for example Magic Missile. */
  targetsPerLevel?: number;
  /** How many slot levels above the base make one scaling increment, for a
   * spell that grows every two slot levels (Spiritual Weapon). Absent means
   * one. Cantrips ignore it. */
  levelsPerStep?: number;
}

/** How long a cast takes. `action`, `bonus`, and `reaction` are the three
 * in-combat costs. `minutes` and `hours` carry an `amount`. `special` holds
 * text that neither the parser nor the form can read as any of the above. */
export interface CastingTime {
  kind: 'action' | 'bonus' | 'reaction' | 'minutes' | 'hours' | 'special';
  /** How many minutes or hours, for those two kinds. */
  amount?: number;
  /** What the reaction responds to, for example 'which you take when you
   * see a creature casting a spell'. Only meaningful for `reaction`. */
  trigger?: string;
  /** The original text, for `special`. */
  text?: string;
}

/** How long a spell lasts once cast. The amount-bearing kinds carry
 * `amount`. `upTo` marks a duration that the caster can end early, which is
 * how 'up to 1 minute' differs from a flat '1 minute'. */
export interface SpellDuration {
  kind: 'instantaneous' | 'rounds' | 'minutes' | 'hours' | 'days' | 'until-dispelled' | 'special';
  /** How many rounds, minutes, hours, or days, for those four kinds. */
  amount?: number;
  /** True when the printed duration reads 'up to' the amount. */
  upTo?: boolean;
  /** The original text, for `special`. */
  text?: string;
}

/** The material component that a spell needs, for the spells whose material
 * is worth naming. `text` is the printed component ('diamonds worth 300
 * gp'). `costGP` is that cost as a number, where the spell states one.
 * `consumed` marks a material that the cast destroys. The app enforces only
 * a consumed material against the caster's inventory. An unconsumed
 * material is assumed covered by a component pouch or a spellcasting
 * focus, the same as in play. */
export interface SpellMaterials {
  text: string;
  costGP?: number;
  consumed: boolean;
}

/** A single spell, identical in shape whether it is a built-in default or a
 * GM-authored or imported entry. */
export interface Spell {
  id: string;
  name: string;
  /** 0 for a cantrip. 1 through 9 for a leveled spell. */
  level: number;
  school: SpellSchool;
  /** Class ids that can learn the spell (its spell lists). */
  classes: string[];
  castingTime: CastingTime;
  range: string;
  /** Component letters present, for example ['V', 'S', 'M']. */
  components: string[];
  /** What the M component is, for a spell whose material is worth naming.
   * Absent means the letters are the whole story. */
  materials?: SpellMaterials;
  duration: SpellDuration;
  concentration: boolean;
  ritual: boolean;
  description: string;
  /** How many creatures one cast can resolve against, before scaling adds
   * more. 0 means the spell covers an area instead of a fixed number of
   * creatures, so the caster picks any number of targets. Absent counts as 1. */
  targetCount?: number;
  effect: SpellEffect;
  /** How the spell scales with slot level or caster level. Absent means no
   * scaling. */
  scaling?: SpellScaling;
  /** How the caster uses the spell again on later turns without a new slot.
   * Absent means each use is a new cast. */
  repeat?: SpellRepeat;
}
