/** The three warlock pact boons. */
export type PactBoon = 'chain' | 'blade' | 'tome';

/** What an invocation does that the app resolves. An invocation with no
 * effect is text only, and the GM applies its description. */
export type InvocationEffect =
  /** A change to every Eldritch Blast the warlock casts. `addsModifier`
   * adds the spell modifier to each beam (Agonizing Blast), `range` replaces
   * the range (Eldritch Spear), and `push` is how many feet each beam that hits
   * can push a creature (Repelling Blast). */
  | { kind: 'blast'; addsModifier?: boolean; range?: string; push?: number }
  /** A spell cast at will with no slot. `self` limits it to the warlock, and
   * `noMaterial` drops its material component. */
  | { kind: 'atWill'; spellId: string; self?: boolean; noMaterial?: boolean }
  /** A spell cast once per long rest with a warlock slot. */
  | { kind: 'oncePerRest'; spellId: string }
  /** Skill proficiencies the invocation grants. */
  | { kind: 'skills'; skills: string[] };

/** One eldritch invocation from the catalog. */
export interface Invocation {
  id: string;
  name: string;
  /** The lowest warlock level that can take it. */
  level: number;
  /** A cantrip the warlock needs to know. */
  cantrip?: string;
  /** A pact boon the warlock needs. */
  pact?: PactBoon;
  description: string;
  effect?: InvocationEffect;
}

/** How a character casts a spell through an invocation. */
export interface InvocationCast {
  invocation: Invocation;
  /** True for a once-per-rest cast. False for an at-will cast. */
  oncePerRest: boolean;
  /** True when a once-per-rest cast is spent until a long rest. */
  spent: boolean;
  /** True for a once-per-rest cast that spends no slot (Mystic Arcanum). */
  free?: boolean;
}

/** The warlock picks of one level-up (see InvocationLevelUp.js). */
export interface WarlockPicks {
  /** The pact boon, when the level asks for one. */
  boon?: PactBoon | null;
  /** The new invocation ids. */
  added: string[];
  /** One known invocation replaced by another, or null for none. */
  swap?: { from: string; to: string } | null;
  /** The new Mystic Arcanum spell ids, keyed by spell level. */
  arcana?: Record<string, string>;
  /** The Book of Shadows cantrip ids, for a warlock with none picked yet. */
  tomeCantrips?: string[];
  /** The rituals copied into the Book of Shadows. */
  rituals?: import('./spell.js').Spell[];
}
