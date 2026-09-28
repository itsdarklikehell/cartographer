import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { overlayList } from '../src/map/TileGrid.js';
import { ArmNetwork } from '../src/map/Autotile.js';
import {
  fordCrossings,
  generateWilds,
  placeLandmarks,
  terrainTiles,
  wildTerrain,
} from '../src/map/GeneratorWilds.js';
import { mulberry32 } from '../src/util/Rng.js';

const palette = new TilePalette();
const WILDS = ['wilderness', 'highlands', 'frontier', 'desert', 'wetlands', 'island'];
const LANDMARKS = [
  'ruins',
  'camp',
  'standing-stones',
  'mine',
  'cave-entrance',
  'graveyard',
  'watchtower',
  'oasis',
  'lighthouse',
];

test('every climate archetype fills the grid and marks landmarks on open ground', () => {
  const size = 22;
  for (const archetype of WILDS) {
    for (const seed of [1, 2]) {
      const gen = generateWilds(palette, size, mulberry32(seed), archetype);
      const label = `${archetype} ${seed}`;
      assert.equal(gen.tiles.length, size * size, `${label}: fully tiled`);
      const [ex, ey] = gen.entry.split(',').map(Number);
      assert.ok(
        ex === 0 || ey === 0 || ex === size - 1 || ey === size - 1,
        `${label}: border entry`,
      );
      const entryTile = gen.tiles.find((t) => t.id === gen.entry);
      assert.ok(
        gen.entry === `${size / 2},${size - 1}` || /\/road\//.test(String(entryTile?.overlayRef)),
        `${label}: the entry is a road end or the bottom center`,
      );
      const landmarks = gen.tiles.filter(
        (t) => t.metadata.poiType === 'landmark' && !t.imageRef.includes('/castle/'),
      );
      assert.ok(landmarks.length >= 1, `${label}: has landmarks`);
      const spots = landmarks.map((t) => t.id.split(',').map(Number));
      for (const [i, [x, y]] of spots.entries()) {
        assert.ok(x > 0 && y > 0 && x < size - 1 && y < size - 1, `${label}: inner landmark`);
        assert.equal(landmarks[i].overlayRef, null, `${label}: no landmark on a river or shore`);
        for (const [ox, oy] of spots.slice(i + 1)) {
          assert.ok(Math.max(Math.abs(ox - x), Math.abs(oy - y)) >= 3, `${label}: spaced`);
        }
      }
    }
  }
});

test('an unknown archetype falls back to the wilderness profile', () => {
  const a = generateWilds(palette, 8, mulberry32(3), 'nowhere');
  const b = generateWilds(palette, 8, mulberry32(3));
  assert.deepEqual(
    a.tiles.map((t) => t.imageRef),
    b.tiles.map((t) => t.imageRef),
  );
});

test('river overlays connect: every open edge meets river, water, or the map edge', () => {
  const size = 32;
  const edges = {
    v: 'ns',
    h: 'ew',
    cross: 'nesw',
    'tee-n': 'new',
    'tee-e': 'nse',
    'tee-s': 'sew',
    'tee-w': 'nsw',
  };
  const step = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  const back = { n: 's', e: 'w', s: 'n', w: 'e' };
  /** @param {string} kind */
  const opens = (kind) =>
    kind.startsWith('corner-')
      ? kind.slice(7).split('')
      : kind.startsWith('end-')
        ? [kind[4]]
        : edges[kind].split('');
  for (const seed of [1, 5, 9]) {
    const terrain = wildTerrain(size, 'wetlands', mulberry32(seed));
    const pieces = terrain.rivers.pieces();
    assert.ok(pieces.size > 0, `seed ${seed}: wetlands have rivers`);
    for (const [id, kind] of pieces) {
      const [x, y] = id.split(',').map(Number);
      for (const arm of opens(kind)) {
        const [dx, dy] = step[/** @type {'n'} */ (arm)];
        const nx = x + dx;
        const ny = y + dy;
        const off = nx < 0 || ny < 0 || nx >= size || ny >= size;
        const wet = !off && terrain.cells[ny * size + nx] === 'water';
        const other = pieces.get(`${nx},${ny}`);
        const joined = other !== undefined && opens(other).includes(back[/** @type {'n'} */ (arm)]);
        assert.ok(off || wet || joined, `seed ${seed}: ${id} ${kind} arm ${arm}`);
      }
    }
  }
});

test('the coastline keeps to the shapes the coast pieces draw', () => {
  const size = 24;
  for (const archetype of ['island', 'wetlands']) {
    const { cells } = wildTerrain(size, archetype, mulberry32(8));
    /** @param {number} x @param {number} y */
    const wet = (x, y) =>
      x >= 0 && y >= 0 && x < size && y < size && cells[y * size + x] === 'water';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (wet(x, y)) continue;
        const n = wet(x, y - 1);
        const s = wet(x, y + 1);
        const e = wet(x + 1, y);
        const w = wet(x - 1, y);
        assert.ok(!(n && s) && !(e && w), `${archetype}: no isthmus at ${x},${y}`);
      }
    }
  }
});

test('terrain tiles stack the shoreline under the river channel', () => {
  const size = 32;
  let stacked = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const terrain = wildTerrain(size, 'wetlands', mulberry32(seed));
    for (const tile of terrainTiles(palette, terrain, mulberry32(seed))) {
      const refs = overlayList(tile);
      if (refs.length < 2) continue;
      stacked++;
      assert.match(refs[0], /\/coast\//);
      assert.match(refs[1], /\/river\//);
    }
  }
  assert.ok(stacked > 0, 'some river mouth drains through a shoreline');
});

test('a landmark falls back to non-grass open ground when no grass is free', () => {
  const size = 8;
  const terrain = wildTerrain(size, 'desert', mulberry32(2));
  terrain.cells.fill('desert');
  const tiles = terrainTiles(palette, terrain, mulberry32(2));
  const placed = placeLandmarks(palette, terrain, tiles, 1, mulberry32(2));
  assert.equal(placed.length, 1);
});

test('landmark placement stops when no free cell is left', () => {
  const size = 5;
  const terrain = wildTerrain(size, 'wilderness', mulberry32(2));
  terrain.cells.fill('water');
  const tiles = terrainTiles(palette, terrain, mulberry32(2));
  assert.deepEqual(placeLandmarks(palette, terrain, tiles, 3, mulberry32(2)), []);
});

test('a landmark with no marker art in the palette is skipped', () => {
  const bare = new TilePalette();
  for (const type of LANDMARKS) bare.entries.delete(type);
  const terrain = wildTerrain(14, 'wilderness', mulberry32(4));
  const tiles = terrainTiles(bare, terrain, mulberry32(4));
  assert.deepEqual(placeLandmarks(bare, terrain, tiles, 2, mulberry32(4)), []);
});

test('a site with no marker art keeps its terrain tile', () => {
  const bare = new TilePalette();
  for (const type of ['settlement', 'port', 'castle', 'dungeon']) bare.entries.delete(type);
  const gen = generateWilds(bare, 22, mulberry32(6));
  assert.ok(gen.sites.length > 0);
  for (const site of gen.sites) {
    const tile = gen.tiles.find((t) => t.id === site.tileId);
    assert.ok(
      !tile?.imageRef.includes(`/${site.marker}/`),
      `${site.tileId} shows no ${site.marker}`,
    );
  }
});

/**
 * A plain grass terrain of the given size with no rivers or roads.
 * @param {number} size
 * @returns {import('../src/map/GeneratorWilds.js').WildTerrain}
 */
function meadow(size) {
  return {
    size,
    cells: new Array(size * size).fill('grass'),
    biomes: new Array(size * size).fill('grass'),
    elevation: new Float64Array(size * size),
    rivers: new ArmNetwork(),
    roads: new ArmNetwork(),
  };
}

test('tiles draw each biome, or the class where a later step changed the cell', () => {
  const terrain = meadow(6);
  terrain.biomes.fill('savanna');
  terrain.cells[0] = 'farmland';
  const tiles = terrainTiles(palette, terrain, mulberry32(1));
  assert.match(tiles[0].imageRef, /\/farmland\//);
  assert.ok(tiles.slice(1).every((t) => t.imageRef.includes('/savanna/')));
  const town = terrainTiles(palette, { ...terrain, biomes: undefined }, mulberry32(1));
  assert.ok(
    town.slice(1).every((t) => t.imageRef.includes('/grass/')),
    'no biomes, no biome art',
  );
  const island = generateWilds(palette, 32, mulberry32(2), 'island');
  assert.ok(island.tiles.some((t) => t.imageRef.includes('/deep-water/')));
});

test('a road crossing far from every town draws as a ford', () => {
  const size = 16;
  const terrain = meadow(size);
  for (let y = 0; y < size - 1; y++) terrain.rivers.join(8, y, 's');
  for (let x = 0; x < size - 1; x++) terrain.roads.join(x, 8, 'e');
  const town = { x: 6, y: 8, tileId: '6,8', marker: 'settlement', poi: 'settlement' };
  const near = [{ ...town, archetype: 'town' }];
  assert.deepEqual([...fordCrossings(terrain, near)], []);
  assert.deepEqual([...fordCrossings(terrain, [{ ...near[0], archetype: 'castle' }])], ['8,8']);
  const fords = fordCrossings(terrain, []);
  const tiles = terrainTiles(palette, { ...terrain, fords }, mulberry32(1));
  const crossing = tiles.find((t) => t.id === '8,8');
  assert.equal(crossing?.overlayRef, 'assets/tiles/river/river-ford-h.svg');
  const bridged = terrainTiles(palette, terrain, mulberry32(1)).find((t) => t.id === '8,8');
  assert.equal(bridged?.overlayRef, 'assets/tiles/river/river-bridge-h.svg');
});

test('an oasis needs desert, a lighthouse open water, and a watchtower likes a road', () => {
  /** @param {string} keep */
  const only = (keep) => {
    const p = new TilePalette();
    for (const type of LANDMARKS) if (type !== keep) p.entries.delete(type);
    return p;
  };
  const size = 12;
  /** @param {TilePalette} p @param {ReturnType<typeof meadow>} terrain */
  const place = (p, terrain) => {
    const tiles = terrainTiles(p, terrain, mulberry32(3));
    return placeLandmarks(p, terrain, tiles, 1, mulberry32(3));
  };
  const oasis = only('oasis');
  assert.deepEqual(place(oasis, meadow(size)), [], 'no oasis on grass');
  const dunes = meadow(size);
  dunes.cells[5 * size + 5] = 'desert';
  assert.deepEqual(place(oasis, dunes), ['5,5']);

  const lighthouse = only('lighthouse');
  assert.deepEqual(place(lighthouse, meadow(size)), [], 'no lighthouse inland');
  const bay = meadow(size);
  for (let y = 0; y < size; y++) for (let x = 0; x < 3; x++) bay.cells[y * size + x] = 'water';
  const [spot] = place(lighthouse, bay);
  assert.equal(Number(spot.split(',')[0]), 4, 'two cells from the water, clear of the shore');

  const tower = only('watchtower');
  const road = meadow(size);
  for (let x = 0; x < size - 1; x++) road.roads.join(x, 6, 'e');
  const [at] = place(tower, road);
  assert.equal(Math.abs(Number(at.split(',')[1]) - 6), 1, 'beside the road');
});
