import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { ArmNetwork } from '../src/map/Autotile.js';
import { fordCrossings, generateWilds, placeLandmarks } from '../src/map/GeneratorWilds.js';
import { terrainTiles, wildTerrain } from '../src/map/GeneratorGround.js';
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
      const entryTile = /** @type {import('../src/types/map.js').Tile} */ (
        gen.tiles.find((t) => t.id === gen.entry)
      );
      if (/\/road\//.test(String(entryTile.overlayRef))) {
        assert.ok(
          ex === 0 || ey === 0 || ex === size - 1 || ey === size - 1,
          `${label}: a road entry is on the border`,
        );
      } else {
        // With no road off the map, the entry is land with no marker.
        assert.doesNotMatch(entryTile.imageRef, /water\//, `${label}: the entry is land`);
        assert.equal(entryTile.metadata.poiType, null, `${label}: no marker on the entry`);
      }
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

test('a map with no road off it enters on land, never in the sea', () => {
  /** @param {string} archetype @param {number} size @param {number} seed */
  const entryCell = (archetype, size, seed) => {
    const gen = generateWilds(palette, size, mulberry32(seed), archetype);
    const tile = gen.tiles.find((t) => t.id === gen.entry);
    return String(tile?.imageRef);
  };
  // Wetlands small seed 5 has water at the middle of its south border.
  assert.doesNotMatch(entryCell('wetlands', 8, 5), /water\//);
  for (const size of [8, 14, 22, 32]) {
    for (let seed = 0; seed < 8; seed++) {
      assert.doesNotMatch(entryCell('island', size, seed), /water\//, `island ${size} ${seed}`);
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

test('a site with no marker art keeps its terrain tile and opens no sub-map', () => {
  const bare = new TilePalette();
  const gone = ['settlement', 'port', 'castle', 'dungeon'];
  for (const type of gone) bare.entries.delete(type);
  const full = generateWilds(palette, 22, mulberry32(6));
  assert.ok(full.sites.some((s) => gone.includes(s.label)));
  const gen = generateWilds(bare, 22, mulberry32(6));
  for (const site of gen.sites) {
    assert.ok(!gone.includes(site.label), `${site.label} opens no sub-map`);
    const tile = gen.tiles.find((t) => t.id === site.tileIds[0]);
    assert.ok(tile?.imageRef.includes(`/${site.label}/`), `${site.label} draws its marker`);
  }
});

/**
 * A plain grass terrain of the given size with no rivers or roads.
 * @param {number} size
 * @returns {import('../src/map/GeneratorGround.js').WildTerrain}
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
