import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assembleEffect } from '../src/entities/SpellDraft.js';
import { CANTRIPS } from '../src/data/spells/cantrips.js';
import { normalizeLibrary } from '../src/library/Library.js';

const chill = /** @type {any} */ (CANTRIPS.find((s) => s.id === 'chill-touch'));

/** The mods a chip row reads with every slant and resist control blank. */
const blankMods = {
  attacks: '',
  attacksAgainst: '',
  attackerTypes: [''],
  once: false,
  resist: [''],
  resistNonmagical: false,
};

/** An attack effect draft with the given on-hit values. */
function attackDraft(onHit) {
  return {
    kind: 'attack',
    damage: chill.effect.damage,
    fires: false,
    projectiles: { count: 1, perStep: 0, autoHit: false },
    onHit,
    drain: '',
  };
}

/** The on-hit values the spell form reads for Chill Touch, with a typed chip. */
function chillOnHit(typed) {
  return {
    condition: 'Chill Touch',
    saveAbility: '',
    until: 'caster-start',
    mods: { ...blankMods, noHealing: true },
    typed,
  };
}

test('the form values of Chill Touch assemble into the built-in effect', () => {
  const typed = {
    types: ['undead'],
    condition: 'Chill Touch (undead)',
    until: 'caster-end',
    mods: { ...blankMods, noHealing: false, disadvantageVsSource: true },
  };
  assert.deepEqual(assembleEffect(attackDraft(chillOnHit(typed))), chill.effect);
});

test('a clear typed chip box leaves no typed chip', () => {
  const effect = /** @type {any} */ (assembleEffect(attackDraft(chillOnHit(null))));
  assert.equal('typed' in effect.onHit, false);
});

test('a typed chip with no name or no ticked type drops out', () => {
  const nameless = { types: ['undead'], condition: '  ', until: '', mods: blankMods };
  const typeless = { types: [], condition: 'Chilled', until: '', mods: blankMods };
  for (const typed of [nameless, typeless]) {
    const effect = /** @type {any} */ (assembleEffect(attackDraft(chillOnHit(typed))));
    assert.equal('typed' in effect.onHit, false);
  }
});

test('a typed chip keeps the slant, resist, and healing mods the form sets', () => {
  const typed = {
    types: ['fiend', 'undead'],
    condition: ' Seared ',
    until: 'target-end',
    mods: {
      ...blankMods,
      attacks: 'disadvantage',
      once: true,
      resist: ['fire', ' cold'],
      noHealing: true,
      disadvantageVsSource: false,
    },
  };
  const effect = /** @type {any} */ (assembleEffect(attackDraft(chillOnHit(typed))));
  assert.deepEqual(effect.onHit.typed, {
    types: ['fiend', 'undead'],
    condition: 'Seared',
    until: 'target-end',
    mods: { noHealing: true, attacks: 'disadvantage', once: true, resist: ['fire', 'cold'] },
  });
});

test('a library load cleans a written typed chip', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        ...chill,
        name: 'Grave Touch',
        effect: {
          ...chill.effect,
          onHit: {
            ...chill.effect.onHit,
            typed: {
              types: ['Undead', 'robot', 'undead', 'fey'],
              condition: ' Grave chill ',
              until: 'someday',
              mods: { disadvantageVsSource: true, noHealing: 'yes' },
            },
          },
        },
      },
    ],
  });
  assert.deepEqual(/** @type {any} */ (lib.spells[0]).effect.onHit.typed, {
    types: ['undead', 'fey'],
    condition: 'Grave chill',
    mods: { disadvantageVsSource: true },
  });
});

test('a library load keeps built-in Chill Touch as written', () => {
  const lib = normalizeLibrary({ spells: [chill] });
  assert.deepEqual(/** @type {any} */ (lib.spells[0]).effect, chill.effect);
});
