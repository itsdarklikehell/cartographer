import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fightingStyles,
  hasFightingStyle,
  offhandAddsModifier,
  styleArmorBonus,
  styleAttackBonus,
  styleDamageBonus,
  styleRerollBelow,
} from '../src/entities/FightingStyle.js';
import { FIGHTING_STYLES, fightingStyle } from '../src/data/fightingStyles.js';
import {
  applyFeatureGrant,
  buildFeatureStamp,
  pendingFeatureGrants,
  undoFeatureGrant,
  featureKey,
} from '../src/entities/FeatureGrants.js';
import { armorClass } from '../src/entities/Armor.js';
import { createCharacter } from '../src/entities/Character.js';
import { rollDamage } from '../src/dice/DiceRoller.js';
import { hitDamage, prepareSwing, attackLine } from '../src/combat/WeaponSwing.js';

/** @typedef {import('../src/types/entities.js').Character} Character */

const SWORD = {
  id: 'sword',
  name: 'Longsword',
  quantity: 1,
  notes: '',
  type: /** @type {const} */ ('weapon'),
  kind: /** @type {const} */ ('melee'),
  properties: /** @type {const} */ (['versatile']),
  damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
  versatileDamage: [{ count: 1, sides: 10, damageType: 'slashing' }],
};
const MAUL = { ...SWORD, id: 'maul', name: 'Maul', properties: ['two-handed', 'heavy'] };
const DAGGER = { ...SWORD, id: 'dagger', name: 'Dagger', properties: ['light', 'finesse'] };
const BOW = { ...SWORD, id: 'bow', name: 'Longbow', kind: 'ranged', properties: [] };
const MAIL = {
  id: 'mail',
  name: 'Chain mail',
  quantity: 1,
  notes: '',
  type: /** @type {const} */ ('armor'),
  baseAC: 16,
  armorWeight: /** @type {const} */ ('heavy'),
};

/**
 * A level-1 fighter with the given style claimed.
 * @param {string} style
 * @param {Partial<Character>} [extra]
 * @returns {Character}
 */
function fighter(style, extra = {}) {
  const base = {
    ...createCharacter('f', 'Fen', { STR: 16, DEX: 14 }),
    classes: [{ classId: 'fighter', level: 1 }],
    level: 1,
    conditions: [],
  };
  const [grant] = pendingFeatureGrants(base);
  return { ...applyFeatureGrant(base, buildFeatureStamp(grant, { style })), ...extra };
}

/** @param {Character} c @param {Record<string, string | null>} slots @param {any[]} items */
const equip = (c, slots, items) => ({
  ...c,
  inventory: items,
  equipment: { ...(c.equipment ?? {}), ...slots },
});

test('each class offers the SRD styles of its Fighting Style feature', () => {
  /** @param {string} classId @param {number} level */
  const offered = (classId, level) => {
    const c = { ...createCharacter('c', 'C'), classes: [{ classId, level }], level };
    const grant = pendingFeatureGrants(c).find((g) => g.name === 'Fighting Style');
    return grant?.effects.flatMap((e) => (e.kind === 'fightingStyle' ? e.from : []));
  };
  assert.deepEqual(
    offered('fighter', 1),
    FIGHTING_STYLES.map((s) => s.id),
  );
  assert.deepEqual(offered('paladin', 2), ['defense', 'dueling', 'great-weapon', 'protection']);
  assert.deepEqual(offered('ranger', 2), ['archery', 'defense', 'dueling', 'two-weapon']);
  assert.equal(offered('paladin', 1), undefined);
  assert.equal(fightingStyle('protection')?.name, 'Protection');
  assert.equal(fightingStyle('nope'), undefined);
});

test('a claimed style records on the feature, and undo clears it', () => {
  const c = fighter('dueling');
  assert.deepEqual(fightingStyles(c), ['dueling']);
  assert.equal(hasFightingStyle(c, 'dueling'), true);
  assert.equal(pendingFeatureGrants(c).length, 0);
  const key = featureKey({ classId: 'fighter', classLevel: 1, name: 'Fighting Style' });
  assert.deepEqual(fightingStyles(undoFeatureGrant(c, key)), []);
  assert.deepEqual(fightingStyles({}), [], 'a creature has no style');
});

test('buildFeatureStamp drops a style the feature does not offer', () => {
  const base = {
    ...createCharacter('p', 'P'),
    classes: [{ classId: 'paladin', level: 2 }],
    level: 2,
  };
  const grant = pendingFeatureGrants(base).find((g) => g.name === 'Fighting Style');
  assert.ok(grant);
  assert.equal(buildFeatureStamp(grant, { style: 'archery' }).style, undefined);
  assert.equal(buildFeatureStamp(grant, { style: 'defense' }).style, 'defense');
  assert.equal(buildFeatureStamp(grant, {}).style, undefined);
});

test('Defense adds 1 AC only while wearing body armor', () => {
  const bare = fighter('defense');
  assert.equal(styleArmorBonus(bare), 0);
  const armored = equip(bare, { chest: 'mail' }, [MAIL]);
  assert.equal(styleArmorBonus(armored), 1);
  assert.equal(armorClass(armored), 17);
  assert.equal(armorClass(equip(fighter('dueling'), { chest: 'mail' }, [MAIL])), 16);
});

test('Archery adds 2 to a ranged weapon only', () => {
  const archer = fighter('archery');
  assert.equal(styleAttackBonus(archer, BOW), 2);
  assert.equal(styleAttackBonus(archer, SWORD), 0);
  assert.equal(styleAttackBonus(fighter('defense'), BOW), 0);
});

test('Dueling adds 2 with one melee weapon in one hand', () => {
  const duelist = equip(fighter('dueling'), { mainHand: 'sword', ranged: 'bow' }, [SWORD, BOW]);
  const one = { melee: true, twoHanded: false };
  assert.equal(styleDamageBonus(duelist, SWORD, one), 2, 'a stowed bow does not count');
  assert.equal(styleDamageBonus(duelist, SWORD, { melee: true, twoHanded: true }), 0);
  assert.equal(styleDamageBonus(duelist, SWORD, { melee: false, twoHanded: false }), 0);
  assert.equal(styleDamageBonus(duelist, BOW, one), 0);
  assert.equal(styleDamageBonus(duelist, MAUL, one), 0);
  const twoBlades = equip(fighter('dueling'), { mainHand: 'sword', offHand: 'dagger' }, [
    SWORD,
    DAGGER,
  ]);
  assert.equal(styleDamageBonus(twoBlades, SWORD, one), 0);
  assert.equal(styleDamageBonus(fighter('dueling'), SWORD, one), 2, 'no equipment at all');
  assert.equal(styleDamageBonus({ ...fighter('dueling'), equipment: undefined }, SWORD, one), 2);
  assert.equal(styleDamageBonus(fighter('archery'), SWORD, one), 0);
});

test('Great Weapon Fighting rerolls on a two-handed melee swing', () => {
  const gwf = fighter('great-weapon');
  assert.equal(styleRerollBelow(gwf, MAUL, { melee: true, twoHanded: false }), 2);
  assert.equal(styleRerollBelow(gwf, SWORD, { melee: true, twoHanded: true }), 2);
  assert.equal(styleRerollBelow(gwf, SWORD, { melee: true, twoHanded: false }), 0);
  assert.equal(styleRerollBelow(gwf, MAUL, { melee: false, twoHanded: false }), 0);
  assert.equal(styleRerollBelow(fighter('dueling'), MAUL, { melee: true, twoHanded: false }), 0);
});

test('Two-Weapon Fighting adds the modifier to off-hand damage', () => {
  assert.equal(offhandAddsModifier(fighter('two-weapon')), true);
  assert.equal(offhandAddsModifier(fighter('archery')), false);
});

test('rollDamage rerolls a die at or below rerollBelow once', () => {
  const rolls = [0, 0.99, 0.2, 0.5];
  let i = 0;
  const rng = () => rolls[i++];
  const damage = rollDamage(
    [{ count: 2, sides: 6, damageType: 'slashing', rerollBelow: 2 }],
    0,
    rng,
  );
  // The 1 rerolls to a 6, and the 2 rerolls to a 4.
  assert.deepEqual(damage.byType[0].rolls, [6, 4]);
});

test('a swing applies Archery, Dueling, Great Weapon Fighting, and Two-Weapon Fighting', () => {
  const defender = { id: 'g', name: 'Goblin', ac: 10, conditions: [] };
  /** @param {any} attacker @param {any} weapon @param {any} [tweaks] */
  const swing = (attacker, weapon, tweaks = {}) => {
    const setup = prepareSwing({ attacker, defender, weapon, tweaks, rng: () => 0 });
    const hit = hitDamage(setup, { attacker, defender, weapon, tweaks, crit: false, rng: () => 0 });
    return { setup, hit };
  };
  const archer = equip(fighter('archery'), { ranged: 'bow' }, [BOW]);
  const shot = swing(archer, BOW);
  assert.equal(shot.setup.style, 2);
  const line = attackLine(shot.setup, {
    attacker: archer,
    defender,
    weapon: BOW,
    tweaks: {},
    swingNote: '',
    total: 10,
    d20: undefined,
    rollMode: undefined,
    raised: 0,
    wardName: null,
    outcome: 'hit',
  });
  assert.match(line, /Archery \+2/);

  const duelist = equip(fighter('dueling'), { mainHand: 'sword' }, [SWORD]);
  const cut = swing(duelist, SWORD);
  assert.equal(cut.hit.damage.total, 1 + 3 + 2);
  assert.match(cut.hit.riderNote, /Dueling \+2/);

  const gwf = equip(fighter('great-weapon'), { mainHand: 'maul' }, [MAUL]);
  const smash = swing(gwf, MAUL);
  assert.match(smash.hit.riderNote, /Great Weapon Fighting/);

  const pair = [SWORD, DAGGER];
  const twf = equip(fighter('two-weapon'), { mainHand: 'sword', offHand: 'dagger' }, pair);
  assert.equal(swing(twf, DAGGER, { offhand: true }).hit.damage.total, 1 + 3);
  const plain = equip(fighter('archery'), { mainHand: 'sword', offHand: 'dagger' }, pair);
  assert.equal(swing(plain, DAGGER, { offhand: true }).hit.damage.total, 1);
});
