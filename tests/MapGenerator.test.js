import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { overlayList } from '../src/map/TileGrid.js';
import {
  GENERATOR_SIZES,
  SIZE_OPTIONS,
  ARCHETYPES,
  archetypesFor,
  generateNodeTiles,
  levelsLeft,
  MAX_LEVELS,
  NESTED_ARCHETYPES,
} from '../src/map/MapGenerator.js';
import { tileKind } from '../src/map/TileKinds.js';
import { generateDungeon } from '../src/map/GeneratorInteriors.js';
import { wallKind } from '../src/map/GeneratorInteriorMask.js';
import { mulberry32 } from '../src/util/Rng.js';

const palette = new TilePalette();

/** Interior archetypes with a few seeds each, for the layout invariants. */
const INTERIOR_CASES = ['dungeon', 'cave', 'castle', 'building'].flatMap((archetype) =>
  [3, 11, 27, 42].map((seed) => /** @type {const} */ ([archetype, seed])),
);

test('an unknown size preset falls back to the medium dimensions', () => {
  const med = GENERATOR_SIZES.medium;
  const gen = generateNodeTiles(
    palette,
    { kind: 'region', archetype: 'wilderness', size: 'gargantuan' },
    mulberry32(1),
  );
  assert.equal(gen.width, med);
  assert.equal(gen.height, med);
  // A dungeon shares the same size lookup, and its level count clamps up to
  // one, so it gets no stairs down and no site below.
  const level = generateNodeTiles(
    palette,
    { archetype: 'dungeon', size: 'gargantuan', levels: 0 },
    mulberry32(1),
  );
  assert.equal(level.width, med);
  assert.deepEqual(level.sites, []);
});

test('generateDungeon defaults entrance to edge and descend to true', () => {
  const size = GENERATOR_SIZES.small;
  const gen = generateDungeon(palette, size, mulberry32(3));
  const [x, y] = gen.entry.split(',').map(Number);
  const onEdge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
  assert.ok(onEdge, `default entrance puts the entry on the map edge, got ${gen.entry}`);
  // descend defaulted true, so a stairs-down tile is placed.
  assert.ok(gen.stairsDown, 'default descend places a stairs-down tile');
});

test('ARCHETYPES lists region and interior options', () => {
  for (const value of ['wilderness', 'highlands', 'frontier', 'desert', 'wetlands', 'island']) {
    assert.ok(
      ARCHETYPES.region.some((a) => a.value === value),
      value,
    );
  }
  assert.ok(ARCHETYPES.region.some((a) => a.value === 'town'));
  assert.ok(ARCHETYPES.interior.some((a) => a.value === 'dungeon'));
  assert.ok(ARCHETYPES.interior.some((a) => a.value === 'castle'));
});

test('size preset sets square dimensions and fills every cell for wilderness', () => {
  const n = GENERATOR_SIZES.medium;
  const gen = generateNodeTiles(
    palette,
    { kind: 'region', archetype: 'wilderness', size: 'medium' },
    mulberry32(1),
  );
  assert.equal(gen.width, n);
  assert.equal(gen.height, n);
  assert.equal(gen.tiles.length, n * n);
  assert.ok(gen.tiles.every((t) => t.imageRef));
});

test('generation is deterministic for a given seed', () => {
  const a = generateNodeTiles(
    palette,
    { kind: 'region', archetype: 'wilderness', size: 'small' },
    mulberry32(42),
  );
  const b = generateNodeTiles(
    palette,
    { kind: 'region', archetype: 'wilderness', size: 'small' },
    mulberry32(42),
  );
  assert.deepEqual(
    a.tiles.map((t) => t.imageRef),
    b.tiles.map((t) => t.imageRef),
  );
});

test('town lays roads as overlays and scatters building markers', () => {
  const gen = generateNodeTiles(
    palette,
    { kind: 'region', archetype: 'town', size: 'medium' },
    mulberry32(7),
  );
  assert.ok(
    gen.tiles.some((t) => t.overlayRef),
    'has at least one road overlay',
  );
  assert.ok(
    gen.tiles.some((t) => t.metadata.poiType === 'settlement'),
    'has at least one building POI',
  );
});

test('town buildings draw as non-overlapping 2x2 span blocks clear of the paths', () => {
  for (const seed of [7, 13, 40]) {
    const gen = generateNodeTiles(
      palette,
      { kind: 'region', archetype: 'town', size: 'medium' },
      mulberry32(seed),
    );
    const byId = new Map(gen.tiles.map((t) => [t.id, t]));
    const buildings = gen.tiles.filter((t) => t.metadata.poiType === 'settlement');
    assert.ok(buildings.length >= 3, `seed ${seed}: expected buildings`);
    /** @type {Set<string>} */
    const covered = new Set();
    for (const b of buildings) {
      assert.equal(b.span, 2, `seed ${seed}: building ${b.id} not scaled`);
      const [x, y] = b.id.split(',').map(Number);
      for (const [cx, cy] of [
        [x, y],
        [x + 1, y],
        [x, y + 1],
        [x + 1, y + 1],
      ]) {
        const id = `${cx},${cy}`;
        const cell = byId.get(id);
        assert.ok(cell, `seed ${seed}: block ${b.id} runs off the grid at ${id}`);
        assert.ok(!cell.overlayRef, `seed ${seed}: block ${b.id} covers a path at ${id}`);
        assert.ok(!covered.has(id), `seed ${seed}: blocks overlap at ${id}`);
        covered.add(id);
      }
    }
  }
});

test('wilderness places a river, coastlines around water, and landmark POIs', () => {
  let sawCoast = false;
  for (const seed of [1, 2, 3, 4, 5]) {
    const gen = generateNodeTiles(
      palette,
      { kind: 'region', archetype: 'wilderness', size: 'medium' },
      mulberry32(seed),
    );
    assert.ok(
      gen.tiles.some((t) => overlayList(t).some((r) => r.includes('/river/'))),
      `seed ${seed}: has a river`,
    );
    assert.ok(
      gen.tiles.some((t) => t.metadata.poiType === 'landmark'),
      `seed ${seed}: has a landmark`,
    );
    // Coast overlays only appear next to water; every land tile beside water
    // must carry one (the smoothing pass guarantees a piece exists for it),
    // stacked under the river channel where the two meet.
    const n = gen.width;
    const isWater = new Set(
      gen.tiles.filter((t) => /\/(deep-)?water\//.test(t.imageRef)).map((t) => t.id),
    );
    for (const t of gen.tiles) {
      if (isWater.has(t.id) || t.metadata.poiType) continue;
      const [x, y] = t.id.split(',').map(Number);
      const orthWater = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ].some(([dx, dy]) => isWater.has(`${x + dx},${y + dy}`));
      if (orthWater) {
        sawCoast = true;
        assert.ok(
          overlayList(t).some((r) => r.includes('/coast/')),
          `seed ${seed}: shore tile ${t.id} has a coast overlay`,
        );
      }
    }
    assert.ok(n * n === gen.tiles.length, 'wilderness fills the grid');
  }
  assert.ok(sawCoast, 'at least one seed produced a shoreline');
});

test('a wilderness river draining into a lake stacks its channel over the shoreline', () => {
  // Scan seeds until a generation's river ends beside water; deterministic
  // PRNG makes the found seed stable.
  let mouth = null;
  for (let seed = 1; seed <= 60 && !mouth; seed++) {
    const gen = generateNodeTiles(
      palette,
      { kind: 'region', archetype: 'wilderness', size: 'medium' },
      mulberry32(seed),
    );
    mouth =
      gen.tiles.find((t) => {
        const refs = overlayList(t);
        return refs.some((r) => r.includes('/river/')) && refs.some((r) => r.includes('/coast/'));
      }) ?? null;
  }
  assert.ok(mouth, 'some seed produced a river mouth');
  const refs = overlayList(mouth);
  assert.ok(
    refs[0].includes('/coast/') && refs[1].includes('/river/'),
    'shoreline draws under the channel',
  );
});

test('dungeon floors are fully enclosed by placed tiles, with no stairs to nowhere', () => {
  const n = GENERATOR_SIZES.medium;
  const gen = generateNodeTiles(
    palette,
    { kind: 'interior', archetype: 'dungeon', size: 'medium' },
    mulberry32(3),
  );
  const placed = new Set(gen.tiles.map((t) => t.id));
  const floors = gen.tiles.filter((t) => /floor|stairs/.test(t.imageRef));
  assert.ok(floors.length > 0, 'carved some floor');
  assert.ok(gen.tiles.length <= n * n, 'no more tiles than the grid holds');
  for (const f of floors) {
    const [x, y] = f.id.split(',').map(Number);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      assert.ok(
        placed.has(`${nx},${ny}`),
        `floor ${f.id} neighbor ${nx},${ny} is walled/floored, not void`,
      );
    }
  }
  // A single-level dungeon is entered by its door and has no level below,
  // so it has no stairs at all.
  assert.ok(!gen.tiles.some((t) => t.imageRef.includes('stairs-up')));
  assert.ok(!gen.tiles.some((t) => t.imageRef.includes('stairs-down')));
});

test('wallKind picks pieces by connected wall arms', () => {
  assert.equal(wallKind(true, true, true, true), 'wall-cross');
  assert.equal(wallKind(true, true, false, true), 'wall-tee-n');
  assert.equal(wallKind(true, true, true, false), 'wall-tee-e');
  assert.equal(wallKind(false, true, true, true), 'wall-tee-s');
  assert.equal(wallKind(true, false, true, true), 'wall-tee-w');
  assert.equal(wallKind(true, false, true, false), 'wall-v');
  assert.equal(wallKind(false, true, false, true), 'wall-h');
  assert.equal(wallKind(true, true, false, false), 'wall-corner-ne');
  assert.equal(wallKind(false, false, true, true), 'wall-corner-sw');
  assert.equal(wallKind(true, false, false, false), 'wall-v');
  assert.equal(wallKind(false, false, false, false), 'wall-h');
});

test('interior wall pieces match their neighbors, junctions included', () => {
  for (const [archetype, seed] of INTERIOR_CASES) {
    const gen = generateNodeTiles(
      palette,
      { kind: 'interior', archetype, size: 'medium' },
      mulberry32(seed),
    );
    const byId = new Map(gen.tiles.map((t) => [t.id, t]));
    // A cell continues the wall if it holds a wall piece or a door set in it.
    const wallish = (id) => {
      const ref = byId.get(id)?.imageRef ?? '';
      return ref.includes('wall-') || ref.includes('door-');
    };
    for (const t of gen.tiles) {
      if (!t.imageRef.includes('wall-')) continue;
      const [x, y] = t.id.split(',').map(Number);
      const expected = wallKind(
        wallish(`${x},${y - 1}`),
        wallish(`${x + 1},${y}`),
        wallish(`${x},${y + 1}`),
        wallish(`${x - 1},${y}`),
      );
      assert.ok(
        t.imageRef.includes(expected),
        `${archetype} seed ${seed}: wall ${t.id} is ${expected} (got ${t.imageRef})`,
      );
    }
  }
});

test('castle is a walled ring with a floored interior and doors', () => {
  const n = GENERATOR_SIZES.small;
  const gen = generateNodeTiles(
    palette,
    { kind: 'interior', archetype: 'castle', size: 'small' },
    mulberry32(9),
  );
  const byId = new Map(gen.tiles.map((t) => [t.id, t]));
  assert.equal(gen.tiles.length, n * n, 'castle fills the whole grid');
  // Every border cell is a wall/corner/door, never bare floor.
  for (let i = 0; i < n; i++) {
    for (const id of [`${i},0`, `${i},${n - 1}`, `0,${i}`, `${n - 1},${i}`]) {
      assert.ok(!byId.get(id).imageRef.includes('floor'), `border ${id} is not floor`);
    }
  }
  assert.ok(
    gen.tiles.some((t) => t.imageRef.includes('floor')),
    'has interior floor',
  );
  assert.ok(
    gen.tiles.some((t) => t.imageRef.includes('door')),
    'has a door',
  );
  assert.ok(
    gen.tiles.some((t) => t.imageRef.includes('stairs')),
    'has stairs',
  );
  // Ring corners connect inward: the NW corner continues east and south.
  assert.ok(byId.get('0,0').imageRef.includes('wall-corner-se'));
  assert.ok(byId.get(`${n - 1},0`).imageRef.includes('wall-corner-sw'));
  assert.ok(byId.get(`0,${n - 1}`).imageRef.includes('wall-corner-ne'));
  assert.ok(byId.get(`${n - 1},${n - 1}`).imageRef.includes('wall-corner-nw'));
});

test('every archetype returns a border entry that exists and is walkable', () => {
  const cases = [
    ['region', 'wilderness'],
    ['region', 'town'],
    ['interior', 'dungeon'],
    ['interior', 'cave'],
    ['interior', 'castle'],
    ['interior', 'building'],
  ];
  for (const [kind, archetype] of cases) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const gen = generateNodeTiles(palette, { kind, archetype, size: 'small' }, mulberry32(seed));
      const [x, y] = gen.entry.split(',').map(Number);
      const onBorder = x === 0 || y === 0 || x === gen.width - 1 || y === gen.height - 1;
      assert.ok(onBorder, `${archetype} seed ${seed}: entry ${gen.entry} on the border`);
      const tile = gen.tiles.find((t) => t.id === gen.entry);
      assert.ok(tile, `${archetype} seed ${seed}: entry tile exists`);
      assert.ok(!tile.imageRef.includes('wall-'), `${archetype} seed ${seed}: entry is not a wall`);
    }
  }
});

test('interior entry connects to the whole floor network', () => {
  for (const [archetype, seed] of INTERIOR_CASES) {
    const gen = generateNodeTiles(
      palette,
      { kind: 'interior', archetype, size: 'medium' },
      mulberry32(seed),
    );
    const walkable = new Set(
      gen.tiles.filter((t) => !t.imageRef.includes('wall-')).map((t) => t.id),
    );
    // Flood-fill the walkable tiles from the entry door.
    const seen = new Set([gen.entry]);
    const queue = [gen.entry];
    while (queue.length) {
      const [x, y] = queue.pop().split(',').map(Number);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const id = `${x + dx},${y + dy}`;
        if (walkable.has(id) && !seen.has(id)) {
          seen.add(id);
          queue.push(id);
        }
      }
    }
    assert.equal(
      seen.size,
      walkable.size,
      `${archetype} seed ${seed}: every walkable tile reachable from the entry (${seen.size}/${walkable.size})`,
    );
  }
});

test('SIZE_OPTIONS lists every preset, smallest first, with its dimensions', () => {
  assert.deepEqual(
    SIZE_OPTIONS.map((o) => o.value),
    Object.keys(GENERATOR_SIZES),
  );
  assert.equal(SIZE_OPTIONS.at(-1)?.label, 'Vast (48 x 48)');
  const sides = Object.values(GENERATOR_SIZES);
  assert.deepEqual(
    sides,
    [...sides].sort((a, b) => a - b),
  );
});

test('each climate archetype dispatches to its own profile', () => {
  const desert = generateNodeTiles(
    palette,
    { kind: 'region', archetype: 'desert', size: 'medium' },
    mulberry32(2),
  );
  const sandy = desert.tiles.filter((t) => t.imageRef.includes('/desert/')).length;
  assert.ok(sandy > desert.tiles.length / 3, `desert tiles: ${sandy}`);
});

test('every region archetype, the world included, opens into sub-maps', () => {
  assert.ok(ARCHETYPES.region.some((a) => a.value === 'world'));
  assert.deepEqual(
    NESTED_ARCHETYPES,
    ARCHETYPES.region.map((a) => a.value),
  );
  const world = generateNodeTiles(palette, { archetype: 'world', size: 'medium' }, mulberry32(1));
  assert.ok(world.sites.length >= 2);
});

test('a dungeon level opens into the level below as a forced site', () => {
  const gen = generateNodeTiles(
    palette,
    { archetype: 'dungeon', size: 'medium', levels: 3, level: 2, environ: 'crypt' },
    mulberry32(5),
  );
  assert.deepEqual(gen.sites, [
    {
      tileIds: [gen.sites[0].tileIds[0]],
      archetype: 'dungeon',
      kind: 'interior',
      environ: 'crypt',
      size: 'medium',
      label: 'level 3',
      forced: true,
      levels: 2,
      level: 3,
    },
  ]);
  const up = gen.tiles.find((t) => t.id === gen.entry);
  assert.match(String(up?.imageRef), /stairs-up/, 'a level below the first enters by its stairs');
});

test('a building with a trapdoor opens into a small cellar', () => {
  const gen = generateNodeTiles(palette, { archetype: 'building', size: 'small' }, mulberry32(10));
  assert.equal(gen.sites.length, 1);
  assert.equal(gen.sites[0].archetype, 'cellar');
  assert.ok(gen.sites[0].forced);
  const plain = generateNodeTiles(palette, { archetype: 'building', size: 'small' }, mulberry32(1));
  assert.deepEqual(plain.sites, []);
  const cellar = generateNodeTiles(palette, { archetype: 'cellar', size: 'small' }, mulberry32(3));
  assert.equal(cellar.width, 8);
  assert.match(String(cellar.tiles.find((t) => t.id === cellar.entry)?.imageRef), /stairs-up/);
  assert.ok(!cellar.tiles.some((t) => t.imageRef.includes('stairs-down')));
  assert.deepEqual(cellar.sites, []);
});

test('a stack of levels ends at MAX_LEVELS, however many levels are asked for', () => {
  const spec = { archetype: 'dungeon', size: 'small', levels: 500 };
  const first = generateNodeTiles(palette, spec, mulberry32(2));
  assert.equal(first.sites[0].levels, MAX_LEVELS - 1);
  const last = generateNodeTiles(palette, { ...spec, level: MAX_LEVELS }, mulberry32(2));
  assert.deepEqual(last.sites, [], 'the last level has no stairs down');
  const past = generateNodeTiles(palette, { ...spec, level: MAX_LEVELS + 3 }, mulberry32(2));
  assert.deepEqual(past.sites, []);
  assert.equal(levelsLeft(1), MAX_LEVELS);
  assert.equal(levelsLeft(MAX_LEVELS), 1);
  assert.equal(levelsLeft(MAX_LEVELS + 3), 1);
});

test('a node reached by a staircase takes only the archetypes that keep the staircase', () => {
  assert.equal(archetypesFor('region', null), ARCHETYPES.region);
  assert.equal(archetypesFor('interior', null), ARCHETYPES.interior);
  assert.equal(archetypesFor('region', 'stairs-up'), ARCHETYPES.region);
  const below = archetypesFor('interior', 'stairs-up').map((a) => a.value);
  assert.deepEqual(below, ['dungeon', 'cave', 'cellar']);
  const above = archetypesFor('interior', 'stairs-down').map((a) => a.value);
  assert.deepEqual(above, ['upper-floor']);
  // Each archetype for a level below enters by its stairs up at level 2, and
  // the upper floor enters by its stairs down.
  for (const archetype of below) {
    const gen = generateNodeTiles(palette, { archetype, size: 'small', level: 2 }, mulberry32(7));
    const entry = gen.tiles.find((t) => t.id === gen.entry);
    assert.equal(entry && tileKind(entry), 'stairs-up', archetype);
  }
  const upper = generateNodeTiles(
    palette,
    { archetype: 'upper-floor', size: 'small' },
    mulberry32(7),
  );
  const entry = upper.tiles.find((t) => t.id === upper.entry);
  assert.equal(entry && tileKind(entry), 'stairs-down');
});
