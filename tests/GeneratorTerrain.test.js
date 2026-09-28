import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { TilePalette } from '../src/map/TilePalette.js';
import { fbm, quantile, stretch, valueNoise } from '../src/map/GeneratorNoise.js';
import {
  BIOME_ART,
  classifyBiome,
  TERRAIN_PROFILES,
  terrainField,
} from '../src/map/GeneratorTerrain.js';
import { mulberry32 } from '../src/util/Rng.js';

test('valueNoise is seeded, bounded, and smooth between lattice points', () => {
  const a = valueNoise(mulberry32(5));
  const b = valueNoise(mulberry32(5));
  for (let i = 0; i < 50; i++) {
    const x = i * 0.37;
    const y = i * 0.61;
    assert.equal(a(x, y), b(x, y), 'the same seed gives the same field');
    assert.ok(a(x, y) >= 0 && a(x, y) < 1);
    // A small step moves the value a small amount: no per-sample noise.
    assert.ok(Math.abs(a(x, y) - a(x + 0.01, y)) < 0.05);
  }
  // Negative coordinates wrap onto the lattice instead of reading undefined.
  assert.ok(Number.isFinite(a(-3.2, -7.9)));
});

test('fbm stays inside [0, 1) for any octave count', () => {
  const noise = valueNoise(mulberry32(9));
  for (const octaves of [1, 3, 6]) {
    for (let i = 0; i < 40; i++) {
      const v = fbm(noise, i * 0.3, i * 0.7, octaves);
      assert.ok(v >= 0 && v < 1, `octaves ${octaves}: ${v}`);
    }
  }
  assert.ok(Number.isFinite(fbm(noise, 1.5, 2.5)), 'the octave count defaults');
});

test('stretch spans 0..1 and flattens a constant field to zeros', () => {
  assert.deepEqual([...stretch(Float64Array.from([2, 4, 3]))], [0, 1, 0.5]);
  assert.deepEqual([...stretch(Float64Array.from([7, 7]))], [0, 0]);
});

test('quantile returns the value under which the fraction lies', () => {
  const field = Float64Array.from([5, 1, 4, 2, 3]);
  assert.equal(quantile(field, 0.4), 3);
  assert.equal(quantile(field, 0), -Infinity, 'nothing lies below a zero fraction');
  assert.equal(quantile(field, 1), Infinity, 'everything lies below a whole fraction');
});

test('classifyBiome follows elevation, then temperature, then moisture', () => {
  const lines = { deep: 0.1, sea: 0.2, hill: 0.7, mountain: 0.85 };
  assert.equal(classifyBiome(0.05, 0.5, 0.5, lines), 'deep-water');
  assert.equal(classifyBiome(0.15, 0.5, 0.5, lines), 'water');
  assert.equal(classifyBiome(0.9, 0.2, 0.9, lines), 'volcanic');
  assert.equal(classifyBiome(0.9, 0.5, 0.2, lines), 'snow-mountain');
  assert.equal(classifyBiome(0.9, 0.5, 0.5, lines), 'mountain');
  assert.equal(classifyBiome(0.75, 0.5, 0.2, lines), 'snow-hills');
  assert.equal(classifyBiome(0.75, 0.2, 0.8, lines), 'badlands');
  assert.equal(classifyBiome(0.75, 0.5, 0.5, lines), 'hills');
  assert.equal(classifyBiome(0.4, 0.5, 0.02, lines), 'glacier');
  assert.equal(classifyBiome(0.4, 0.6, 0.2, lines), 'taiga');
  assert.equal(classifyBiome(0.4, 0.3, 0.2, lines), 'snow');
  assert.equal(classifyBiome(0.25, 0.8, 0.5, lines), 'swamp');
  assert.equal(classifyBiome(0.4, 0.2, 0.8, lines), 'desert');
  assert.equal(classifyBiome(0.4, 0.7, 0.8, lines), 'jungle');
  assert.equal(classifyBiome(0.4, 0.5, 0.8, lines), 'savanna');
  assert.equal(classifyBiome(0.4, 0.6, 0.5, lines), 'forest');
  assert.equal(classifyBiome(0.4, 0.4, 0.5, lines), 'grass');
  // With no water line at all, swamp still keys off the lowest ground.
  const dry = { deep: -Infinity, sea: -Infinity, hill: 0.7, mountain: 0.85 };
  assert.equal(classifyBiome(0.05, 0.8, 0.5, dry), 'swamp');
});

test('every biome draws as a terrain type the palette has', () => {
  const drawn = new Set([
    'water',
    'grass',
    'forest',
    'swamp',
    'desert',
    'hills',
    'mountain',
    'snow',
  ]);
  for (const [biome, art] of Object.entries(BIOME_ART)) {
    assert.ok(drawn.has(art), `${biome} draws as ${art}`);
  }
});

test('terrainField honors the profile water fraction and is seeded', () => {
  const size = 24;
  const a = terrainField(size, TERRAIN_PROFILES.wilderness, mulberry32(3));
  const b = terrainField(size, TERRAIN_PROFILES.wilderness, mulberry32(3));
  assert.deepEqual(a.biomes, b.biomes);
  assert.equal(a.cells.length, size * size);
  const water = a.cells.filter((c) => c === 'water').length / a.cells.length;
  assert.ok(Math.abs(water - TERRAIN_PROFILES.wilderness.water) < 0.03, `water ${water}`);
  assert.deepEqual(
    a.cells,
    a.biomes.map((biome) => BIOME_ART[biome]),
  );
});

test('climate profiles shift the biome mix the way their names say', () => {
  /** @param {string} name @param {string} art */
  const share = (name, art) => {
    let hit = 0;
    let all = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { cells } = terrainField(24, TERRAIN_PROFILES[name], mulberry32(seed));
      hit += cells.filter((c) => c === art).length;
      all += cells.length;
    }
    return hit / all;
  };
  assert.ok(share('desert', 'desert') > share('wilderness', 'desert') + 0.3);
  assert.ok(share('frontier', 'snow') > share('wilderness', 'snow') + 0.3);
  assert.ok(share('highlands', 'mountain') > share('wilderness', 'mountain') + 0.1);
  assert.ok(share('wetlands', 'swamp') > share('wilderness', 'swamp'));
});

test('a sea-bound profile puts the whole border under water at any size', () => {
  for (const [name, size] of [
    ['island', 8],
    ['continent', 8],
    ['island', 32],
  ]) {
    const { cells } = terrainField(size, TERRAIN_PROFILES[name], mulberry32(4));
    for (let i = 0; i < size; i++) {
      for (const [x, y] of [
        [i, 0],
        [i, size - 1],
        [0, i],
        [size - 1, i],
      ]) {
        assert.equal(cells[y * size + x], 'water', `${name} ${size}: ${x},${y}`);
      }
    }
    assert.ok(
      cells.some((c) => c !== 'water'),
      `${name} ${size}: some land`,
    );
  }
});

test('each biome without art of its own has a placeholder the palette does not draw', () => {
  const palette = new TilePalette();
  for (const [biome, art] of Object.entries(BIOME_ART)) {
    if (biome === art) continue;
    const path = `assets/placeholders/${biome}/${biome}-1.svg`;
    assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${path} exists`);
    assert.equal(palette.listVariants(biome).length, 0, `${biome} is not registered`);
  }
});
