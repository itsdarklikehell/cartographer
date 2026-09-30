import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPactWeapon,
  pactAttacks,
  pactDamage,
  pactWeapon,
  setPactWeapon,
} from '../src/entities/PactWeapon.js';
import { attacksPerAction } from '../src/entities/Features.js';
import { removeItem, settlePactWeapon } from '../src/entities/CharacterInventory.js';
import { hitDamage, hitLines, prepareSwing } from '../src/combat/WeaponSwing.js';
import { createCharacter } from '../src/entities/Character.js';
import { attacksAvailable, spendAttack } from '../src/combat/ActionBudget.js';

const BLADE = {
  id: 'blade',
  name: 'Pact Blade',
  type: 'weapon',
  kind: 'melee',
  category: 'martial',
  quantity: 1,
  notes: '',
  damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
};
const BOW = { ...BLADE, id: 'bow', name: 'Bow', type: 'bow' };
const ROPE = { id: 'rope', name: 'Rope', type: 'gear', quantity: 1, notes: '' };

/** A Pact of the Blade warlock of the given level. */
function warlock(level, invocations = [], more = {}) {
  return /** @type {any} */ ({
    ...createCharacter('w', 'Wren', { CHA: 18, STR: 14 }),
    classes: [{ classId: 'warlock', level }],
    level,
    pactBoon: 'blade',
    invocations,
    inventory: [BLADE, BOW, ROPE],
    pactWeapon: 'blade',
    ...more,
  });
}

test('the pact weapon is a carried weapon of a Pact of the Blade warlock', () => {
  assert.equal(pactWeapon(warlock(5))?.id, 'blade');
  assert.equal(isPactWeapon(warlock(5), BLADE), true);
  assert.equal(isPactWeapon(warlock(5), BOW), false);
  // A creature's weapon has no id.
  assert.equal(isPactWeapon(warlock(5), { name: 'Claw' }), false);
  assert.equal(pactWeapon(warlock(5, [], { pactBoon: 'tome' })), null);
  assert.equal(pactWeapon(warlock(5, [], { pactWeapon: 'rope' })), null);
  assert.equal(pactWeapon(warlock(5, [], { pactWeapon: 'gone' })), null);
  assert.equal(pactWeapon(warlock(5, [], { pactWeapon: undefined })), null);
});

test('setPactWeapon marks a carried weapon or bow, and clears on anything else', () => {
  assert.equal(setPactWeapon(warlock(5), 'bow').pactWeapon, 'bow');
  assert.equal('pactWeapon' in setPactWeapon(warlock(5), 'rope'), false);
  assert.equal('pactWeapon' in setPactWeapon(warlock(5), null), false);
  assert.equal('pactWeapon' in setPactWeapon({ pactWeapon: 'x' }, 'x'), false);
});

test('removing the pact weapon from the inventory clears the mark', () => {
  const kept = warlock(5);
  assert.equal(settlePactWeapon(kept), kept);
  assert.equal(removeItem(kept, 'rope', 1).pactWeapon, 'blade');
  assert.equal('pactWeapon' in removeItem(kept, 'blade', 1), false);
  const bare = { inventory: [] };
  assert.equal(settlePactWeapon(bare), bare);
});

test('Thirsting Blade grants a second swing that does not stack with Extra Attack', () => {
  assert.equal(pactAttacks(warlock(5, ['thirsting-blade'])), 2);
  assert.equal(attacksPerAction(warlock(5, ['thirsting-blade'])), 2);
  // Without a marked pact weapon, below 5th level, or without the pick, one swing.
  assert.equal(attacksPerAction(warlock(5, ['thirsting-blade'], { pactWeapon: undefined })), 1);
  assert.equal(attacksPerAction(warlock(4, ['thirsting-blade'])), 1);
  assert.equal(attacksPerAction(warlock(5)), 1);
  assert.equal(pactAttacks(/** @type {any} */ ({ name: 'Goblin' })), 1);
  // A fighter 5 / warlock 5 still swings twice, not three times.
  const multi = warlock(5, ['thirsting-blade'], {
    classes: [
      { classId: 'warlock', level: 5 },
      { classId: 'fighter', level: 5 },
    ],
    level: 10,
  });
  assert.equal(attacksPerAction(multi), 2);
});

test('Thirsting Blade grants its second swing only to the pact weapon', () => {
  const w = warlock(5, ['thirsting-blade']);
  assert.equal(pactAttacks(w, BLADE), 2);
  assert.equal(pactAttacks(w, BOW), 1);
  assert.equal(attacksPerAction(w, BLADE), 2);
  assert.equal(attacksPerAction(w, BOW), 1);
  assert.equal(attacksPerAction(w, { name: 'Claw' }), 1);
  // Extra Attack from a fighter level covers every weapon, and the two do not add up.
  const multi = warlock(5, ['thirsting-blade'], {
    classes: [
      { classId: 'warlock', level: 5 },
      { classId: 'fighter', level: 5 },
    ],
    level: 10,
  });
  assert.equal(attacksPerAction(multi, BOW), 2);
  assert.equal(attacksPerAction(multi, BLADE), 2);
});

test('a warlock who swings a bow first gets no Thirsting Blade swing', () => {
  const w = warlock(5, ['thirsting-blade']);
  const turn = { id: 'w', initiative: 10, used: undefined };
  const afterBow = spendAttack(turn, attacksPerAction(w, BOW));
  assert.equal(afterBow.used?.attacksLeft, 0);
  assert.equal(attacksAvailable(afterBow, attacksPerAction(w, BLADE)), 0);
  // A pact weapon swing banks one more, which only the pact weapon can spend.
  const afterBlade = spendAttack(turn, attacksPerAction(w, BLADE));
  assert.equal(afterBlade.used?.attacksLeft, 1);
  assert.equal(attacksAvailable(afterBlade, attacksPerAction(w, BOW)), 0);
  assert.equal(attacksAvailable(afterBlade, attacksPerAction(w, BLADE)), 1);
  assert.equal(spendAttack(afterBlade, attacksPerAction(w, BLADE)).used?.attacksLeft, 0);
});

test('Lifedrinker adds the CHA modifier as necrotic to pact weapon hits', () => {
  const drinker = warlock(12, ['lifedrinker']);
  assert.deepEqual(pactDamage(drinker, BLADE, { CHA: 18 }), {
    name: 'Lifedrinker',
    part: { count: 0, sides: 1, damageType: 'necrotic', bonus: 4 },
  });
  // The minimum is 1, and another weapon or a missing pick adds nothing.
  assert.equal(pactDamage(drinker, BLADE, { CHA: 6 })?.part.bonus, 1);
  assert.equal(pactDamage(drinker, BLADE, {})?.part.bonus, 1);
  assert.equal(pactDamage(drinker, BOW, { CHA: 18 }), null);
  assert.equal(pactDamage(warlock(11, ['lifedrinker']), BLADE, { CHA: 18 }), null);
});

test('a Lifedrinker hit rolls the necrotic bonus and names it, and a crit leaves it single', () => {
  const drinker = warlock(12, ['lifedrinker'], { conditions: [] });
  const defender = { id: 'g', name: 'Goblin', ac: 10, conditions: [] };
  const setup = prepareSwing({
    attacker: drinker,
    defender,
    weapon: BLADE,
    tweaks: {},
    rng: () => 0,
  });
  for (const crit of [false, true]) {
    const { damage, riderNote } = hitDamage(setup, {
      attacker: drinker,
      defender,
      weapon: BLADE,
      tweaks: {},
      crit,
      rng: () => 0,
    });
    assert.equal(riderNote, ', Lifedrinker +4 necrotic');
    const necrotic = damage.byType.find((g) => g.damageType === 'necrotic');
    assert.equal(necrotic?.subtotal, 4);
    const lines = hitLines({
      weapon: BLADE,
      defenderName: 'Goblin',
      crit,
      damage,
      sneakDice: 0,
      riderNote,
      taken: { total: damage.total, notes: [] },
    });
    assert.match(lines.log, /, Lifedrinker \+4 necrotic\.$/);
  }
});
