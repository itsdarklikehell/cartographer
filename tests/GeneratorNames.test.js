import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeName, placeWord, renamedFor } from '../src/map/GeneratorNames.js';
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

test('a regenerated node takes the name pattern of its new archetype', () => {
  assert.equal(renamedFor('The Ashford Hills', 'desert'), 'The Ashford Sands');
  assert.equal(renamedFor('Kelamere Heights', 'wetlands'), 'Kelamere Marsh');
  assert.equal(renamedFor('The Crypt of Dunholt', 'cave'), 'Dunholt Caves');
  // The index wraps when the new archetype has fewer patterns.
  assert.equal(renamedFor('The Vaults of Dunholt', 'castle'), 'Castle Dunholt');
  assert.equal(renamedFor('Elmoor Isle', 'town'), 'Elmoor');
});

test('a regenerated node keeps a name that fits its new archetype or no pattern', () => {
  assert.equal(renamedFor('The Ashford Sands', 'desert'), 'The Ashford Sands');
  assert.equal(renamedFor('The Ashford Hills', 'building'), 'The Ashford Hills');
  // A typed name and a one-word town name match no pattern.
  assert.equal(renamedFor('Graypeak Highlands', 'desert'), 'Graypeak Highlands');
  assert.equal(renamedFor('Ashford', 'wilderness'), 'Ashford');
  assert.equal(renamedFor('The ashford hills', 'desert'), 'The ashford hills');
});

test('every generated name renames to a name of the new archetype', () => {
  for (const from of ['wilderness', 'highlands', 'frontier', 'desert', 'wetlands', 'dungeon']) {
    for (let seed = 1; seed < 6; seed++) {
      const name = placeName({ archetype: from, label: from }, mulberry32(seed));
      const renamed = renamedFor(name, 'island');
      assert.match(renamed, /^[A-Z][a-z]+ Isle$/, `${name} -> ${renamed}`);
      assert.equal(renamedFor(renamed, 'island'), renamed);
    }
  }
});
