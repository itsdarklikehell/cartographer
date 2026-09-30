import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { scalingSteps, summonCount } from '../src/entities/CastScaling.js';
import { normalizeLibrary } from '../src/library/Library.js';
import { assembleEffect } from '../src/entities/SpellDraft.js';

const byId = (/** @type {string} */ id) => {
  const found = DEFAULT_SPELLS.find((s) => s.id === id);
  assert.ok(found, id);
  return /** @type {any} */ (found);
};

test('Conjure Animals summons 8 wolves, doubled at 5th, tripled at 7th, quadrupled at 9th', () => {
  const spell = byId('conjure-animals');
  const counts = [3, 4, 5, 6, 7, 8, 9].map((slot) =>
    summonCount(spell.effect, scalingSteps(spell, slot, 1)),
  );
  assert.deepEqual(counts, [8, 8, 16, 16, 24, 24, 32]);
});

test('a library copy of Conjure Animals keeps its two-level scaling step', () => {
  const [copy] = normalizeLibrary({ spells: [byId('conjure-animals')] }).spells;
  assert.deepEqual(copy.scaling, { levelsPerStep: 2 });
});

test('Fear leaves the retry to the GM, with no automatic save each turn', () => {
  assert.equal('saveEnds' in byId('fear').effect, false);
});

test('Revivify raises the dead, and no other built-in heal does', () => {
  const revivers = DEFAULT_SPELLS.filter((s) => s.effect.kind === 'heal' && s.effect.revives);
  assert.deepEqual(
    revivers.map((s) => s.id),
    ['revivify'],
  );
});

test('the library keeps the raise-the-dead flag of a heal only when it is true', () => {
  const lib = normalizeLibrary({
    spells: [
      { name: 'Raise', effect: { kind: 'heal', healing: [], revives: true } },
      { name: 'Odd', effect: { kind: 'heal', healing: [], revives: 'yes' } },
    ],
  });
  assert.equal(/** @type {any} */ (lib.spells[0].effect).revives, true);
  assert.equal('revives' in lib.spells[1].effect, false);
});

test('the spell form keeps the raise-the-dead flag of a heal when it is ticked', () => {
  const draft = (/** @type {object} */ over) =>
    /** @type {any} */ ({ kind: 'heal', damage: [], ...over });
  assert.equal(/** @type {any} */ (assembleEffect(draft({ revives: true }))).revives, true);
  assert.equal('revives' in assembleEffect(draft({})), false);
});

test('the library and the spell form keep the conditions a heal ends', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Mend',
        effect: { kind: 'heal', healing: [], removes: ['Blinded', ''], removesOneOf: 'Charmed, x' },
      },
      { name: 'Plain', effect: { kind: 'heal', healing: [], removes: 7 } },
    ],
  });
  assert.deepEqual(/** @type {any} */ (lib.spells[0].effect).removes, ['Blinded']);
  assert.deepEqual(/** @type {any} */ (lib.spells[0].effect).removesOneOf, ['Charmed', 'x']);
  assert.equal('removes' in lib.spells[1].effect, false);
  // The built-in restorations round-trip through the library unchanged.
  for (const id of ['lesser-restoration', 'greater-restoration', 'heal']) {
    const again = normalizeLibrary({ spells: [byId(id)] }).spells[0];
    assert.deepEqual(again.effect, byId(id).effect, id);
  }
  const effect = /** @type {any} */ (
    assembleEffect(
      /** @type {any} */ ({
        kind: 'heal',
        damage: [],
        removes: 'Blinded, Deafened',
        removesOneOf: '',
      }),
    )
  );
  assert.deepEqual(effect.removes, ['Blinded', 'Deafened']);
  assert.equal('removesOneOf' in effect, false);
});
