import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wardTurns, wardedOutcome } from '../src/entities/CastRolls.js';

/**
 * An attack spell's outcome checked again after its target raised its AC
 * with a reaction (Shield).
 */

const FIRE = { damageType: 'fire', rolls: [6], bonus: 0, subtotal: 6 };
const damage = (n) => ({
  total: n,
  text: `${n} fire`,
  detail: `${n} fire`,
  byType: [{ ...FIRE, rolls: [n], subtotal: n }],
});
const attack = (total) => /** @type {any} */ ({ total });
const effect = /** @type {any} */ ({ kind: 'attack', damage: [] });
const target = { id: 'mage', name: 'Mage' };

/** A single-roll hit of `total` against AC 12. */
const single = (total, natural = 10) => ({
  target,
  attack: attack(total),
  natural,
  crit: natural === 20,
  hit: true,
  ac: 12,
  damage: damage(6),
  rider: null,
  ongoing: [{ count: 1, sides: 4, damageType: 'acid' }],
  onHit: { condition: 'Poisoned' },
});

test('a hit that misses the raised AC turns into a plain miss', () => {
  const warded = wardedOutcome(effect, single(15), 5);
  assert.equal(warded.hit, false);
  assert.equal(warded.ac, 17);
  assert.equal(warded.damage, null);
  assert.equal('ongoing' in warded, false);
  assert.equal('onHit' in warded, false);
  assert.equal(wardTurns(effect, single(15), 5), true);
});

test('a spell with half damage on a miss keeps its dice as the splash', () => {
  const warded = wardedOutcome({ ...effect, halfOnMiss: true }, single(15), 5);
  assert.equal(warded.hit, false);
  assert.equal(warded.halved, true);
  assert.equal(warded.damage.total, 6);
});

test('a natural 20 and a roll that still meets the new AC keep their hit', () => {
  assert.equal(wardedOutcome(effect, single(18, 20), 5).hit, true);
  const still = wardedOutcome(effect, single(17), 5);
  assert.equal(still.hit, true);
  assert.equal(still.ac, 17);
  assert.equal(wardTurns(effect, single(17), 5), false);
});

test('a miss or a ward that raised nothing leaves the outcome as it was', () => {
  const miss = { ...single(9), hit: false, damage: null };
  assert.equal(wardedOutcome(effect, miss, 5), miss);
  const hit = single(15);
  assert.equal(wardedOutcome(effect, hit, 0), hit);
});

/** A projectile outcome with one shot per total, a null total hitting automatically. */
function volley(totals) {
  const shots = totals.map((t) => ({
    attack: t === null ? null : attack(t),
    natural: t === null ? 0 : 10,
    crit: false,
    hit: true,
    damage: damage(3),
    rider: null,
  }));
  return {
    target,
    ac: 12,
    shots,
    fired: shots.length,
    hits: shots.length,
    hit: true,
    damage: damage(3 * shots.length),
    onHit: { condition: 'Poisoned' },
  };
}

test('each projectile under the raised AC misses, and the damage adds up again', () => {
  const warded = wardedOutcome(effect, volley([15, 19]), 5);
  assert.equal(warded.hits, 1);
  assert.equal(warded.hit, true);
  assert.equal(warded.damage.total, 3);
  assert.deepEqual(warded.onHit, { condition: 'Poisoned' });
  assert.equal(wardTurns(effect, volley([15, 19]), 5), true);
  assert.equal(wardTurns(effect, volley([19, 20]), 5), false);
});

test('projectiles that hit automatically are blocked outright', () => {
  const warded = wardedOutcome(effect, volley([null, null, null]), 5);
  assert.equal(warded.hits, 0);
  assert.equal(warded.hit, false);
  assert.equal(warded.damage, null);
  assert.equal('onHit' in warded, false);
});
