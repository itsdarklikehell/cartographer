import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { castSpell } from '../src/entities/Casting.js';
import { maxTargets, scalingSteps } from '../src/entities/CastScaling.js';
import { createResource } from '../src/entities/Resource.js';

/** @param {string} id */
const byId = (id) => {
  const found = DEFAULT_SPELLS.find((s) => s.id === id);
  assert.ok(found, id);
  return /** @type {any} */ (found);
};

/** A deterministic RNG that replays a queue of unit values, then returns 0. */
function seq(/** @type {number[]} */ values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/**
 * A 17th-level caster of one class, with two slots of each level.
 * @param {string} cls
 * @param {string[]} prepared
 */
function caster(cls, prepared) {
  return /** @type {any} */ ({
    id: 'c',
    name: 'Caster',
    class: cls,
    level: 17,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 16, CHA: 16 },
    resources: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
      createResource(`slots-${n}`, `Level ${n}`, 'mana', 2),
    ),
    inventory: [],
    conditions: [],
    spellbook: { cantrips: prepared, known: prepared, prepared },
  });
}

test('Produce Flame is a druid cantrip ranged attack for 1d8 fire that scales', () => {
  const spell = byId('produce-flame');
  assert.equal(spell.level, 0);
  assert.deepEqual(spell.classes, ['druid']);
  assert.equal(spell.effect.kind, 'attack');
  assert.equal(spell.effect.melee, undefined);
  assert.deepEqual(spell.effect.damage, [{ count: 1, sides: 8, damageType: 'fire' }]);
  assert.deepEqual(spell.scaling.damagePerLevel, [{ count: 1, sides: 8, damageType: 'fire' }]);
  assert.match(spell.description, /GM rules the light/);
});

test('Call Lightning halves 3d10 on a DEX save, repeats as an action, and scales by slot', () => {
  const spell = byId('call-lightning');
  assert.equal(spell.concentration, true);
  assert.deepEqual(spell.duration, { kind: 'minutes', amount: 10, upTo: true });
  assert.equal(spell.targetCount, 0);
  assert.deepEqual(spell.repeat, {});
  assert.equal(spell.effect.halfOnSave, true);
  assert.equal(scalingSteps(spell, 5, 5), 2);
  const result = /** @type {any} */ (
    castSpell(caster('druid', ['call-lightning']), spell, {
      slotLevel: 5,
      saveDC: 1,
      rng: seq([]),
      targets: [{ id: 'o', name: 'Orc', saveBonus: 0 }],
    })
  );
  // Five d10 at the lowest face, halved on the save.
  assert.equal(result.outcomes[0].saved, true);
  assert.equal(result.outcomes[0].taken, 2);
});

test('Hypnotic Pattern incapacitates until damage and skips the Charmed-immune', () => {
  const spell = byId('hypnotic-pattern');
  assert.equal(spell.targetCount, 0);
  assert.equal(spell.effect.endsOnDamage, true);
  const result = /** @type {any} */ (
    castSpell(caster('wizard', ['hypnotic-pattern']), spell, {
      slotLevel: 3,
      saveDC: 30,
      rng: seq([]),
      targets: [
        { id: 'gob', name: 'Goblin', saveBonus: 0, creatureType: 'humanoid' },
        { id: 'elf', name: 'Elf', saveBonus: 0, conditionImmunities: ['Charmed'] },
      ],
    })
  );
  assert.deepEqual(
    result.outcomes.map((/** @type {any} */ o) => [
      o.target.id,
      o.unaffectedBy ?? null,
      o.condition,
    ]),
    [
      ['gob', null, 'Incapacitated'],
      ['elf', 'immune to Charmed', null],
    ],
  );
  assert.equal(maxTargets(spell, 0), Infinity);
});

test('Charm Person and Hold Person reach only humanoids, and an untyped target', () => {
  const spell = byId('charm-person');
  assert.equal(spell.concentration, false);
  assert.deepEqual(spell.duration, { kind: 'hours', amount: 1 });
  assert.equal(maxTargets(spell, 2), 3);
  assert.deepEqual(byId('hold-person').effect.typeRules, { only: ['humanoid'] });
  assert.deepEqual(byId('hold-monster').effect.typeRules, { skip: ['undead'] });
  const result = /** @type {any} */ (
    castSpell(caster('bard', ['charm-person']), spell, {
      slotLevel: 3,
      saveDC: 30,
      rng: seq([]),
      targets: [
        { id: 'gob', name: 'Goblin', saveBonus: 0, creatureType: 'humanoid' },
        { id: 'wolf', name: 'Wolf', saveBonus: 0, creatureType: 'beast' },
        { id: 'x', name: 'Stranger', saveBonus: 0 },
      ],
    })
  );
  assert.deepEqual(
    result.outcomes.map((/** @type {any} */ o) => [
      o.target.id,
      o.unaffectedBy ?? null,
      o.condition,
    ]),
    [
      ['gob', null, 'Charmed'],
      ['x', null, 'Charmed'],
      ['wolf', 'not humanoid', null],
    ],
  );
});
