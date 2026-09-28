import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeHandout,
  parseAudience,
  parsePlace,
  placeOptions,
  placeValue,
} from '../src/handout/HandoutForm.js';
import { createHandout } from '../src/handout/Handouts.js';

const everywhere = { nodeId: null, tileId: null };
const wholeWorld = { nodeId: 'world', tileId: null };
const partyTile = { nodeId: 'world', tileId: '2,3' };

test('placeValue and parsePlace round-trip every kind of place', () => {
  for (const place of [everywhere, wholeWorld, partyTile, { nodeId: 'a:b', tileId: '1,1' }]) {
    assert.deepEqual(parsePlace(placeValue(place)), place);
  }
});

test('placeValue drops the tile of a campaign-wide place', () => {
  assert.equal(placeValue({ nodeId: null, tileId: '1,1' }), placeValue(everywhere));
});

test('parsePlace reads a value that does not parse as campaign-wide', () => {
  for (const value of ['', 'not json', '[1,2]', '{"nodeId":"x"}', '[null,"1,1"]']) {
    assert.deepEqual(parsePlace(value), everywhere);
  }
  assert.deepEqual(parsePlace('["world", 5]'), wholeWorld);
});

test('placeOptions labels each place, marks the party tile, and drops repeats', () => {
  const name = (/** @type {string} */ id) => ({ world: 'The World', cave: 'Cave' })[id] ?? id;
  const options = placeOptions(
    [everywhere, wholeWorld, partyTile, wholeWorld, { nodeId: 'cave', tileId: '0,0' }],
    name,
    partyTile,
  );
  assert.deepEqual(
    options.map((o) => o.label),
    [
      'Everywhere (campaign-wide)',
      'Anywhere in The World',
      "Tile 2,3 of The World (the party's tile)",
      'Tile 0,0 of Cave',
    ],
  );
  assert.deepEqual(parsePlace(options[3].value), { nodeId: 'cave', tileId: '0,0' });
});

test('parseAudience reads the checked ids, and none checked as every player', () => {
  assert.deepEqual(parseAudience('aria,bram'), ['aria', 'bram']);
  assert.equal(parseAudience(''), null);
  assert.equal(parseAudience(undefined), null);
});

test('describeHandout names the tile and the audience for the GM', () => {
  const names = (/** @type {string} */ id) => ({ aria: 'Aria' })[id];
  assert.equal(describeHandout(createHandout('a', 'A', '', 'world'), names), '');
  const both = createHandout('b', 'B', '', 'world', false, null, {
    tileId: '4,1',
    audience: ['aria', 'gone'],
  });
  assert.equal(
    describeHandout(both, names),
    'Shows on tile 4,1. Only for Aria, a removed character',
  );
});
