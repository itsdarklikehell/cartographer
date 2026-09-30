import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freeSchoolPicks,
  thirdCasterSpellIssues,
  thirdCasterSpellsKnown,
} from '../src/entities/ThirdCasterSpells.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

/** @param {string[]} ids */
const resolve = (ids) => DEFAULT_SPELLS.filter((s) => ids.includes(s.id));

/**
 * @param {import('../src/types/class.js').ClassRef[]} classes
 * @param {Partial<import('../src/types/entities.js').Spellbook>} book
 */
function caster(classes, book) {
  return /** @type {any} */ ({
    id: 'c1',
    name: 'Wren',
    classes,
    level: classes.reduce((s, c) => s + c.level, 0),
    stats: {},
    resources: [],
    spellbook: { cantrips: [], known: [], prepared: [], ...book },
  });
}

const trickster = [{ classId: 'rogue', level: 4, subclass: 'arcane-trickster' }];

test('the known-spells table follows the subclass progression', () => {
  assert.equal(thirdCasterSpellsKnown(2), 0);
  assert.equal(thirdCasterSpellsKnown(3), 3);
  assert.equal(thirdCasterSpellsKnown(4), 4);
  assert.equal(thirdCasterSpellsKnown(9), 6);
  assert.equal(thirdCasterSpellsKnown(20), 13);
});

test('any-school picks come at class levels 3, 8, 14, and 20', () => {
  assert.equal(freeSchoolPicks(2), 0);
  assert.equal(freeSchoolPicks(4), 1);
  assert.equal(freeSchoolPicks(8), 2);
  assert.equal(freeSchoolPicks(20), 4);
});

test('a legal Arcane Trickster 4 has no warnings', () => {
  const wren = caster(trickster, {
    cantrips: ['mage-hand'],
    known: ['sleep', 'charm-person', 'color-spray', 'magic-missile'],
  });
  assert.deepEqual(thirdCasterSpellIssues(wren, resolve), []);
});

test('an Arcane Trickster warns on the count, the schools, and a missing Mage Hand', () => {
  const wren = caster(trickster, {
    cantrips: ['light'],
    known: ['magic-missile', 'mage-armor', 'thunderwave', 'burning-hands', 'sleep'],
  });
  assert.deepEqual(thirdCasterSpellIssues(wren, resolve), [
    'Arcane Trickster 4 knows 4 leveled spells, and this sheet has 5.',
    'Arcane Trickster 4 may know 1 spell outside enchantment and illusion, and this ' +
      'sheet has 4: Burning Hands, Mage Armor, Magic Missile, Thunderwave.',
    'Arcane Trickster 4 always knows Mage Hand.',
  ]);
});

test('an unknown cantrip id still names the missing grant', () => {
  const wren = caster(trickster, {});
  assert.deepEqual(
    thirdCasterSpellIssues(wren, () => []),
    ['Arcane Trickster 4 always knows mage-hand.'],
  );
});

test('an Eldritch Knight counts only the spells learned under the fighter', () => {
  const brannoc = caster(
    [
      { classId: 'fighter', level: 8, subclass: 'eldritch-knight' },
      { classId: 'wizard', level: 1 },
    ],
    {
      known: ['sleep', 'charm-person', 'color-spray', 'shield'],
      sources: { sleep: 'fighter', 'charm-person': 'fighter', 'color-spray': 'fighter' },
    },
  );
  assert.deepEqual(thirdCasterSpellIssues(brannoc, resolve), [
    'Eldritch Knight 8 may know 2 spells outside abjuration and evocation, and this ' +
      'sheet has 3: Charm Person, Color Spray, Sleep.',
  ]);
});

test('a fighter below the subclass level and other casters have no warnings', () => {
  const early = caster([{ classId: 'fighter', level: 2, subclass: 'eldritch-knight' }], {
    known: ['sleep'],
  });
  const wizard = caster([{ classId: 'wizard', level: 3 }], { known: ['sleep'] });
  assert.deepEqual(thirdCasterSpellIssues(early, resolve), []);
  assert.deepEqual(thirdCasterSpellIssues(wizard, resolve), []);
});
