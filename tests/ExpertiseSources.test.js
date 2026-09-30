import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasExpertiseSource } from '../src/entities/ExpertiseSources.js';
import { withExpertise } from '../src/entities/Proficiencies.js';

/** @param {string} classId @param {number} level @param {object} [extra] */
function classed(classId, level, extra = {}) {
  return /** @type {any} */ ({
    id: 'c1',
    name: 'Aldric',
    classes: [{ classId, level }],
    level,
    stats: {},
    resources: [],
    proficiencies: { skills: ['athletics'], saves: [], expertise: [] },
    ...extra,
  });
}

test('a Fighter with no expertise has no source', () => {
  assert.equal(hasExpertiseSource(classed('fighter', 4)), false);
});

test('the Rogue Expertise feature is a source', () => {
  assert.equal(hasExpertiseSource(classed('rogue', 1)), true);
});

test('expertise already on record counts, so a hand grant stays editable', () => {
  assert.equal(hasExpertiseSource(withExpertise(classed('fighter', 4), ['athletics'])), true);
});

test('a feat that asked for expertise is a source, and a feat without it is not', () => {
  /** @param {string[] | undefined} expertise */
  const withFeat = (expertise) =>
    classed('fighter', 4, {
      asiChoices: {
        'fighter 4': {
          classId: 'fighter',
          classLevel: 4,
          order: 0,
          type: 'feat',
          feat: 'Skill Expert',
          requested: expertise ? { expertise } : {},
        },
      },
    });
  assert.equal(hasExpertiseSource(withFeat(['athletics'])), true);
  assert.equal(hasExpertiseSource(withFeat(undefined)), false);
});
