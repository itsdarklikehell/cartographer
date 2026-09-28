import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeName, placeWord } from '../src/map/GeneratorNames.js';
import { mulberry32 } from '../src/util/Rng.js';

test('a place word follows the seed', () => {
  assert.equal(placeWord(mulberry32(3)), placeWord(mulberry32(3)));
  const words = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => placeWord(mulberry32(s))));
  assert.ok(words.size > 4, 'different seeds give different words');
  for (const word of words) assert.match(word, /^[A-Z][a-z]+$/);
});

test('an inn and a tavern get a sign name', () => {
  for (const label of ['inn', 'tavern']) {
    assert.match(
      placeName({ archetype: 'building', label }, mulberry32(2)),
      /^The [A-Z]\w+ [A-Z]\w+$/,
    );
  }
});

test('a home gets a family name and another building takes its label', () => {
  assert.match(
    placeName({ archetype: 'building', label: 'cottage' }, mulberry32(1)),
    /^The \w+ cottage$/,
  );
  assert.equal(
    placeName({ archetype: 'building', label: 'wizard-tower' }, mulberry32(1)),
    'Wizard tower',
  );
});

test('other archetypes use their patterns, and an unknown one names like a town', () => {
  const castle = placeName({ archetype: 'castle', label: 'castle' }, mulberry32(4));
  assert.match(castle, /^Castle \w+$|^\w+ Keep$/);
  const hills = placeName({ archetype: 'highlands', label: 'highlands' }, mulberry32(4));
  assert.match(hills, /Hills|Heights/);
  assert.match(placeName({ archetype: 'somewhere', label: 'x' }, mulberry32(4)), /^[A-Z][a-z]+$/);
});
