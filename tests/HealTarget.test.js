import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healBlocked, healBlockedLine, healingBlockedBy } from '../src/entities/HealTarget.js';
import { normalizeChipMods } from '../src/entities/ChipMods.js';
import { normalizeOnHit } from '../src/entities/SpellFields.js';

const chill = { name: 'Chill Touch', rounds: null, mods: { noHealing: true } };

test('healingBlockedBy finds the chip that stops healing', () => {
  assert.equal(healingBlockedBy([{ name: 'Bless', rounds: null }, chill]), chill);
  assert.equal(healingBlockedBy(undefined), undefined);
});

test('healBlocked reads a chip that stops healing only for a living target', () => {
  const goblin = /** @type {any} */ ({ currentHP: 3, conditions: [chill] });
  assert.equal(healBlocked('creature', goblin, false), 'noHealing');
  assert.equal(healBlocked('creature', { ...goblin, currentHP: 0 }, false), 'defeated');
  assert.equal(healBlocked('creature', { ...goblin, conditions: [] }, false), null);
  assert.equal(
    healBlockedLine('Heal', 'Goblin', 'noHealing'),
    'Heal has no effect on Goblin, who cannot regain hit points.',
  );
});

test('a chip mod and an on-hit chip keep the noHealing flag', () => {
  assert.deepEqual(normalizeChipMods({ noHealing: true }), { noHealing: true });
  assert.equal(normalizeChipMods({ noHealing: 'yes' }), null);
  assert.deepEqual(normalizeOnHit({ condition: 'Chill Touch', mods: { noHealing: true } }), {
    condition: 'Chill Touch',
    mods: { noHealing: true },
  });
  assert.deepEqual(normalizeOnHit({ condition: 'Poisoned', mods: { noHealing: false } }), {
    condition: 'Poisoned',
  });
});

test('a typed on-hit chip needs a condition and a known type', async () => {
  const { normalizeTypedChip } = await import('../src/entities/SpellFields.js');
  assert.equal(normalizeTypedChip(null), null);
  assert.equal(normalizeTypedChip({ condition: 'X', types: ['robot'] }), null);
  assert.equal(normalizeTypedChip({ condition: ' ', types: ['undead'] }), null);
  assert.deepEqual(
    normalizeTypedChip({
      condition: 'Chilled',
      types: ['Undead'],
      until: 'caster-end',
      mods: { disadvantageVsSource: true },
    }),
    {
      types: ['undead'],
      condition: 'Chilled',
      until: 'caster-end',
      mods: { disadvantageVsSource: true },
    },
  );
  assert.deepEqual(normalizeTypedChip({ condition: 'Chilled', types: ['undead'] }), {
    types: ['undead'],
    condition: 'Chilled',
  });
});
