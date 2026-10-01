import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  creatureTags,
  facetOptions,
  matchesFacets,
  spellTags,
} from '../src/library/LibraryFacets.js';

test('spellTags lists each class and the level', () => {
  assert.deepEqual(spellTags(/** @type {any} */ ({ classes: ['bard', 'wizard'], level: 2 })), [
    'class:bard',
    'class:wizard',
    'level:2',
  ]);
  assert.deepEqual(spellTags(/** @type {any} */ ({ level: 0 })), ['level:0']);
  assert.deepEqual(spellTags(/** @type {any} */ ({ level: 1, school: 'evocation' })), [
    'level:1',
    'school:evocation',
  ]);
  assert.deepEqual(facetOptions([{ tags: ['school:evocation'] }], 'school', 'All schools'), [
    { value: '', label: 'All schools' },
    { value: 'school:evocation', label: 'Evocation' },
  ]);
});

test('creatureTags gives a rated creature its challenge rating', () => {
  assert.deepEqual(creatureTags(/** @type {any} */ ({ cr: 0.25 })), ['cr:0.25']);
  assert.deepEqual(creatureTags(/** @type {any} */ ({})), []);
  assert.deepEqual(creatureTags(/** @type {any} */ ({ cr: 1.5 })), []);
});

test('facetOptions offers each carried value once, sorted, after All', () => {
  const rows = [
    { tags: ['level:10', 'class:wizard'] },
    { tags: ['level:2', 'class:bard'] },
    { tags: ['level:0', 'class:wizard'] },
    {},
  ];
  assert.deepEqual(facetOptions(rows, 'level', 'All levels'), [
    { value: '', label: 'All levels' },
    { value: 'level:0', label: 'Cantrip' },
    { value: 'level:2', label: 'Level 2' },
    { value: 'level:10', label: 'Level 10' },
  ]);
  assert.deepEqual(
    facetOptions(rows, 'class', 'All classes').map((o) => o.label),
    ['All classes', 'Bard', 'Wizard'],
  );
  assert.deepEqual(facetOptions([{ tags: ['cr:0.5'] }, { tags: ['cr:3'] }], 'cr', 'Any CR'), [
    { value: '', label: 'Any CR' },
    { value: 'cr:0.5', label: 'CR 1/2' },
    { value: 'cr:3', label: 'CR 3' },
  ]);
  assert.deepEqual(facetOptions([{ tags: ['x:b'] }, { tags: ['x:a'] }], 'x', 'All').at(-1), {
    value: 'x:b',
    label: 'b',
  });
});

test('matchesFacets needs every chosen tag and passes an empty choice', () => {
  assert.equal(matchesFacets(['class:bard', 'level:1'], ['class:bard', '']), true);
  assert.equal(matchesFacets(['class:bard'], ['class:bard', 'level:1']), false);
  assert.equal(matchesFacets(undefined, ['']), true);
  assert.equal(matchesFacets(undefined, ['cr:1']), false);
});
