import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attackExtras,
  normalizeLevelsPerStep,
  normalizeOngoing,
  normalizeParts,
  normalizeRepeat,
  normalizeUntil,
  saveExtras,
} from '../src/entities/SpellFields.js';
import { heldRepeat, opensRepeat, repeatedSpell } from '../src/entities/SpellRepeat.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

const acid = (count) => ({ count, sides: 4, damageType: 'acid' });
const spellById = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

test('a boundary reads only as one of the three it names', () => {
  assert.equal(normalizeUntil('caster-start'), 'caster-start');
  assert.equal(normalizeUntil('dawn'), null);
  assert.equal(normalizeUntil(undefined), null);
});

test('damage terms repair each term and drop what is not one', () => {
  assert.deepEqual(normalizeParts([acid(2), null, 'x']), [acid(2)]);
  assert.deepEqual(normalizeParts('2d4'), []);
});

test('later-turn damage needs dice, and keeps its growth and boundary', () => {
  assert.equal(normalizeOngoing(null), null);
  assert.equal(normalizeOngoing({ damage: [] }), null);
  assert.deepEqual(normalizeOngoing({ damage: [acid(2)] }), { damage: [acid(2)] });
  assert.deepEqual(
    normalizeOngoing({ damage: [acid(2)], perStep: [acid(1)], until: 'caster-end' }),
    { damage: [acid(2)], perStep: [acid(1)], until: 'caster-end' },
  );
  assert.deepEqual(normalizeOngoing({ damage: [acid(2)], until: 'later' }), {
    damage: [acid(2)],
  });
});

test('a repeat keeps a known cost and fixed damage, and an empty block is still a repeat', () => {
  assert.equal(normalizeRepeat(undefined), null);
  assert.deepEqual(normalizeRepeat({}), {});
  assert.deepEqual(normalizeRepeat({ cost: 'bonus', damage: [acid(1)] }), {
    cost: 'bonus',
    damage: [acid(1)],
  });
  assert.deepEqual(normalizeRepeat({ cost: 'reaction', damage: [] }), {});
});

test('attack flags come through only when true', () => {
  assert.deepEqual(attackExtras({ melee: 'yes', halfOnMiss: false }), {});
  assert.deepEqual(
    attackExtras({
      melee: true,
      halfOnMiss: true,
      addsModifier: true,
      ongoing: { damage: [acid(2)] },
    }),
    { melee: true, halfOnMiss: true, addsModifier: true, ongoing: { damage: [acid(2)] } },
  );
});

test('a save keeps a boundary only with a condition to end', () => {
  assert.deepEqual(saveExtras({ until: 'caster-start' }, 'Blinded'), { until: 'caster-start' });
  assert.deepEqual(saveExtras({ until: 'caster-start' }, ''), {});
});

test('levels per step reads 2 and up, and one or garbage as the default', () => {
  assert.equal(normalizeLevelsPerStep(2), 2);
  assert.equal(normalizeLevelsPerStep(1), 0);
  assert.equal(normalizeLevelsPerStep('x'), 0);
});

test('a caster keeps a repeat open through the chip its own cast wrote', () => {
  const hold = { slotLevel: 3, targetIds: ['ogre'] };
  const chip = {
    name: 'Witch Bolt',
    rounds: 10,
    source: { spellId: 'witch-bolt', spellName: 'Witch Bolt', casterId: 'mage', repeat: hold },
  };
  assert.deepEqual(heldRepeat({ id: 'mage', conditions: [chip] }, 'witch-bolt'), hold);
  assert.equal(heldRepeat({ id: 'other', conditions: [chip] }, 'witch-bolt'), null);
  assert.equal(heldRepeat({ id: 'mage' }, 'witch-bolt'), null);
});

test('a fixed-damage repeat resolves as an unscaled automatic hit', () => {
  const bolt = spellById('witch-bolt');
  const repeated = repeatedSpell(bolt);
  assert.equal(repeated.scaling, undefined);
  assert.deepEqual(repeated.effect, {
    kind: 'attack',
    damage: bolt.repeat.damage,
    projectiles: { count: 1, autoHit: true },
  });
  const weapon = spellById('spiritual-weapon');
  assert.equal(repeatedSpell(weapon), weapon);
});

test('a locked repeat opens only on a hit, and an open one on any cast', () => {
  assert.equal(opensRepeat(spellById('witch-bolt'), []), false);
  assert.equal(opensRepeat(spellById('witch-bolt'), ['ogre']), true);
  assert.equal(opensRepeat(spellById('spiritual-weapon'), []), true);
  assert.equal(opensRepeat(spellById('fire-bolt'), ['ogre']), false);
});
