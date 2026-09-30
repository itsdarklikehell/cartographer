# Combat

*Explanation. Back to the [architecture overview](../architecture.md).*

A fight runs in its own mode. `combat` is the fourth `AppMode`, beside
`play`, `build`, and `library`. Like Library mode, combat mode replaces the
map columns. The `body.mode-combat` class hides the map, the Play sidebar,
and the authoring rails, and the full-width combat screen takes their place.

The header's mode switch has no button for combat mode. The app enters the
mode when a fight starts and leaves it when the fight ends, in whatever way
the fight ends. During a fight, the ribbon's Back to map control and the
sidebar's Initiative card move a tab between the map and the screen. If no
fight is running, `sessionControls.js` turns a request for combat mode into
Play mode, so a stale `setMode` call cannot show an empty screen.

Combat mode works for the GM and for a player. A tab that switches to the
Player role leaves Build mode and Library mode, because those modes are for
authoring. The same guard in `sessionControls.js` keeps a player on the
combat screen, because the player takes the turn of their own character
there. A player tab hides the header's mode switch, so a player gets to the
map through the ribbon's Back to map control.

The [wiring layer](app-wiring.md#encounterwiringjs-plus-creatureformjs-weaponattackjs-the-four-cast-modules-combatantsjs)
and [Entities](entities.md) document the 5e resolution of an attack, a cast,
and a damage application.

## Modules

```
src/combat/Initiative.js ..... pure: the order, the round counter, the turn
                               pointer, and the turn advance
src/combat/ActionBudget.js ... pure: what one combatant already spent on the
                               current turn, and what a turn start gives back
src/combat/CombatView.js ..... pure: projects a CombatState into rows a
                               panel can draw (side, HP, AC, defeated,
                               who can act), plus the fight's outcome
src/combat/FightEnd.js ....... pure: the outcome, the foes still standing,
                               and the XP of the defeated foes
src/combat/AttackResolve.js .. pure: the hit and crit table, the damage dice,
                               and the attacker's stats and proficiency
src/combat/AttackOptions.js .. pure: which per-swing options a weapon allows
                               (Sneak Attack, the two-handed grip)
src/combat/TwoWeapon.js ...... pure: the off-hand swing of two-weapon fighting
src/combat/Reactions.js ...... pure: what a reaction can spend itself on
src/combat/Cover.js .......... pure: the AC bonus of half and three-quarters
                               cover
src/combat/Loadout.js ........ pure: what a combatant wears, swings, and
                               keeps in slots, and how much of that a
                               given viewer can see
src/combat/Arrival.js ........ pure: the text of the alert for the hostile
                               creatures on a tile the party walks onto
src/combat/InitiativeRoll.js . pure: one initiative roll as a DEX check, with
                               the slant, the exhaustion penalty, and a note
src/combat/RefreshScheduler.js pure: one deferred refresh for a burst of
                               writes, with an injectable scheduler
src/combat/FocusRestore.js ... pure: names a control so a rebuild can give
                               focus back to its twin, with fallbacks
src/combat/HPLines.js ........ pure: the log lines for a damage or heal the
                               GM applies from the amount field
src/ui/CombatSetup.js ........ the setup dialog: one initiative row per
                               combatant, and the Roll initiative fill
src/ui/CombatScreen.js ....... the screen: composes the columns, the board,
                               the outcome banner, the live region, and the
                               focus handoff after a rebuild
src/ui/CombatRibbon.js ....... the turn ribbon: the round heading, one chip
                               per participant, the turn controls, and the
                               roving tab stop helpers
src/ui/CombatActiveColumn.js . the left column: the inspected combatant's
                               facts, HP controls, chips, concentration,
                               death saves, loadout, and action bar
src/ui/CombatLog.js .......... the log column: a role="log" list that only
                               adds the rows logged since its last update
src/ui/CombatantCard.js ...... one board card, which is also a target-picker
                               button when given an onSelect
src/ui/LoadoutBlock.js ....... a loadout as labelled lines, shared by the
                               cards and the active column
src/ui/CombatActionBar.js .... the active combatant's weapons and spells as
                               buttons, grouped by kind and spell level
src/ui/InitiativePanel.js .... the sidebar card: one status line plus the
                               Open combat button
src/app/combatWiring.js ...... mounts the screen, keeps its transient UI
                               state, and sends everything else to actions
src/app/encounterWiring.js ... the only writer of state.combat, with the turn
                               flow as registered actions
src/app/turnAdvance.js ....... the turn advance, with the turn boundaries
                               that it passes on the way
src/app/turnEffects.js ....... what the start and the end of one turn do:
                               repeated saves, later-turn damage, and
                               chips that end at a boundary
src/app/combatEnd.js ......... the End combat confirmation and the XP award
styles/combat.css ............ the mode's layout and the screen's styles
```

## The module that writes the fight

`encounterWiring.js` owns the running fight. The fight lives only in
`state.combat`. Every read goes through a `current()` accessor and every
write goes through `setCombat`, and both accessors are local to that module.

A cross-tab rehydrate writes `state.combat` and nothing else. A follower tab
whose fight ended in another tab therefore reads the ended fight from the
same field on its next refresh. A second copy of the fight, such as a
closure variable beside the state field, would miss that write and keep
drawing the old order.

The turn advance and the combat end are registered on `app.actions` as
`advanceCombatTurn` and `endCombat`. The screen's Next turn and End combat
buttons run the same code as every other caller, including the round-wrap
condition ticks and the concentration sweeps. `removeCombatant` follows the
same pattern, so anything that changes the fight goes through the module
that owns it.

### The turn advance

`advanceTurn` in `Initiative.js` takes a predicate and steps the pointer past
every combatant that the predicate rejects. `CombatView.skipsTurn` is that
predicate. It covers a downed combatant, a combatant whose chips cost it the
turn (Stunned or Lethargic, for example), and a participant id that
resolves to nothing.

A defeated goblin never gets a turn, but its chip stays in the ribbon, struck
through. A stunned goblin also keeps its place, marked with a dashed edge
instead of a strike, because it is still in the fight and only its turn is
gone. If the predicate rejects every participant, the pointer walks one full
cycle and stops where it started. The round counter and the timed effects
then keep moving until the GM closes the fight.

`app/turnAdvance.js` wraps the advance in `advancePastHeld`, which runs the
turn boundaries that the advance passes (see `app/turnEffects.js`). The end
of a turn rolls the repeated saves of the combatant, such as the save that
ends Hold Person. It then deals the damage that the chips of the combatant
leave for later turns, such as the acid of Acid Arrow, and counts the
boundary for every chip keyed to that turn. The start of a turn counts the
boundary, and then a chip with `mods.tempHPEachTurn` (Heroism) grants its
temporary hit points to the combatant.

`advancePastHeld` runs its work in this order:

1. The turn that ends runs its end-of-turn work.
2. The pointer moves from `state.combat` as that work left it. Damage can
   end a spell whose summons then leave the order, and a pointer moved from
   a copy taken earlier would write those summons back.
3. The new order is stored.
4. Each combatant that the pointer stepped past starts and ends its turn.
   A paralyzed target still has a turn that ends, so its retry rolls there.
   Without that roll, it stays held for the whole duration. When the round
   wraps, the skipped combatants below the old pointer take their turns
   first, then the round ticks, and then the skipped combatants at the top
   of the order take theirs.
5. The combatant that the pointer lands on starts its turn.

A dead character, a defeated creature, or a missing combatant rolls no save
and takes no damage, but the chips keyed to its turns still count the
boundary. A dying character at 0 HP still has its turn end, and the damage
of a chip costs it a failed death save, as any hit does. The start of a fight
starts the first turn. A removal from the fight ends the chips keyed to the
removed combatant, and it starts the turn of the next combatant when the
removed one held the turn. The end of a fight ends every chip that waits on
a turn boundary, because no turn comes again. `endFightEffects` first deals
the later-turn damage that such a chip still owes, so an Acid Arrow that hit
on the last turn still burns. A chip that deals damage only on a failed
repeated save deals none at the end of a fight.

A chip that only counts a boundary down, such as a chip with two ends left,
still writes the new count back. An entity whose chips no boundary touches
keeps its identity, and so does a roster with no change, because the roster
indexes and the pack cache of the save key on that identity.

### The round wrap

The round wrap runs `TimedEffects.passRound` over every character and every
creature, bystanders included. It takes one round off the timed chips, the
timed stat modifiers, and a held concentration. An entity with nothing timed
comes back as the same object, and a collection with no changed entity keeps
its array.

The save packs each entity through a cache keyed on the object. A new object
per entity per round misses that cache. With 1,200 creatures, the round-tick
save costs about 180 ms with new objects and about 3 ms with the kept ones.

### Per-tab UI state

`combatWiring.js` owns two pieces of per-tab UI state, which never persist.
`inspectedId` is the combatant that the left column inspects. The ribbon
chips pick it, and null means whoever's turn it is. `selectedTargetId` is the
board card that the GM or player picked as the target.

The app never validates the inspection, because a user can inspect a
defeated combatant on purpose. An id that stops resolving falls back to
whoever's turn it is. The app releases the target on the refresh that shows
it defeated, out of the order, or with the fight over. Otherwise the card of
a defeated foe would keep its pressed ring after the attack dialog stopped
using the pick.

## The action budget

A 5e turn has one action, one bonus action, and one reaction.
`src/combat/ActionBudget.js` is the pure model of what a combatant already
spent. The budget lives on the participant, in a `used` field, so it saves
and resumes with the fight. It records what is gone instead of what is left.
A participant with no `used` field therefore reads as a whole turn through
`budgetOf`.

`attacksLeft` is the only counter in the budget. Extra Attack gives two
swings for one action, so the first swing spends the action and banks the
rest. `spendAttack` draws on the bank before it spends another action, and
`attacksAvailable` reports how many swings are left. Each swing also sets
`attacked`, because a cast spends the `action` flag too, and two-weapon
fighting needs to know that the action went to the Attack action.

A chip with `mods.extraAction` (Haste) gives one more swing, which `extra`
records. `spendAttack` and `attacksAvailable` take an `extraAction` flag, and
the extra swing comes only once the action and the bank are both spent. So a
cast on the action still leaves the extra swing, and nothing banks behind it.
No other cost reads the flag, because the extra action of Haste can't pay for
a cast.

`advanceTurn` gives a whole budget back to the combatant the pointer lands
on. The reaction resets there and not at the top of the round, because a 5e
combatant gets its reaction back at the start of its own turn. A combatant
that the pointer skips keeps its spent budget, because it takes no turn.

The Sneak Attack flag resets differently. The 5e limit is once per turn, and
a turn is anyone's turn. `resetSneak` therefore gives the flag back to the
whole order at every turn boundary. A rogue that spent the dice on its own
swing can spend them again on an opportunity attack in another combatant's
turn. `refresh` and `resetSneak` return the same participant when nothing
changes. The order array then keeps its identity, and so do the save diff and
the combatant index caches.

`canSpend` gates the buttons, but it does not refuse a cost. The rules have
more exceptions than this model covers, so every path that spends a cost also
gives the GM a way past the gate.

Movement has no entry in the budget. Nothing in the app moves a token by
feet, so `Movement.walkSpeed` is for display only.

### Spending the budget

`app.actions.spendBudget(id, cost, options)` is the only write path.
`encounterWiring.js` registers it, so `state.combat` keeps one writer. The
cost is one of these values:

- `'action'`, `'bonus'`, or `'reaction'`, for that part of the turn
- `'attack'`, for a weapon swing
- `'sneak'`, for the once-per-turn Sneak Attack flag, which costs no part of
  the turn

The action returns false when the budget does not have the cost. With no
fight running, the action reports success and writes nothing. A cast from the
character sheet outside a fight uses this path.

A weapon swing spends `'attack'`. `rollWeaponAttack` asks first and rolls no
dice on a refusal. `Features.attacksPerAction` reads the class features of
the attacker to find how many swings one Attack action gives.

A cast spends what its casting time names. `SpellTiming.castingCost` turns
the structured casting time into a cost. It reads a casting time of minutes,
of hours, or of the `special` kind as null, because no part of a turn pays
for those. `castPlan` puts the cost and a blocked flag on the plan, and
`resolveCast` spends the cost before the first roll. A cast is blocked when
the turn already spent that part, or when the casting time is longer than a
turn.

The attack dialog shows an "Ignore action cost" box on a turn with no swing
left. The cast dialog shows the same box for a blocked cast, with the wording
for the reason that applies. A cast that goes through on this opt-out spends
nothing, because nothing is left to take. The submit button stays disabled
until the box is ticked, through the `submitRequires` option of
`promptModal`. The dialog therefore cannot close on a swing or a cast that the
resolver then refuses. The cast dialog gates its components and armor
opt-outs in the same way.

The action bar draws the budget as pips. Each cost has one pip, struck through
once spent, and the bar shows the swing count when more than one swing is
left. The pips show the budget and never gate a button. `CombatantRow`
includes `used` and `attacksLeft`, so the screen reads them from the same row
that it draws everything else from.

### Two-weapon fighting

`src/combat/TwoWeapon.js` is the pure half of the off-hand swing.
`isLightMelee` reads the kind and the `light` property of one weapon.
`offhandWeapons` returns the light melee weapons of a list, and it returns
none unless the list has two of them. `canOffhand` adds the budget
conditions: the Attack action is taken, and the bonus action is free.

The test reads the `attacked` mark and not the `action` flag. In 5e, the
off-hand swing is the second attack after a taken Attack action, so an action
spent on a cast does not unlock it. The app does not model which hand holds
which weapon. It offers both light melee weapons, and the GM picks the one
that the second hand swings.

`combatWiring.js` calls `canOffhand` and puts the list in the `offhand` field
of the action bar's actions. The Off-hand group therefore shows only on a
turn that can take the swing. The button sends `offhand: true` to
`weaponAttack`, which spends the bonus action instead of an attack.
`offhandDamageModifier` sets the damage modifier of that swing. It drops a
positive ability modifier and keeps a negative one, because the rule removes
the bonus and a penalty is not a bonus.

`combat/AttackTweaks.js` has one table of the three swings a combatant can take: the
main-hand swing, the off-hand swing, and the opportunity attack. Each row
states what the swing spends, the dialog title, the text of the opt-out box,
what the log adds to the attack line, and the toast for a turn that cannot
pay. `swingKind` picks the row from the dialog's answers, and `canSwing` asks
the budget whether the turn can pay for that row. Both functions are pure and
tested.

### Reactions

`src/combat/Reactions.js` decides what a reaction can spend itself on.
`canReact` reads the reaction pip. `opportunityWeapons` keeps the melee
weapons of a list, because a bow cannot hit a creature that walks past.
`reactionSpells` keeps the spells whose casting time reads as a reaction,
through `SpellTiming.castingCost`.

Apart from a hit on a Shield caster (see below), the app does not detect a
trigger. A 5e reaction starts from a fact that this app does not track, such
as a creature leaving the reach of another. The GM sees the trigger at the
table and presses the control.

The controls sit under the board card of the combatant that reacts, which is
not the combatant taking the turn. A board card is one button, and HTML does
not allow a button inside a button. `combatantCard` therefore returns the card
and the controls inside one `.combatant-slot` element. `CombatScreen.reactionFor`
decides who gets a control. A combatant gets one when all of these are true:

- It is not the combatant taking the turn.
- The viewer can act for it.
- It can still act.
- Its reaction is unspent.
- It has a weapon or a spell to spend the reaction on.

The swing sends `reaction: true` to `weaponAttack`, which spends the reaction
and otherwise rolls a normal swing, with the ability bonus. Its default
defender is the combatant taking the turn, because that is the combatant the
reaction interrupts. A card that the GM picked on the board replaces that
default. The cast goes to the same `castSpellAction` that the action bar
uses. That path already spends what the casting time names, and `castPlan`
finds the caster's participant by id and not by whose turn it is.

### The Shield pause

An attack roll that hits is a trigger that the app does see, and
`src/app/shieldWard.js` offers the defender its AC reaction at that point.
`pendingWard` looks for a spell that casts as a reaction, whose buff chip
adds AC (`mods.ac`), and whose `castPlan` the defender can pay for without
an opt-out. The defender also needs an unspent reaction, the ability to
act, no chip of that spell already, and a viewer who may act for it
(`CombatView.mayActOn`). `wardRaise` measures how far the AC would go up by
reading `acOf` with and without the candidate chip, so a floor such as
Barkskin's 16 counts. Shield on a base AC of 12 under Barkskin raises the AC
from 16 to 17, and the ward offers +1 and only against a roll of 16. A spell
with no real raise is offered only when its chip blocks the attacking spell.
`offerWard` asks the question and casts the spell through `resolveCast` at
the lowest slot. It returns how far the AC of the defender went up, which it
reads with `acOf` before and after the cast.

`rollWeaponAttack` asks after the d20 rolls and before the log line, so the
line states the AC that the roll answered to in the end. `resolveCast` asks
through `wardSpellAttack`, after `castSpell` rolls and before
`applyOutcomes` writes anything. The pure `CastRolls.wardedOutcome` then
checks each outcome again against the raised AC. It stops a projectile that
hits automatically only when the ward chip names the spell in `mods.blocks`,
which is the Magic Missile rule of Shield. A target that already holds such
a chip takes none of the automatic hits, and `wardSpellAttack` applies that
with no question.

Both functions return a promise only while a question is open. A call with
no ward in reach finishes before it returns, so a suite that calls one
without `await` reads the result on the next line. Each takes an `ask`
option in place of `confirmModal`, and a test passes its own answer there.

### Weapon options in the attack dialog

`src/combat/AttackOptions.js` decides which per-swing options a weapon
allows, so the dialog shows only the options that the rules permit for that
swing. `allowsSneakAttack` needs a finesse or a ranged weapon.
`hasFreeHandFor` needs both hand slots to be empty or to hold the weapon
itself. A shield or a second weapon therefore rules out the two-handed grip.
A creature has no equipment slots, so it always passes.

A versatile weapon with a free hand offers a two-handed grip, which rolls the
`versatileDamage` dice. A ranged weapon with a stated range offers a normal
and a long shot, and the long shot rolls with disadvantage. A thrown melee
weapon offers a melee swing, a thrown attack, and a long thrown attack. The
damage step checks the free hand again, because the equipment can change
while the dialog is open.

### Cover and Sneak Attack

Cover and Sneak Attack are GM calls in the dialog before the roll. The app
tracks no distance between tokens and no line of sight. No rule here can see
a wall, a barrel, or where the rogue stands, so the GM answers the dialog from
what they see at the table.

`src/combat/Cover.js` has the 5e table. Half cover adds 2 to the AC of the
target, and three-quarters cover adds 5. `coverBonus` reads an unknown answer
as no cover, and `coverNote` gives the text that the log prints. Total cover
has no entry, because a target in total cover cannot be attacked.

The cover control is a select beside the roll mode, so it is one click away
for every swing. `rollWeaponAttack` adds the bonus to the AC of the defender
once. The dice tray, `resolveAttack`, the log, and the miss toast all read
that raised AC. The log prints the raised AC and the plain AC together, such
as `vs AC 12 (10 half cover +2)`.

Sneak Attack is a checkbox. It shows when `Features.sneakAttackDice` gives the
attacker dice, the weapon allows Sneak Attack, and the turn still has the
`sneak` flag. The label states the dice count, so the GM sees what the box is
worth. The count comes from the level in the class that granted the feature,
not from the level of the character.

The dice go in through the `sneakDice` option of `damageParts`. They are
always d6, they take the damage type of the weapon, and a critical hit doubles
them like every other damage die. The app spends the flag at the damage step,
because Sneak Attack applies only on a hit. A miss therefore leaves the flag
for the next attack of the turn.

The app checks the weapon, but not the rest of the 5e condition for Sneak
Attack. That condition is advantage on the attack, or an ally next to the
target. The second half needs a map distance that the app does not have, so
the ticked box is the GM's answer.

## The combat view

`buildCombatView(combat, resolve, viewer)` in `src/combat/CombatView.js` is a
pure projection. It returns the round, the turn index, and one row per
participant. Each row has these fields:

- the name, side, initiative, HP, AC, and conditions
- a `defeated` flag, and an `incapacitated` flag for a combatant whose chips
  cost it the turn
- a `counted` flag for a combatant that settles the outcome
- `mayAct`, which says whether this viewer can act for the combatant
- `deathSaves`, `used`, and `attacksLeft`

The wiring layer injects the resolver (`findCombatant` from `combatants.js`),
because only the wiring layer sees every collection that an id can live in.
The order stores nothing on a row, so a rename, a disposition change, or
damage during a fight shows on the next render. The screen and the panel
derivations (`sideOf`, `isDowned`, `mayActOn`) all read from this one module.
The module has unit tests, and the DOM on top of it is checked visually.

`mayAct` is the only field that depends on the viewer. The GM can act for
anyone, foes included. A player can act only for the party character that the
tab is bound to. The screen uses this field to gate the action bar, the HP
controls, the concentration Drop control, the death-save Roll and Stabilize
controls, and the turn-end button. A player gets the turn-end button only on
their own character's turn, and on a player tab it reads "End my turn" in
place of "Next turn".

`fightOutcome(view)` returns `victory` once every foe row is defeated, and
`defeat` once every counted party row is defeated. It returns null while both
sides still have someone standing. A side with no one on it settles nothing,
so an order that the GM built with no foes is undecided. A mutual wipe reads
as a defeat, because the fate of the party outweighs the fate of the monsters.

A creature row takes its side from its disposition. A hostile creature is a
foe, and a friendly or neutral creature stands with the party. Only characters
and hostile creatures have the `counted` flag. A friendly or neutral creature
is therefore a bystander. Its fall settles nothing, and its survival does not
prevent the defeat of a fallen party. The side does not protect a creature,
because a hostile action can target any other creature in the fight. The party
can turn on a bystander mid-fight.

### Loadout visibility

`src/combat/Loadout.js` defines the second viewer rule.
`loadoutAccess(found, viewer, id)` returns `full`, `public`, or `none`.

| Viewer | Own character | Other combatant on the party side | Foe |
| --- | --- | --- | --- |
| GM | full | full | full |
| Player | full | public (armor and weapons) | none |

Armor and a drawn weapon are visible across the table. The prepared spells and
remaining slots of a caster belong to that player, and a foe's sheet is the
GM's to reveal. `buildLoadout` takes the access level and never assembles what
the viewer cannot see. Code downstream therefore cannot leak that data by
drawing a field that it was given.

## The layout

The screen has three columns above a turn ribbon. Below a width of 1100px,
the columns stack.

### The active column

The active column shows the inspected combatant, which is whoever's turn it is
by default. The column shows the name, initiative, AC, HP, condition chips,
and concentration with its Drop control.

A character at 0 HP also shows its death-save tracker: three success pips,
three failure pips, and the Roll and Stabilize controls. A stable character
reads "Stable at 0 HP" and a dead character reads "Dead", with no controls.
The block comes from `ui/DeathSaveBlock.js`, which the character sheet also
uses, so the screen and the sheet always describe a tracker the same way.

The HP value is exact where the viewer can act for the combatant. That is the
GM for every combatant, and a player for their own character only. Other
viewers see a coarse HP band. The GM also gets an amount field with Damage and
Heal buttons, the same controls as the Encounters panel. They apply through
`applyToTarget`, which is the single write path for every hit.

Under the facts is the combatant's loadout in its full form: weapons with
their damage rolls, and a chip for each slot pool. Below the loadout is the
action bar (`CombatActionBar.js`). It shows one button per weapon and per
castable spell of the combatant whose turn it is, from the same `weaponsOf`
and `spellsOf` derivations that the sidebar reads. The buttons sit under an
Actions heading, with weapons first and then spells under the spellbook's own
spell-level headings. Without the grouping, a caster with a dozen spells would
show one long run of buttons. The bar belongs to the turn and not to the
inspection, so inspecting a foe never offers its weapons to a player.

### The board

The board shows the two sides as labelled groups of cards
(`CombatantCard.js`). Each card shows the loadout in a compact form.
`LoadoutBlock.js` draws both forms, so a card and the active column always
describe a combatant the same way. The host trims each card to what the viewer
can see.

Each card is a real `<button>` that picks the target. A click selects the card
(`aria-pressed`), and a second click releases it. The selected id pre-fills
the defender field of the attack dialog. It also pre-fills the target field of
the cast dialog, whichever picker the spell built: a single select, a
multiselect, or the projectile allocation grid (through `prefillTarget` in
`spellTargets.js`). The six situational fields of the attack dialog sit behind
a collapsed disclosure (the `advanced` field flag of `promptModal`). The common
flow is therefore a click on the card, a click on the weapon, and Enter.

### The log column

The log column shows the travelogue entries of the `combat` and `roll` kinds,
newest first. It shows only entries logged since this fight's setup opened,
so the column does not replay every fight in the campaign. The setup takes a
timestamp when its dialog opens, and `startCombat` stores it as
`CombatState.startedAt`. The "Initiative rolled" line is logged inside the
dialog, so it falls after that timestamp. The column shares the row builder
of `TravelogPanel.js`, so an entry reads the same in both lists.

The travelogue keeps its newest 200 entries (`TRAVELOG_LIMIT`). A fight of five
rounds with ten combatants can log more than that. `logEvent` therefore passes
the running fight's `startedAt` to `appendEntry`, which then trims only the
entries older than the fight. The list can grow past 200 during a fight, up to
`TRAVELOG_FIGHT_LIMIT` (1,000). The first line logged after the fight ends
trims the list back to 200. The column keeps as many rows as the larger limit.

The dice tray sits under the log. The app has one tray. While combat mode is
active, the screen moves the whole `#dice-tray-container` card into the column
with `appendChild`, and it puts the card back below the map on exit. Moving
the element keeps the handle of `diceWiring.js` valid, because the app mounts
the tray once and never looks it up again.

### The turn ribbon

The turn ribbon runs under the columns. It shows one chip per participant, in
order, with initials and initiative. The current turn is ringed and marked
`aria-current`. An icon marks each foe, so the side does not depend on color
alone, and a defeated chip is struck through. A click on a chip inspects that
combatant without advancing the turn.

The round counter and the turn controls sit beside the ribbon:

- Back to map, for everyone
- the turn-end button, for whoever can take the current turn
- End combat, for the GM only

## Starting a fight

Only the GM starts a fight, from the Start combat button in the Active tab of
the Encounters panel. `creaturesHere` in `encounterPanels.js` gates the
button. Every undefeated creature on the party's exact tile counts, whatever
its disposition, so the app does not stop a party that attacks a neutral
bystander. The Active tab lists the same live creatures that the gate counts,
so the panel switches to that tab whenever the button can show.

The setup roster is the whole party plus the creatures on the tile. A defeated
hostile creature stays on the tile but does not join a new fight, and a
bystander joins in any condition. Hostile creatures line up as foes, and
friendly and neutral creatures line up with the party.

Only a hostile creature is a threat, and only a threat opens the arrival modal
when the party steps onto its tile. A friendly or neutral creature opens
nothing. The panel lists it, and the step logs a meeting.
`arrivalAlert` in `src/combat/Arrival.js` writes the text of the modal from the
`name`, `currentHP`, and `maxHP` of each hostile creature there. The GM sees
exact HP, and a player sees an HP band.

### Rolling initiative

Initiative is a Dexterity check, so `src/combat/InitiativeRoll.js` rolls it as
one. `initiativeSlant` asks `ConditionEffects.rollMode` for the mode that the
roller's chips give a check. It adds the disadvantage of armor the roller is
not trained for, and it reads the exhaustion penalty. `rollInitiative` throws
the d20s, keeps the higher or the lower one, and adds the DEX modifier that
the roster stored on the participant.

One press of Roll initiative fills the whole column, so this roll does not go
through the dice tray, which shows one roll at a time. The roll returns a note
that names the dropped die and each reason, and the travelogue line includes
it. `encounterWiring.js` resolves the participant id to its entity with
`findCombatant`. An id that resolves to nothing rolls a plain d20 instead of
failing. The GM can edit every value by hand before Start.

## Ending a fight

A fight ends when the GM presses End combat, or when no creature is left on
the party's tile. The defeat of the last enemy does not end the fight.
An automatic end on the last kill would close the screen mid-swing, and it
would take the log and the board away before the party could heal.

### The End combat control

`endCombat` calls `confirmFightEnd` in `app/combatEnd.js` first. If hostile
creatures still stand and the party has not lost, the GM confirms in a dialog.
The button sits next to Next turn, so one stray click would otherwise drop a
live fight. A won or lost fight closes with no question.

After a victory, `offerFightXP` offers the experience points of the defeated
foes. `FightEnd.fightEnd` adds up the `crXP` value of each defeated hostile
creature, and a foe with no challenge rating is worth nothing. The share goes
to every character in the order who is still alive, a dying one included,
split evenly and rounded down. The GM can change the amount or cancel. Each
character gets the amount through `addXP`, so a new level becomes pending in
the usual way.

### The automatic end

`syncCombatLocation` ends a fight when the party leaves the tile or the last
creature there is deleted. The party-move paths and `commitCreatures` call
this action. The plain panel refresh never calls it, because that refresh also
runs from the rehydrate loop. There, a state write would conflict with the save
that the tab just took from another tab.

The check reads `creaturesOnTile`, which counts defeated creatures and
bystanders. A combatant at 0 HP is a turn in the fight and not the end of it,
and a fight that the party picked with a neutral creature has no hostiles at
all. A walk off the tile ends the fight, and so does the deletion of the last
creature, but a kill does not.

### The outcome banner

Once `fightOutcome` settles, the screen shows a banner under the ribbon. The
banner states that the party is victorious or defeated. It tells the GM that
combat stays open until the GM ends it. At that point, End combat takes the
primary emphasis from the turn-end button. Turns still advance, so the party
can use a round to heal before the GM ends the fight.

The banner is a persistent `role="status"` node. The app does not rebuild the
node on every render, because a new node would announce the outcome again on
every HP edit. The app also unhides the node before it writes the text,
because a screen reader does not read a status region that is hidden when the
text changes.

## Refreshing the screen

`combatWiring.js` registers `app.views.combatScreen`. It mounts before
`wireEncounters`, so the view exists when the fight's refresh paths run.

The registered `update` function skips the rebuild while the tab shows another
mode during a running fight, because nothing on the screen is visible then.
The switch back into combat mode is itself a refresh path, so the first visible
frame is always new. When the fight has ended, `update` still rebuilds, which
empties the screen of the last fight's DOM.

### The deferred rebuild

`update` asks `src/combat/RefreshScheduler.js` for a refresh. The first request
in a synchronous burst schedules one run in a microtask. Every later request in
the burst does nothing.

One weapon attack reaches the view four or five times: the budget spend, the
attack line, the damage line, the target write, and the defeat line. Without
the scheduler, each of those calls would rebuild the whole screen. With it,
they cost one rebuild, and the browser paints no frame between them. The
scheduler takes its `schedule` function as an argument, so a test can run the
flush by hand. The dice tray still moves at once, inside `update`, because the
mode's CSS has already changed by then.

The log column does not rebuild. `CombatLog.js` keeps the id of the newest row
it drew. On each update, it asks `entriesAfter` for the entries logged since
then and adds only those at the top. It rebuilds only when that id has left the
log, which means that the log was cleared or a new fight began.
`TravelogPanel.js` renders the same way. The list is a `role="log"` live
region, and a screen reader reads only the added rows. A list rebuilt whole
would read every row again, or read nothing.

### Refresh paths

Each of these paths calls the registered `update`:

- **The initiative-panel wrapper.** `encounterWiring.js` wraps
  `views.initiativePanel.update()` and refreshes the combat screen inside it.
  Every call site that the sidebar card already has (party moves, role
  switches, the rehydrate loop, `commitCreatures`) reaches the screen with no
  extra code.
- **Combatant writes.** The character `store` that `findCombatant` uses updates
  the screen directly. A creature write reaches the screen through
  `commitCreatures`.
- **The log.** `logEvent` refreshes the screen. A line that changes no
  combatant, such as a missed attack or a plain tray roll, would otherwise not
  reach the log column.
- **Mode changes.** `sessionControls.js` updates the screen on every mode
  switch. The registered `update` first syncs the dock of the tray with
  `state.mode`, so the tray moves on every entry and exit: the automatic entry,
  the automatic exit, the header's Play button, the sidebar's Open combat
  control, or a reload that resumes a fight.

A reload with a fight running enters combat mode again from `main.js`, after
`wireSessionControls` has registered `setMode`, for either role. A player takes
their turn on that screen too, and anyone can leave with Back to map to watch
the map.

Cross-tab rehydrate adopts campaign state in place and leaves `mode` out of
its synced keys, so a display tab in the Player role does not follow the GM
tab into Build mode. `combat` is in the synced keys, and the rehydrate refresh
loop includes the initiative panel, whose wrapper refreshes the screen.

A fight that starts or ends in another tab is the one case that moves a
follower tab's mode. `followerMode` in `view/CombatMode.js` decides the move,
and `app/externalSaves.js` acts on it. A tab in Play mode enters combat mode
when a fight starts, and a tab in combat mode returns to Play when the fight
ends. A tab in Build or Library mode stays where it is, because a fight is not
a reason to discard what that tab has open.

## Accessibility

A visually hidden `aria-live="polite"` region announces each turn, for example
"Round 2: Mirelle's turn." The region is keyed on the round and the combatant
id, so an HP edit or another refresh announces nothing extra. The combat log
list is a `role="log"` region. A screen reader speaks each attack result,
damage line, and defeat as its row is added, because the list only gains rows.

The ribbon and the board are one tab stop each. A roving tabindex anchors on
the chip of the current turn and on the selected card, and the arrow keys move
focus with wraparound. The keydown listeners attach once, at mount, to the
persistent containers. They find the buttons on each keypress, because every
render replaces the buttons.

A rebuild replaces every control, so without help, focus would fall to the page
body after each rebuild. `src/combat/FocusRestore.js` decides where focus goes.
Before the rebuild, the screen names the focused control: a chip or a card by
its combatant id, and any other control by its accessible label or its text.
After the rebuild, the control with the same name takes focus again, so the
Damage button keeps focus through the HP edit that it made.

When that control is gone or disabled, focus goes to the chip of the current
turn, and then to the round heading, which is a persistent `h2` with
`tabindex="-1"`. Focus on an element that is still in the document, such as the
docked dice tray, stays where it is. The first frame of a fight moves focus onto
the screen the same way, because the Start control that opened the fight is
gone by then. Back to map and End combat move focus to the map canvas.

The attack and cast dialogs need no extra help. A dialog opens before any
write, so the button that opened it is still in the document when the dialog
closes, and that button takes focus back. The deferred rebuild then runs and
moves focus to the new button with the same name.

## The sidebar card

`InitiativePanel.js` is a status card. It shows only while a fight is running.
It has one line, for example "Round 3, Mirelle's turn", which it resolves
through `describe` so that a rename shows. It also has an Open combat control.
The wrapper around its `update` function refreshes the combat screen, as
described in Refresh paths.
