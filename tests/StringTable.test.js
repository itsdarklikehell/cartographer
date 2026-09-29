import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreStrings, tabulateStrings } from '../src/storage/StringTable.js';
import { buildState, deserialize, serialize } from '../src/storage/SaveManager.js';
import { referencedAssetKeys } from '../src/storage/Assets.js';
import { createMapNode, createTile, TileGrid } from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { TilePalette } from '../src/map/TilePalette.js';

/** An encoded node with only the fields the table reads. */
const node = (/** @type {string} */ id, /** @type {unknown[]} */ refs) => ({ id, refs, cells: [] });

test('palette strings move into one table in order of first use', () => {
  const save = {
    version: 9,
    nodes: [
      node('a', ['grass', ['road-h', 'asset:k1']]),
      { id: 'plain', tiles: [] },
      node('b', [['grass', ['road-h', 'lava']], 'snow', 7]),
    ],
  };
  const packed = tabulateStrings(save);
  assert.deepEqual(packed.strings, ['grass', 'road-h', 'asset:k1', 'lava', 'snow']);
  assert.deepEqual(packed.nodes[0].refs, [0, [1, 2]]);
  assert.deepEqual(packed.nodes[2].refs, [[0, [1, 3]], 4, 7]);
  assert.equal(packed.nodes[1], save.nodes[1], 'a node with no palette is untouched');
  assert.deepEqual(save.nodes[0].refs, ['grass', ['road-h', 'asset:k1']], 'the input is untouched');
  // The number 7 was never a string, so with the table read back it is an
  // index that names nothing and stays a number.
  const back = restoreStrings(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(back, { ...save, nodes: [save.nodes[0], save.nodes[1], save.nodes[2]] });
  assert.equal('strings' in back, false, 'the table never reaches the load steps after it');
});

test('a save with no palette string has no table', () => {
  const noNodes = { version: 9 };
  assert.equal(tabulateStrings(noNodes), noNodes);
  const empty = { nodes: [node('a', []), node('b', [5]), null, 'x'] };
  assert.equal(tabulateStrings(empty), empty);
  assert.equal(tabulateStrings(empty).nodes[0], empty.nodes[0]);
});

test('an unchanged node tabulates to the same object while its indices hold', () => {
  const a = node('a', ['grass']);
  const b = node('b', ['snow', 'grass']);
  const first = tabulateStrings({ nodes: [a, b] });
  const second = tabulateStrings({ nodes: [a, b] });
  assert.equal(second.nodes[0], first.nodes[0]);
  assert.equal(second.nodes[1], first.nodes[1]);
  // A new string ahead of b shifts b's indices, so b gets a new object.
  const shifted = tabulateStrings({ nodes: [node('c', ['lava']), a, b] });
  assert.deepEqual(shifted.nodes[2].refs, [2, 1]);
  assert.notEqual(shifted.nodes[2], first.nodes[1]);
  const again = tabulateStrings({ nodes: [a, b] });
  assert.deepEqual(again.nodes[1].refs, [1, 0]);
});

test('restoring reads only numbers the table names, and passes the rest through', () => {
  const plain = { nodes: [node('a', ['grass'])] };
  assert.equal(restoreStrings(plain), plain, 'a save with no table loads as it is');
  const save = {
    strings: ['grass'],
    nodes: [node('a', [0, 1, -1, 'lava', [0, 0], [0, [0, 2]], [0, null]]), { id: 'p' }],
  };
  const back = restoreStrings(save);
  assert.deepEqual(back.nodes[0].refs, [
    'grass',
    1,
    -1,
    'lava',
    ['grass', 'grass'],
    ['grass', ['grass', 2]],
    ['grass', null],
  ]);
  assert.equal(back.nodes[1], save.nodes[1]);
  assert.deepEqual(restoreStrings({ strings: [], nodes: 'x' }), { nodes: 'x' });
});

test('a save round trips through the table and stays stable', () => {
  const campaign = buildExampleCampaign(new TilePalette());
  const json = serialize(buildState(campaign));
  const parsed = JSON.parse(json);
  assert.ok(parsed.strings.length > 50, 'the example campaign has a string table');
  assert.equal(json.split('"grass"').length - 1, 1, 'each string is stated once');
  const loaded = deserialize(json);
  const again = serialize(loaded);
  assert.deepEqual(JSON.parse(again), parsed, 'a reload saves the same table and palettes');
  assert.equal(
    serialize(deserialize(again)),
    again,
    'an unchanged campaign saves to the same string',
  );
  for (const live of campaign.grid.nodes.values()) {
    const back = loaded.nodes.find((n) => n.id === live.id);
    assert.deepEqual(
      back?.tiles.map((t) => [t.id, t.imageRef, t.overlayRef]),
      live.tiles.map((t) => [t.id, t.imageRef, t.overlayRef]),
    );
  }
});

test('an asset key in the table still counts as a reference', () => {
  const grid = new TileGrid();
  const payload = `data:image/svg+xml;base64,${'C'.repeat(64)}`;
  grid.addNode(withNodeTiles(createMapNode('w', 'W', null, 1, 1), [createTile('0,0', payload)]));
  const json = serialize(buildState({ grid }));
  const parsed = JSON.parse(json);
  const key = parsed.strings.find((/** @type {string} */ s) => s.startsWith('asset:'));
  assert.ok(key, 'the hoisted ref is a table string');
  assert.ok(referencedAssetKeys(json).has(key.slice('asset:'.length)));
  assert.equal(deserialize(json).nodes[0].tiles[0].imageRef, payload);
});
