import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  locationFields,
  locationOptions,
  moveToPartyChange,
  readLocation,
} from '../src/app/locationFields.js';
import { createMapNode } from '../src/map/TileGrid.js';
import { stubApp, stubGrid } from './helpers/app.js';

const world = createMapNode('world', 'Aldenmoor', null, 8, 8);
const region = createMapNode('vale', 'Green Vale', 'world', 4, 6);
// The fields read the grid alone: the node lookup, and the breadcrumb walk the
// picker labels each map by.
const app = stubApp({ grid: stubGrid([world, region]) });

test('the picker offers the unplaced option first, then every map under its parent', () => {
  const [picker] = locationFields(app, null);
  assert.equal(picker.name, 'nodeId');
  assert.deepEqual(picker.options, [
    { value: '', label: 'Unplaced (appears everywhere)' },
    { value: 'world', label: 'Aldenmoor' },
    { value: 'vale', label: 'Green Vale', group: 'Aldenmoor' },
  ]);
});

test('locationOptions lists top-level maps first, then each parent group depth first', () => {
  const node = (/** @type {string} */ id, /** @type {string | null} */ parentId) =>
    createMapNode(id, id.toUpperCase(), parentId, 2, 2);
  const nodes = [
    node('world', null),
    node('vale', 'world'),
    node('town', 'vale'),
    node('reach', 'world'),
    node('inn', 'town'),
    node('lost', 'gone'),
  ];
  assert.deepEqual(
    locationOptions(nodes, (id) => `path:${id}`),
    [
      { value: 'world', label: 'WORLD' },
      { value: 'lost', label: 'LOST' },
      { value: 'vale', label: 'VALE', group: 'path:world' },
      { value: 'reach', label: 'REACH', group: 'path:world' },
      { value: 'town', label: 'TOWN', group: 'path:vale' },
      { value: 'inn', label: 'INN', group: 'path:town' },
    ],
  );
  assert.deepEqual(
    locationOptions([], (id) => id),
    [],
  );
});

test('the party button is added only on request', () => {
  assert.deepEqual(
    locationFields(app, null).map((f) => f.name),
    ['nodeId', 'tileX', 'tileY'],
  );
  const button = locationFields(app, null, { partyButton: true }).at(-1);
  assert.equal(button?.name, 'toParty');
  assert.equal(button?.type, 'button');
});

/** @param {string} tileId */
function partyForm(tileId) {
  /** @type {Record<string, string | number>} */
  const set = {};
  const form = /** @type {any} */ ({
    set: (/** @type {string} */ k, /** @type {string | number} */ v) => {
      set[k] = v;
    },
  });
  const change = moveToPartyChange(
    /** @type {any} */ ({ partyTracker: { getPosition: () => ({ nodeId: 'vale', tileId }) } }),
  );
  return { set, form, change };
}

test('the party button writes the party map, column, and row, and ignores other fields', () => {
  const { set, form, change } = partyForm('4,2');
  assert.equal(change('name', form), false);
  assert.deepEqual(set, {});
  assert.equal(change('toParty', form), true);
  assert.deepEqual(set, { nodeId: 'vale', tileX: 5, tileY: 3 });
});

test('the party button falls back to the first tile for an unreadable tile id', () => {
  const { set, form, change } = partyForm('bad');
  change('toParty', form);
  assert.deepEqual(set, { nodeId: 'vale', tileX: 1, tileY: 1 });
});

test('the unplaced label can be reworded for a character', () => {
  const [picker] = locationFields(app, null, { unplacedLabel: 'With the party' });
  assert.equal(picker.options?.[0].label, 'With the party');
});

test('an existing location pre-selects its map and shows its column and row from 1', () => {
  const [picker, x, y] = locationFields(app, { nodeId: 'vale', tileId: '2,3' });
  assert.equal(picker.value, 'vale');
  assert.equal(x.label, 'Column');
  assert.equal(y.label, 'Row');
  assert.equal(x.value, 3, 'stored column 2 is the third column a GM sees');
  assert.equal(y.value, 4);
});

test('no location, or one whose tile id cannot be read, opens at the top-left tile', () => {
  for (const location of [null, { nodeId: 'vale', tileId: 'nonsense' }]) {
    const [, x, y] = locationFields(app, location);
    assert.equal(x.value, 1);
    assert.equal(y.value, 1);
  }
});

test('the coordinate fields refuse numbers below 1', () => {
  const [, x, y] = locationFields(app, null);
  assert.equal(x.min, 1);
  assert.equal(y.min, 1);
});

test('reading back a picked map and 1-based coordinates gives a 0-based tile id', () => {
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '3', tileY: '4' }), {
    nodeId: 'vale',
    tileId: '2,3',
  });
});

test('a position copied from the map description lands on the same tile', () => {
  // The screen reader says "column 1, row 1" for the top-left tile, and the
  // dialog reads those numbers straight back to the stored id "0,0".
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '1', tileY: '1' }), {
    nodeId: 'vale',
    tileId: '0,0',
  });
});

test('coordinates outside the chosen map are clamped to its bounds', () => {
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '99', tileY: '99' }), {
    nodeId: 'vale',
    tileId: '3,5',
  });
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '-4', tileY: '0' }), {
    nodeId: 'vale',
    tileId: '0,0',
  });
});

test('unreadable coordinates land on the top-left tile rather than on NaN', () => {
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '', tileY: 'x' }), {
    nodeId: 'vale',
    tileId: '0,0',
  });
});

test('the unplaced option and a map that is gone both read as no location', () => {
  assert.equal(readLocation(app, { nodeId: '', tileX: '2', tileY: '3' }), null);
  assert.equal(readLocation(app, { nodeId: 'deleted', tileX: '2', tileY: '3' }), null);
});
