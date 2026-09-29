import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipLabel, chipNotes } from '../src/view/ChipText.js';
import { effectSummary, hitLines, laterTurnLines } from '../src/view/SpellEffectText.js';
import { createCondition } from '../src/entities/Conditions.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

const spellById = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));
const acid = { damage: [{ count: 2, sides: 4, damageType: 'acid' }] };

test('a chip label counts rounds, or says next turn for a boundary chip', () => {
  assert.equal(chipLabel(createCondition('Prone')), 'Prone');
  assert.equal(chipLabel(createCondition('Bless', 10)), 'Bless (10)');
  const shield = createCondition('Shield', null, { expires: { who: 'm', at: 'start', count: 1 } });
  assert.equal(chipLabel(shield), 'Shield (next turn)');
});

test('chip notes name the rider, the later damage, and the boundary', () => {
  const chip = createCondition('Frightened', null, {
    rider: { rolls: ['attack'], dice: -1, die: 'd4' },
    ongoing: acid,
    expires: { who: 'mage', at: 'end', count: 1 },
    source: { spellId: 'pk', spellName: 'Phantasmal Killer', casterId: 'mage', saveEnds: true },
  });
  assert.deepEqual(
    chipNotes(chip, (id) => (id === 'mage' ? 'Mage' : undefined)),
    [
      '-1d4 to attack rolls',
      '2d4 acid at the end of each turn, on a failed save',
      "Ends at the end of Mage's turn",
    ],
  );
  const burning = createCondition('Acid Arrow', null, {
    ongoing: acid,
    expires: { who: 'x', at: 'end', count: 1 },
  });
  assert.deepEqual(chipNotes(burning), [
    '2d4 acid at the end of each turn',
    'Ends at the end of a turn',
  ]);
  assert.deepEqual(chipNotes(createCondition('Prone')), []);
});

test('the effect summary names a melee attack, its modifier, and a splash', () => {
  assert.equal(
    effectSummary(spellById('spiritual-weapon'), null),
    'Melee spell attack — 1d8 force + spellcasting modifier',
  );
  assert.equal(
    effectSummary(spellById('acid-arrow'), null),
    'Spell attack — 4d4 acid (half on a miss)',
  );
  assert.equal(
    effectSummary(spellById('sunbeam'), 15),
    "CON save DC 15 — 6d8 radiant (half on save), Blinded until the start of the caster's next turn",
  );
  assert.equal(effectSummary(spellById('light'), null), null);
});

test('later-turn lines state the damage left behind and the repeat', () => {
  assert.deepEqual(laterTurnLines(spellById('acid-arrow')), [
    "A hit also deals 2d4 acid (+1d4 acid per level) at the end of the target's next turn.",
  ]);
  assert.deepEqual(laterTurnLines(spellById('phantasmal-killer')), [
    'A failed save also deals 4d10 psychic (+1d10 psychic per level) at the end of each of its turns while it fails the repeated save.',
  ]);
  assert.deepEqual(laterTurnLines(spellById('witch-bolt')), [
    'On each later turn while the spell lasts, an action deals 1d12 lightning to the creature it hit, with no roll. No slot.',
  ]);
  assert.deepEqual(laterTurnLines(spellById('spiritual-weapon')), [
    'On each later turn while the spell lasts, a bonus action repeats the effect. No slot.',
  ]);
  assert.deepEqual(laterTurnLines(spellById('fire-bolt')), []);
});

test('later damage on a save reads by what it rides on', () => {
  const base = spellById('phantasmal-killer');
  const held = { ...base, effect: { ...base.effect, saveEnds: false } };
  assert.match(
    laterTurnLines(held)[0],
    /at the end of each of its turns while it is Frightened\.$/,
  );
  const bare = { ...base, effect: { ...base.effect, condition: undefined, saveEnds: false } };
  assert.match(laterTurnLines(bare)[0], /at the end of the target's next turn\.$/);
  const reaction = { ...spellById('witch-bolt'), repeat: { cost: 'bonus' } };
  assert.match(laterTurnLines(reaction)[0], /a bonus action repeats the effect/);
});

test('the effect summary reads projectiles, healing, and buffs', () => {
  assert.equal(
    effectSummary(spellById('eldritch-blast'), null),
    '1 projectile (+1 per level), spell attack — 1d10 force each',
  );
  assert.equal(
    effectSummary(spellById('magic-missile'), null),
    '3 projectiles (+1 per level), hits automatically — 1d4+1 force each',
  );
  assert.equal(
    effectSummary(spellById('cure-wounds'), null),
    'Healing — 1d8 healing + spellcasting modifier',
  );
  assert.equal(
    effectSummary(spellById('bless'), null),
    'Bless — +1d4 to attack rolls and saving throws',
  );
  assert.equal(effectSummary(spellById('invisibility'), null), 'Invisible');
});

test('the detail states what a hit does besides its damage', () => {
  assert.deepEqual(hitLines(spellById('ray-of-sickness'), 14), [
    "A creature it hits makes a CON save DC 14, and on a failure it is Poisoned until the end of the caster's next turn.",
  ]);
  assert.deepEqual(hitLines(spellById('vampiric-touch'), null), [
    'The caster regains hit points equal to half the damage its hits deal.',
  ]);
  const ray = spellById('ray-of-sickness');
  assert.deepEqual(
    hitLines(
      { ...ray, effect: { ...ray.effect, onHit: { condition: 'Blinded' }, drain: 'full' } },
      null,
    ),
    [
      'A creature it hits is also Blinded.',
      'The caster regains hit points equal to all the damage its hits deal.',
    ],
  );
  assert.deepEqual(hitLines(spellById('fireball'), 14), []);
  assert.deepEqual(hitLines(spellById('magic-missile'), 14), []);
});
