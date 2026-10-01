import { test } from 'node:test';
import assert from 'node:assert/strict';

import { featDetail, featureGroups } from '../src/view/FeatureCards.js';

test('a feat detail lists the increases before the description', () => {
  assert.equal(
    featDetail({
      name: 'Actor',
      source: 'Bard 4',
      increases: { CHA: 1, DEX: 0 },
      description: 'Mimic.',
    }),
    '+1 CHA. Mimic.',
  );
  assert.equal(featDetail({ name: 'Alert', source: 'Rogue 4' }), '');
  assert.equal(featDetail({ name: 'Lucky', source: 'Rogue 4', description: 'Reroll.' }), 'Reroll.');
});

test('the groups read class, race, then feats, and drop empty groups', () => {
  const groups = featureGroups({
    classFeatures: [{ name: 'Second Wind', source: 'Fighter 1', detail: '', key: 'k' }],
    race: 'Dwarf',
    traits: ['Stonecunning'],
    feats: [{ name: 'Tough', source: 'Fighter 4 feat' }],
  });
  assert.deepEqual(
    groups.map((g) => g.title),
    ['Class features', 'Race traits', 'Feats'],
  );
  assert.deepEqual(groups[1].cards, [{ name: 'Stonecunning', source: 'Dwarf', detail: '' }]);
  assert.deepEqual(groups[2].cards, [{ name: 'Tough', source: 'Fighter 4 feat', detail: '' }]);
  assert.deepEqual(featureGroups({ classFeatures: [], race: '', traits: [], feats: [] }), []);
});
