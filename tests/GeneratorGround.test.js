import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { overlayList } from '../src/map/TileGrid.js';
import { ArmNetwork } from '../src/map/Autotile.js';
import {
  chebyshev,
  largestLand,
  southLanding,
  terrainTiles,
  wildTerrain,
} from '../src/map/GeneratorGround.js';
import { generateNodeTiles } from '../src/map/MapGenerator.js';
import { mulberry32 } from '../src/util/Rng.js';

const palette = new TilePalette();

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
  const sea = wildTerrain(32, 'island', mulberry32(2));
  const island = terrainTiles(palette, sea, mulberry32(2));
  assert.ok(island.some((t) => t.imageRef.includes('/deep-water/')));
});

test('southLanding picks the land nearest the middle of the south border', () => {
  const size = 5;
  const sea = new Array(size * size).fill('water');
  assert.equal(southLanding(sea, size), '2,4', 'no land: the middle of the border');
  const shore = [...sea];
  shore[4 * size + 2] = 'grass';
  assert.equal(southLanding(shore, size), '2,4', 'land on the border middle');
  const bay = [...sea];
  bay[3 * size + 2] = 'grass';
  bay[4 * size + 0] = 'grass';
  // One row up counts as two columns across, so the tie keeps the first.
  assert.equal(southLanding(bay, size), '2,3');
  bay[4 * size + 1] = 'grass';
  assert.equal(southLanding(bay, size), '1,4', 'one column across beats one row up');
  assert.equal(
    southLanding(bay, size, (i) => i === 4 * size + 1),
    '0,4',
    'a skipped cell gives the entry to the next cell of the mass',
  );
  assert.equal(
    southLanding(bay, size, (i) => i >= 4 * size),
    '2,3',
    'a mass with every cell skipped gives the entry to another mass',
  );
});

test('largestLand finds the land mass with the most cells', () => {
  const size = 4;
  const cells = ['grass', 'water', 'grass', 'grass', 'water', 'water', 'water', 'grass'];
  cells.push(...new Array(8).fill('water'));
  assert.deepEqual([...largestLand(cells, size)].sort(), [2, 3, 7]);
  assert.equal(largestLand(new Array(16).fill('water'), size).size, 0);
});

test('an island enters on its main land mass, not on an islet by the south shore', () => {
  // Island huge seed 758 has a small islet nearer the south border than the
  // main island.
  const size = 32;
  const gen = generateNodeTiles(palette, { archetype: 'island', size: 'huge' }, mulberry32(758));
  const { cells } = wildTerrain(size, 'island', mulberry32(758));
  const [ex, ey] = gen.entry.split(',').map(Number);
  const reach = new Set([ey * size + ex]);
  const queue = [ey * size + ex];
  while (queue.length) {
    const i = /** @type {number} */ (queue.pop());
    const [x, y] = [i % size, Math.floor(i / size)];
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const j = ny * size + nx;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || reach.has(j)) continue;
      if (cells[j] === 'water') continue;
      reach.add(j);
      queue.push(j);
    }
  }
  assert.ok(reach.size > 400, `the entry reaches ${reach.size} cells`);
  const towns = gen.sites.filter((s) => s.archetype === 'town');
  assert.equal(towns.length, 3);
  for (const town of towns) {
    const [x, y] = town.tileIds[0].split(',').map(Number);
    assert.ok(reach.has(y * size + x), `${town.label} reached`);
  }
});

test('chebyshev counts king moves between two cells', () => {
  assert.equal(chebyshev(0, 0, 0, 0), 0);
  assert.equal(chebyshev(1, 1, 4, 2), 3);
  assert.equal(chebyshev(5, 0, 3, 6), 6);
});
