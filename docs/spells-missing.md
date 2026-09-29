# Curated spells and the full SRD

*Explanation. To add a spell of your own, follow the steps in the
[GM guide](gm-guide.md#add-a-missing-spell).*

The built-in spell list in `src/data/spells/` is a curated part of the
System Reference Document (SRD), not the complete SRD. The SRD 5.1 lists
319 spells, and the app ships 54. Each shipped spell has rules that the
spell resolver applies in full, or a description that names the clause
that the resolver leaves to the GM.

## The built-in list

The list covers each spell level from cantrip to 9th level. It includes
spells for all six full caster classes: bard, cleric, druid, sorcerer,
warlock, and wizard. It also uses all six effect kinds that the resolver
handles: `attack`, `save`, `heal`, `buff`, `summons`, and `utility`.

The paladin and the ranger share leveled spells with the other classes.
The paladin also has one spell of its own, Destructive Wave.

| Level | Spells |
| ----- | ------ |
| Cantrip | Fire Bolt, Ray of Frost, Shocking Grasp, Eldritch Blast, Sacred Flame, Vicious Mockery, Acid Splash, Poison Spray, Chill Touch, Resistance, Guidance, Light |
| 1st | Magic Missile, Burning Hands, Cure Wounds, Healing Word, Guiding Bolt, Bless, Bane, Thunderwave, Inflict Wounds, Hellish Rebuke, Mage Armor |
| 2nd | Scorching Ray, Hold Person, Lesser Restoration, Blindness/Deafness, Shatter, Prayer of Healing, Invisibility |
| 3rd | Fireball, Lightning Bolt, Revivify, Counterspell, Conjure Animals, Mass Healing Word, Fear |
| 4th | Ice Storm, Blight |
| 5th | Cone of Cold, Mass Cure Wounds, Flame Strike, Hold Monster, Destructive Wave |
| 6th | Chain Lightning, Circle of Death, Disintegrate, Freezing Sphere, Heal |
| 7th | Finger of Death, Fire Storm |
| 8th | Power Word Stun, Sunburst |
| 9th | Meteor Swarm |

The selection prefers spells whose rules the current mechanics resolve in
full. The resolver applies these rules:

- A d20 spell attack against AC.
- Several projectiles from one cast, each rolled on its own and split
  between the creatures that the caster picks.
- A save against the spell save DC of the caster, with damage that the save
  halves or negates.
- Dice of healing, or a flat amount of healing.
- A condition chip that adds a die or a flat amount to the later attack
  rolls, saving throws, or ability checks of the target.
- A condition chip for one of the eleven standard conditions that have
  rules. Such a chip gives advantage or disadvantage on later d20 rolls,
  makes a melee hit a critical hit, fails a save with no roll, or costs
  the holder its turn.
- A condition chip that a failed save imposes, with a new save at the end
  of each turn of the target.
- A group of summoned creatures from one library template, which stay while
  the caster keeps concentration.
- Damage or effect scaling by spell slot level, and by caster level for
  cantrips.

A *condition chip* is the label on a creature or a character that records a
condition, such as Blinded or Bless.

### One-roll and lasting riders

A *rider* is the die or the flat amount that a chip adds to later rolls.
Guidance and Resistance have a one-roll rider, as in the printed rules. The
first matching roll uses the die, and the app then removes the chip.
Guidance adds 1d4 to one ability check, and Resistance adds 1d4 to one
saving throw.

Bless and Bane have a lasting rider. The chip adds or subtracts 1d4 on each
attack roll and saving throw until its duration ends or the caster stops
concentrating.

### Spells described in prose

Four built-in spells have the `utility` effect kind: Light, Mage Armor,
Lesser Restoration, and Counterspell. Their rules exist only as text in the
description of each spell, and the GM applies them. They are in the list
because a GM notices when a spell this common is missing.

### Partial rules

Some entries have one clause that the app cannot resolve beside a payload
that it can. The description of each entry states the difference:

- Chill Touch deals its damage and leaves the clause that stops healing to
  the GM.
- Blindness/Deafness always blinds, because deafness has no rule in the
  app.
- Flame Strike raises its fire dice at a higher slot. The printed spell
  lets the caster choose the fire dice or the radiant dice.
- Conjure Animals always summons wolves.

## Spells that need a missing mechanic

Each omitted spell needs a mechanic that the app does not have. If the
list included such a spell, it would print rules that the app cannot
apply.

### Movement and turn control

Examples: Slow, Banishment, Command, Dominate Person, and Confusion.

A failed save can add a condition chip, and this part works. Hold Person,
Hold Monster, Blindness/Deafness, Fear, and Sunburst all ship. The other
clauses of these spells need more:

- Slow halves the speed of the target, but no rule moves a token by feet,
  so speed has no effect in a fight.
- Slow also takes away an action. The combat screen tracks the action, the
  bonus action, and the reaction of each turn, but no chip can change that
  budget.
- Banishment removes the creature from the map.
- Dominate Person gives control of one creature to another.

### Lingering zones

Examples: Web, Grease, Wall of Fire, Cloudkill, Moonbeam, and Spirit
Guardians.

Area targeting lets the caster pick the creatures that the spell hits. A
spell with `targetCount: 0` offers every reachable combatant, and the
caster selects each creature in the area. Fireball, Shatter, Circle of
Death, and Fire Storm work this way.

A cast resolves once, and the app has no template for map areas. So no
rule keeps a zone on the map after the cast.

### Damage on later turns

Examples: Acid Arrow, Witch Bolt, Phantasmal Killer, Sunbeam, and
Spiritual Weapon.

One cast rolls one set of dice. No rule rolls the spell again on the turns
that follow.

### Two mechanics in one cast

Examples: Ray of Sickness, Vampiric Touch, and Heroism.

A spell has one effect. A cast cannot roll an attack and a save together,
and it cannot damage one creature and heal another.

### Hit-point thresholds

Examples: Sleep, Color Spray, and Power Word Kill.

No effect kind compares the hit points of a target against a threshold, so
the cast cannot decide which creatures the spell affects.

### Buffs outside d20 rolls

Examples: the +5 AC reaction of Shield, the extra action of Haste,
Enlarge/Reduce, Barkskin, and Aid.

A rider on a d20 roll works. A chip can add or subtract dice and a flat
amount on attack rolls, saving throws, and ability checks, as Bless, Bane,
Guidance, and Resistance do. A chip that changes AC, the action budget,
the hit-point maximum, or the size of a creature has no rule to change.

### Summon choice and control

Examples: Find Familiar and Animate Dead.

Summoning works. A `summons` effect names one library creature template
and a count. The cast puts those creatures on the tile of the party, and
they leave when the caster stops concentrating on the spell.

The app does not have these parts:

- A menu of templates for the caster to choose from.
- A summon that a player runs as a companion. A summon takes its own turn
  as a combatant.
- A summon that no concentration keeps, such as an animated skeleton or a
  familiar. Such a summon stays until the GM removes it by hand.

### Exploration and social spells

Examples: Detect Magic, Identify, Charm Person, Suggestion, Divination, and
teleportation.

These spells have rules that exist only as text, so they work as `utility`
entries. The built-in list leaves them out only to stay small. A GM can add
spells of this group by hand with the least work of any group.

### Eldritch invocations

The app does not model eldritch invocations. The built-in list includes
Eldritch Blast, but no entries that depend on invocations. Pact magic is
modeled, so a warlock casts from its own pact pool and not from the standard slot
table.

## Adding a spell by hand

A built-in spell and a GM-authored spell use the same schema, so a missing
spell needs no code change. The Spells rail in Library mode creates a
spell. A custom spell whose name matches a default replaces that default.

A library export, `campaign-library.json`, is portable. A shared file of
extra spells merges into the library of any browser.

The `attack`, `save`, `heal`, `buff`, `summons`, and `utility` effects,
with scaling by slot level and by cantrip level, cover most mechanics in
the SRD. A spell outside them works as a `utility` entry with its rules in
the description. The GM applies those rules by hand, as at a physical
table. The [GM guide](gm-guide.md#add-a-missing-spell) gives the steps.

A new mechanic, such as movement, a lasting zone, or an effect that rolls
again on a later turn, lets the list grow. Add the spells that need the
mechanic to the level file under `src/data/spells/` in the same change.
