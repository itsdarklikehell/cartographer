# Curated spells and the full SRD

*Explanation. To add a spell of your own, follow the steps in the
[GM guide](gm-guide.md#add-a-missing-spell).*

The built-in spell list in `src/data/spells/` is a curated part of the
System Reference Document (SRD), not the complete SRD. The SRD 5.1 lists
319 spells, and the app ships 67. Each shipped spell has rules that the
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
| 1st | Magic Missile, Burning Hands, Cure Wounds, Healing Word, Guiding Bolt, Bless, Bane, Thunderwave, Inflict Wounds, Hellish Rebuke, Witch Bolt, Ray of Sickness, Sleep, Color Spray, Shield, Shield of Faith, Mage Armor |
| 2nd | Scorching Ray, Hold Person, Lesser Restoration, Blindness/Deafness, Shatter, Prayer of Healing, Invisibility, Acid Arrow, Spiritual Weapon, Barkskin |
| 3rd | Fireball, Lightning Bolt, Revivify, Counterspell, Conjure Animals, Mass Healing Word, Fear, Vampiric Touch |
| 4th | Ice Storm, Blight, Phantasmal Killer |
| 5th | Cone of Cold, Mass Cure Wounds, Flame Strike, Hold Monster, Destructive Wave |
| 6th | Chain Lightning, Circle of Death, Disintegrate, Freezing Sphere, Sunbeam, Heal |
| 7th | Finger of Death, Fire Storm |
| 8th | Power Word Stun, Sunburst |
| 9th | Meteor Swarm, Power Word Kill |

The selection prefers spells whose rules the current mechanics resolve in
full. The resolver applies these rules:

- A d20 spell attack against AC. A melee spell attack gets the melee side
  of Prone and of an automatic critical hit, and some attacks deal half
  their damage on a miss.
- A condition that a spell attack's hit imposes, with or without a save
  against it, and a hit that gives the caster back part of the damage it
  deals.
- Several projectiles from one cast, each rolled on its own and split
  between the creatures that the caster picks.
- A save against the spell save DC of the caster, with damage that the save
  halves or negates.
- A rule that reads the current hit points of the target in place of a
  save. An HP pool reaches the creatures with the lowest HP first, and an
  HP limit fails the save with no roll. A failed save can kill outright.
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
- Damage that a hit or a failed save leaves on the target, rolled at the
  end of each of the target's turns. With a repeated save, the damage lands
  only when that save fails.
- A condition chip that ends at a turn boundary: the start or the end of
  the caster's next turn, or the end of the target's next turn.
- A spell that the caster uses again on each later turn while it lasts,
  with no new slot.
- A condition chip that ends when its holder takes damage.
- A condition chip that changes the AC of its holder: a flat bonus, a base
  AC for a holder without body armor, or a floor under the AC.
- Damage or effect scaling by spell slot level, and by caster level for
  cantrips. A spell can also scale once per two slot levels.

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

### Later turns

Acid Arrow and Phantasmal Killer leave a chip on the target. The chip deals
its damage at the end of the turns of that creature, and it ends at the
boundary that the spell names. Phantasmal Killer deals its damage only when
the repeated save fails, and a success ends the spell.

Witch Bolt, Spiritual Weapon, and Sunbeam leave a chip on the caster, named
after the spell. While the caster has that chip, a cast of the same spell
is a repeat. The dialog says Repeat, offers no slot, and costs the action or
bonus action that the spell names. A repeat of Witch Bolt deals 1d12 to the
creature that the first cast hit, with no roll. To cast the spell again
from a new slot, remove the chip first.

A chip that ends at a turn boundary shows "next turn" in place of a round
count. Outside a fight there are no turns, so such a chip lasts one round.
The end of a fight removes every such chip.

### Two effects in one hit

Ray of Sickness rolls its attack first. A creature that it hits then makes a
CON save against the spell save DC of the caster, and on a failure it is
Poisoned until the end of the caster's next turn. The creature saves once,
even when several projectiles of one spell hit it.

Vampiric Touch gives the caster hit points equal to half the necrotic
damage that its hit deals. The app counts the damage after the resistances
of the target, so a hit on a creature that resists necrotic damage gives
back less. Vampiric Touch also repeats on each later turn, as Spiritual
Weapon does.

### Hit-point rules

Sleep and Color Spray roll a pool of hit points and roll no save. The app
sorts the chosen targets by current HP, lowest first. Each target whose HP
fits in what the pool has left takes the condition, and its HP comes out of
the pool. The pool passes over a target at 0 HP, an Unconscious target, and
a target that already has the condition of the spell. The log states the
pool roll, and for each target the HP that was left when the pool reached
it.

Sleep ends on a creature when that creature takes damage, including damage
that its temporary hit points absorb. The printed spell does not affect
undead or creatures immune to being charmed. The app does not know which
creatures those are, so the GM leaves them out of the targets. A creature
that an ally shakes awake loses its chip when the GM removes it.

Power Word Kill reads the current HP of the target. A target with 100 HP
or fewer dies with no roll, and one with more is unaffected. A creature
dies at 0 HP. A character dies through the death-save tracker, the same way
as a death from exhaustion, and keeps the HP that the GM tracks.

### Armor class

Shield of Faith gives its target +2 AC while the caster concentrates. Shield
gives its caster +5 AC until the start of the caster's next turn. Its range
is Self, so the cast dialog offers only the caster as the target. The GM
casts it from the reaction control of the combat screen, and the AC of a
later attack reads the chip. The app does not stop the damage of Magic
Missile, so the GM undoes that damage by hand.

Mage Armor gives a character with no body armor a base AC of 13 plus its DEX
modifier, and a shield still adds to it. A higher base on the character
sheet, or a higher unarmored defense, wins. On a creature with no armor,
the spell raises a lower AC to 13 plus the DEX modifier. The chip stays when
the holder puts armor on, but it then changes nothing, and the GM removes it.

Barkskin sets a floor of 16 under the AC of its target. The floor applies
after every bonus, so Shield of Faith on a target with AC 12 gives AC 16,
not 18.

The character sheet, the combatant cards, and every attack roll read the
same AC, so each of them shows the change while the chip lasts.

### Spells described in prose

Three built-in spells have the `utility` effect kind: Light, Lesser
Restoration, and Counterspell. Their rules exist only as text in the
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
- Witch Bolt ends when the caster uses its action for something else, or
  when the target moves out of range. The GM ends it by hand.
- Spiritual Weapon moves up to 20 feet before each attack. The GM tracks
  where it is.
- Sunbeam gives undead and oozes disadvantage on the save. The GM sets the
  mode in the cast dialog.

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

### Buffs outside d20 rolls

Examples: the extra action of Haste, Enlarge/Reduce, Aid, and the temporary
hit points of Heroism.

A rider on a d20 roll works. A chip can add or subtract dice and a flat
amount on attack rolls, saving throws, and ability checks, as Bless, Bane,
Guidance, and Resistance do. A chip can also change AC, as Shield and
Barkskin do. A chip that changes the action budget, the hit-point maximum,
the temporary hit points, or the size of a creature has no rule to change.

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

A new mechanic, such as movement or a lasting zone, lets the list grow. Add the spells that need the
mechanic to the level file under `src/data/spells/` in the same change.
