import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { createTile } from '../src/map/TileGrid.js';
import { tileIdAt } from '../src/map/MapGeometry.js';
import { BIOME_TERRAIN } from '../src/map/GeneratorTerrain.js';
import { guidedField, guideSize, paintedMask, terrainGuide } from '../src/map/GeneratorGuide.js';
import { wildTerrain } from '../src/map/GeneratorGround.js';
import { generateWilds } from '../src/map/GeneratorWilds.js';
import { generateNodeTiles } from '../src/map/MapGenerator.js';
import { traceRivers } from '../src/map/GeneratorRivers.js';
import { ArmNetwork } from '../src/map/Autotile.js';
import { mulberry32 } from '../src/util/Rng.js';

/** @typedef {import('../src/types/map.js').TerrainGuide} TerrainGuide */

const palette = new TilePalette();

/** The art of a biome. @param {string} biome */
const art = (biome) => palette.variantAt(biome, 0, 0, () => 0).imageRef;

/**
 * A guide from rows of letters, one letter per cell. Upper case is in the
 * block. `.` is grass, `f` forest, `~` water, `M` mountain, `h` hills, `s`
 * snow, `d` desert, and `?` a cell with no known biome.
 * @param {string[]} rows @param {string[]} [rivers]
 * @returns {TerrainGuide}
 */
function guideOf(rows, rivers) {
  /** @type {Record<string, string | null>} */
  const biome = {
    '.': 'grass',
    f: 'forest',
    '~': 'water',
    m: 'mountain',
    h: 'hills',
    s: 'snow',
    d: 'desert',
    '?': null,
  };
  const cells = rows.join('').split('');
  return {
    width: rows[0].length,
    height: rows.length,
    biomes: cells.map((c) => biome[c.toLowerCase()]),
    rivers: rivers ? rivers.join(',').split(',') : cells.map(() => ''),
    block: cells.map((c) => c !== c.toLowerCase() || c === '?'),
  };
}

/** The share of `cells` in a rectangle whose class is `type`. */
function share(
  /** @type {string[]} */ cells,
  /** @type {number} */ size,
  /** @type {[number, number, number, number]} */ [x0, y0, x1, y1],
  /** @type {string} */ type,
) {
  let hit = 0;
  let all = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      all++;
      if (cells[y * size + x] === type) hit++;
    }
  }
  return hit / all;
}

test('a guide reads the biome, the river, and the block of each cell of the box', () => {
  const river = palette.getRiverPiece('h')?.imageRef;
  const bridge = palette.getRiverPiece('bridge-h')?.imageRef;
  const tee = palette.getRiverPiece('tee-n')?.imageRef;
  assert.ok(river && bridge && tee);
  const tiles = [
    createTile('4,7', art('forest'), { overlayRef: river }),
    createTile('5,7', art('water')),
    createTile('6,7', 'data:image/png;base64,AAAA'),
    createTile('4,8', art('snow-hills'), { overlayRef: ['coast-n', bridge] }),
    createTile('5,8', art('grass'), { overlayRef: tee }),
    createTile('9,9', art('desert')),
  ];
  const guide = terrainGuide(tiles, ['4,7', '6,7', '5,8']);
  assert.deepEqual(guide, {
    width: 3,
    height: 2,
    biomes: ['forest', 'water', null, 'snow-hills', 'grass', null],
    rivers: ['ew', '', '', 'ns', 'new', ''],
    block: [true, false, true, false, true, false],
  });
});

test('a guided map is at least half again as wide as its block', () => {
  const size = (/** @type {number} */ w, /** @type {number} */ h) =>
    guideSize({ width: w, height: h, biomes: [], rivers: [], block: [] });
  assert.equal(size(1, 1), 'small');
  assert.equal(size(9, 14), 'large');
  assert.equal(size(16, 12), 'huge');
  assert.equal(size(25, 20), 'vast');
  assert.equal(size(60, 60), 'vast', 'the largest preset caps the size');
});

test('a guided field puts the land, the sea, and the range where the guide has them', () => {
  const guide = guideOf(['~~...', '~~.M.', '~~...']);
  const size = 22;
  const { field } = guidedField(size, guide, mulberry32(4));
  const { cells } = field;
  assert.ok(share(cells, size, [0, 0, 6, size], 'water') > 0.9, 'the west is sea');
  assert.ok(share(cells, size, [12, 0, size, size], 'water') < 0.05, 'the east is land');
  const mid = Math.round((3 * (size - 1)) / 4);
  const peak = cells[Math.round((size - 1) / 2) * size + mid];
  assert.equal(peak, 'mountain', 'the range stands on the point of its parent cell');
  assert.ok(share(cells, size, [0, 0, size, size], 'hills') > 0, 'foothills ring the range');
  assert.deepEqual(guidedField(size, guide, mulberry32(4)).field.biomes, field.biomes);
});

test('a guided field keeps the climate of a lowland beside a range', () => {
  const size = 22;
  const snowy = guidedField(size, guideOf(['sss', 'shs', 'sss']), mulberry32(1)).field;
  assert.equal(snowy.biomes[11 * size + 11], 'hills', 'the parent hills keep their biome');
  assert.ok(snowy.biomes.filter((b) => b === 'snow').length > size * 4, 'snow around it');
  const dry = guidedField(size, guideOf(['ddd', 'ddd', 'ddd']), mulberry32(1)).field;
  assert.ok(dry.cells.every((c) => c === 'desert' || c === 'hills' || c === 'mountain'));
  const odd = guidedField(size, guideOf(['???', '???']), mulberry32(1)).field;
  assert.ok(
    odd.cells.every((c) => BIOME_TERRAIN[c] || c),
    'an unknown parent is lowland',
  );
  assert.ok(share(odd.cells, size, [0, 0, size, size], 'water') < 0.05);
});

test('a guided field draws the rivers of its guide at its own scale', () => {
  const guide = guideOf(
    ['.....', 'mmmmm', '.....'],
    ['', '', '', '', '', 'ew', 'ew', 'ew', 'ew', 'ew', '', '', '', '', ''],
  );
  const size = 14;
  const { field, rivers } = guidedField(size, guide, mulberry32(2));
  const row = Math.round((size - 1) / 2);
  for (let x = 0; x < size; x++) {
    assert.ok(rivers.has(x, row), `the river runs through ${x},${row}`);
    assert.notEqual(field.cells[row * size + x], 'mountain', 'no river crosses a mountain');
    assert.notEqual(field.cells[row * size + x], 'water');
  }
  assert.ok(rivers.at(0, row).has('w') && rivers.at(size - 1, row).has('e'), 'it leaves the map');
  const one = guideOf(['F'], ['ns']);
  const small = guidedField(8, one, mulberry32(2)).rivers;
  assert.ok(small.at(3, 0).has('n') && small.at(3, 7).has('s'), 'a one-cell block spans the map');
});

test('a guided river that drains into the sea ends in water', () => {
  const guide = guideOf(['..~~', '..~~'], ['', 'e', '', '', '', '', '', '']);
  const size = 14;
  const { field, rivers } = guidedField(size, guide, mulberry32(3));
  const drained = [...rivers.arms.entries()].some(([id, arms]) => {
    const [x, y] = id.split(',').map(Number);
    return arms.has('e') && field.elevation[y * size + x + 1] < field.lines.sea;
  });
  assert.ok(drained, 'the head points into a water cell');
});

test('a painted mask takes the outline of the block, with its coastal sea', () => {
  // An L of land, sea to the east, and a neighbor's land in the corner.
  const guide = guideOf(['FF..~', 'FF..~', 'FFFF~', 'FFFF~']);
  const size = 10;
  const near = Int32Array.from({ length: size * size }, (_, i) => {
    const gx = Math.min(4, Math.floor(((i % size) * 5) / size));
    const gy = Math.min(3, Math.floor((Math.floor(i / size) * 4) / size));
    return gy * 5 + gx;
  });
  const painted = paintedMask(size, guide, near);
  const at = (/** @type {number} */ x, /** @type {number} */ y) => painted[y * size + x];
  assert.equal(at(0, 0), 1, 'the block is painted');
  assert.equal(at(6, 0), 0, 'the land of a neighbor is blank');
  assert.equal(at(9, 9), 1, 'the sea beside the block is painted');
  assert.equal(at(9, 0), 0, 'the sea beside only the neighbor is blank');
});

test('a painted mask drops a speck and fills a pit', () => {
  const guide = guideOf(['F.F', '...', 'FFF']);
  guide.block[1 * 3 + 1] = false;
  const size = 3;
  // Each cell maps to its own parent cell, so the mask is the block itself.
  const near = Int32Array.from({ length: 9 }, (_, i) => i);
  const painted = [...paintedMask(size, guide, near)];
  assert.deepEqual(painted, [0, 0, 0, 0, 0, 0, 1, 1, 1], 'the largest area stays');
  const ring = guideOf(['FFF', 'F.F', 'FFF']);
  assert.deepEqual([...paintedMask(3, ring, near)], [1, 1, 1, 1, 1, 1, 1, 1, 1], 'a pit fills');
});

test('a guided wild map has no tile, site, or road outside its outline', () => {
  const guide = guideOf(['FFFF....', 'FFFFF...', 'FFFFFF..', 'FFFFFFF.', 'FFFFFFFF', '~~FFFFFF']);
  for (const seed of [1, 2, 3]) {
    const map = generateWilds(palette, 22, mulberry32(seed), 'wilderness', guide);
    const ids = new Set(map.tiles.map((t) => t.id));
    assert.ok(map.tiles.length < 22 * 22, `seed ${seed}: the map has blank cells`);
    assert.ok(!ids.has(tileIdAt(21, 0)), 'the neighbor corner is blank');
    assert.ok(ids.has(map.entry), `seed ${seed}: the entry is painted`);
    for (const site of map.sites) {
      for (const id of site.tileIds) assert.ok(ids.has(id), `seed ${seed}: site ${id}`);
    }
  }
  const terrain = wildTerrain(22, 'wilderness', mulberry32(1), guide);
  assert.ok(terrain.painted, 'a guided terrain has a mask');
  assert.equal(wildTerrain(22, 'wilderness', mulberry32(1)).painted, undefined);
});

test('generateNodeTiles passes the guide to an open archetype only', () => {
  const guide = guideOf(['...', '.F.', '...']);
  const wild = generateNodeTiles(
    palette,
    { archetype: 'wetlands', size: 'small', guide },
    mulberry32(1),
  );
  assert.ok(wild.tiles.length < 64, 'the wild map follows the guide');
  const town = generateNodeTiles(
    palette,
    { archetype: 'town', size: 'small', guide },
    mulberry32(1),
  );
  assert.equal(town.tiles.length, 64, 'a town ignores it');
});

test('traced rivers join the rivers already on the map', () => {
  const size = 12;
  const elevation = Float64Array.from({ length: size * size }, (_, i) => 1 - (i % size) / size);
  const cells = Array.from({ length: size * size }, (_, i) => (i % size < 2 ? 'hills' : 'grass'));
  const network = new ArmNetwork();
  network.join(5, 0, 's');
  const out = traceRivers({ size, elevation, cells }, 2, mulberry32(1), network);
  assert.equal(out.network, network, 'the tracer adds to the network it is given');
  assert.ok(network.has(5, 1));
});
