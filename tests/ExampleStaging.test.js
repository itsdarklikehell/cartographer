import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IdPool,
  besideTile,
  expandSites,
  isBareFloor,
  isOpenGround,
  isStandable,
  makeSpotPicker,
  noteTile,
  reachableFrom,
  stampMarker,
  tileDistance,
} from '../src/campaign/ExampleStaging.js';
import { REGION_STAGES, stackOf } from '../src/campaign/ExampleRegions.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { createTile } from '../src/map/TileGrid.js';
import { interiorArt } from '../src/map/TileKinds.js';
import { generateNodeTiles } from '../src/map/MapGenerator.js';
import { mulberry32 } from '../src/util/Rng.js';

const palette = new TilePalette();
const grass = /** @type {any} */ (palette.get('grass-1')).imageRef;
const water = /** @type {any} */ (palette.get('water-1')).imageRef;

/** A small open map of grass, with its entry in the top-left corner. */
function field(size = 6) {
  const tiles = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) tiles.push(createTile(`${x},${y}`, grass));
  }
  return { width: size, height: size, tiles, entry: '0,0', sites: [] };
}

test('IdPool hands out numbered ids that skip taken ones, and refuses a taken fixed id', () => {
  const ids = new IdPool();
  ids.take('vale-1');
  assert.equal(ids.next('vale'), 'vale-2');
  assert.equal(ids.next('vale'), 'vale-3');
  assert.throws(() => ids.take('vale-2'), /already taken/);
});

test('makeSpotPicker picks far from the entry, keeps its gap, and falls back to the entry', () => {
  const gen = field();
  const pick = makeSpotPicker(gen, () => true, { gap: 4 });
  assert.equal(pick(), '5,5');
  const second = pick();
  assert.ok(tileDistance(second, '5,5') >= 4, second);
  const none = makeSpotPicker(gen, () => false);
  assert.equal(none(), '0,0');
});

test('makeSpotPicker can pick nearest first, keep off the border, and reuse spots once spaced out', () => {
  const gen = field();
  const near = makeSpotPicker(gen, () => true, { from: '3,3', near: true, gap: 1 });
  assert.equal(near(), '3,3');
  const inner = makeSpotPicker(gen, () => true, { margin: 2 });
  const picks = [inner(), inner(), inner(), inner(), inner()];
  for (const id of picks.slice(0, 4)) {
    const [x, y] = id.split(',').map(Number);
    assert.ok(x >= 2 && y >= 2 && x <= 3 && y <= 3, id);
  }
  assert.equal(picks[4], '0,0', 'the four inner tiles are used up');
  const one = { tiles: [createTile('1,1', grass)], entry: '1,1' };
  const crowded = makeSpotPicker(one, () => true, { gap: 9 });
  assert.equal(crowded(), '1,1');
  assert.equal(crowded(), '1,1', 'no unused candidate is left');
});

test('isStandable and isOpenGround refuse water, links, markers, and spans', () => {
  assert.equal(isStandable(createTile('0,0', grass)), true);
  assert.equal(isStandable(createTile('0,0', water)), false);
  assert.equal(isStandable(createTile('0,0', grass, { childNodeId: 'x' })), false);
  assert.equal(isStandable({ ...createTile('0,0', grass), span: 2 }), false);
  const marked = createTile('0,0', grass);
  marked.metadata = { ...marked.metadata, poiType: 'landmark' };
  assert.equal(isOpenGround(marked), false);
  assert.equal(isOpenGround(createTile('0,0', grass)), true);
});

test('besideTile finds a standable neighbor, else the entry', () => {
  const gen = field(3);
  gen.tiles = gen.tiles.map((t) => (t.id === '1,1' ? t : { ...t, imageRef: water }));
  assert.equal(besideTile(gen, '1,1'), '0,0');
  const open = field(3);
  assert.notEqual(besideTile(open, '1,1'), '1,1');
});

test('reachableFrom walks side steps around walls, and isBareFloor refuses furnishings', () => {
  // A wall column at x = 1 seals off the right side of a 3x3 room.
  const rows = ['.#.', '.#.', '.#.'];
  const tiles = rows.flatMap((row, y) =>
    [...row].map((c, x) => createTile(`${x},${y}`, interiorArt(c === '#' ? 'wall-v' : 'floor-1'))),
  );
  const reach = reachableFrom({ tiles }, '0,0');
  assert.deepEqual([...reach].sort(), ['0,0', '0,1', '0,2']);
  const floor = createTile('0,0', interiorArt('floor-1'));
  assert.ok(isBareFloor(floor));
  assert.ok(!isBareFloor({ ...floor, overlayRef: interiorArt('altar') }));
  assert.ok(!isBareFloor(tiles[1]));
});

test('stampMarker and noteTile change the named tile and ignore a missing one', () => {
  const gen = field(2);
  stampMarker(gen, palette, '1,1', 'camp', 'a camp');
  const camp = /** @type {any} */ (gen.tiles.find((t) => t.id === '1,1'));
  assert.equal(camp.metadata.poiType, 'landmark');
  assert.equal(camp.metadata.notes, 'a camp');
  stampMarker(gen, palette, '9,9', 'camp', '');
  stampMarker(gen, palette, '0,0', 'no-such-art', '');
  assert.equal(gen.tiles[0].imageRef, grass);
  noteTile(gen, '0,0', 'here');
  noteTile(gen, '9,9', 'nowhere');
  assert.equal(gen.tiles[0].metadata.notes, 'here');
});

test('expandSites builds each site with its override or a generated name, and links its tiles', () => {
  const gen = generateNodeTiles(palette, { archetype: 'wilderness', size: 'large' }, mulberry32(3));
  const dungeon = gen.sites.findIndex((s) => s.archetype === 'dungeon');
  const ids = new IdPool();
  ids.take('wild');
  const overrides = new Map([[dungeon, { id: 'crypt', name: 'The Crypt', levels: 2 }]]);
  const { nodes, childIds } = expandSites(palette, { id: 'wild', gen, seed: 3 }, overrides, ids);
  assert.equal(childIds.length, gen.sites.length);
  assert.equal(childIds[dungeon], 'crypt');
  const crypt = /** @type {any} */ (nodes.find((n) => n.id === 'crypt'));
  assert.equal(crypt.name, 'The Crypt');
  assert.equal(crypt.parentId, 'wild');
  assert.ok(nodes.some((n) => n.parentId === 'crypt' && n.name === 'The Crypt (level 2)'));
  gen.sites.forEach((site, i) => {
    for (const id of site.tileIds) {
      assert.equal(gen.tiles.find((t) => t.id === id)?.childNodeId, childIds[i]);
    }
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const node = (/** @type {string} */ id) => /** @type {any} */ (byId.get(id));
  assert.equal(stackOf(node('crypt'), node).length, 2);
});

test('each region stage still places its story on a map that lacks every place it wants', () => {
  for (const [regionId, stageFn] of Object.entries(REGION_STAGES)) {
    const gen = generateNodeTiles(palette, { archetype: 'desert', size: 'medium' }, mulberry32(5));
    gen.sites = [];
    // Scrub the landmarks too, so every lookup falls back to a stamp.
    for (const t of gen.tiles)
      if (t.metadata.poiType) t.metadata = { ...t.metadata, poiType: null };
    /** @type {Record<string, { nodeId: string, tileId: string }>} */
    const places = {};
    /** @type {import('../src/campaign/ExampleWorld.js').RegionStage} */
    const stage = { regionId, gen, palette, overrides: new Map(), places, after: [] };
    stageFn(stage);
    const ids = new IdPool();
    ids.take(regionId);
    const { nodes } = expandSites(palette, { id: regionId, gen, seed: 5 }, stage.overrides, ids);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const fn of stage.after) fn((id) => /** @type {any} */ (byId.get(id)));
    const known = new Set([regionId, ...byId.keys()]);
    for (const [name, place] of Object.entries(places)) {
      assert.ok(known.has(place.nodeId), `${regionId}: ${name} in ${place.nodeId}`);
      assert.ok(place.tileId, `${regionId}: ${name} has a tile`);
    }
  }
});

test('the town stage puts its people at the town entry when a building is missing', () => {
  const gen = generateNodeTiles(palette, { archetype: 'wilderness', size: 'large' }, mulberry32(3));
  /** @type {Record<string, { nodeId: string, tileId: string }>} */
  const places = {};
  const stage = {
    regionId: 'briarwick-vale',
    gen,
    palette,
    overrides: new Map(),
    places,
    after: [],
  };
  REGION_STAGES['briarwick-vale'](/** @type {any} */ (stage));
  const bare = { ...field(), id: 'briarwick', parentId: 'briarwick-vale', entry: '2,5' };
  bare.tiles = bare.tiles.map((t) =>
    t.id === '2,2' ? { ...t, imageRef: 'assets/tiles/plaza/plaza-1.svg' } : t,
  );
  for (const fn of stage.after) fn(() => /** @type {any} */ (bare));
  assert.deepEqual(places.bram, { nodeId: 'briarwick', tileId: '2,5' });
  assert.deepEqual(places.maera, { nodeId: 'briarwick', tileId: '2,2' });
});
