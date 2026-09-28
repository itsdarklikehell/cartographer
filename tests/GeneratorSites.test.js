import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARMS, ArmNetwork } from '../src/map/Autotile.js';
import { wildTerrain } from '../src/map/GeneratorGround.js';
import {
  connectSites,
  plantFarmland,
  planSites,
  siteCounts,
  siteMap,
} from '../src/map/GeneratorSites.js';
import { mulberry32 } from '../src/util/Rng.js';

/**
 * A plain grass terrain of the given size with no rivers.
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

test('siteCounts grows with the map', () => {
  assert.deepEqual(siteCounts(8), { settlements: 1, keep: 0, dungeon: 0 });
  assert.deepEqual(siteCounts(14), { settlements: 1, keep: 0, dungeon: 1 });
  assert.deepEqual(siteCounts(48), { settlements: 5, keep: 1, dungeon: 1 });
});

test('sites keep off the border, the shore, and the rivers, and keep apart', () => {
  for (const seed of [1, 2, 3]) {
    const size = 32;
    const terrain = wildTerrain(size, 'wetlands', mulberry32(seed));
    const sites = planSites(terrain, mulberry32(seed));
    assert.ok(sites.length >= 3, `seed ${seed}: sites placed`);
    for (const site of sites) {
      assert.ok(site.x >= 2 && site.y >= 2 && site.x < size - 2 && site.y < size - 2);
      assert.equal(terrain.rivers.has(site.x, site.y), false, 'not on a river');
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          assert.notEqual(terrain.cells[(site.y + dy) * size + site.x + dx], 'water');
        }
      }
    }
    const towns = sites.filter((s) => s.archetype === 'town');
    for (const [i, a] of towns.entries()) {
      for (const b of towns.slice(i + 1)) {
        assert.ok(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) >= 6, 'towns keep apart');
      }
    }
  }
});

test('a settlement beside open water is a port, and one inland is not', () => {
  const size = 14;
  const coast = meadow(size);
  for (let y = 0; y < size; y++) for (let x = 0; x < 4; x++) coast.cells[y * size + x] = 'water';
  // Ground near water scores higher, so the town lands on the first
  // column clear of the shore.
  const [port] = planSites(coast, mulberry32(1));
  assert.equal(port.x, 5);
  assert.equal(port.marker, 'port');
  const [inland] = planSites(meadow(size), mulberry32(1));
  assert.equal(inland.marker, 'settlement');
  assert.equal(inland.archetype, 'town');
});

test('a map with no open ground has no sites', () => {
  const rock = meadow(10);
  rock.cells.fill('mountain');
  assert.deepEqual(planSites(rock, mulberry32(1)), []);
});

test('a large map adds a keep and a dungeon far from the towns', () => {
  const sites = planSites(meadow(22), mulberry32(4));
  assert.deepEqual(sites.map((s) => s.archetype).sort(), ['castle', 'dungeon', 'town', 'town']);
  const keep = sites.find((s) => s.archetype === 'castle');
  assert.equal(keep?.marker, 'castle');
  assert.equal(keep?.poi, 'landmark');
  const alone = planSites({ ...meadow(14) }, mulberry32(4));
  assert.ok(alone.some((s) => s.archetype === 'dungeon'));
});

test('farmland grows only on grass around towns', () => {
  const terrain = meadow(10);
  terrain.cells[3 * 10 + 4] = 'forest';
  const town = {
    x: 4,
    y: 4,
    tileId: '4,4',
    marker: 'settlement',
    poi: 'settlement',
    archetype: 'town',
  };
  const dungeon = { ...town, x: 8, y: 8, tileId: '8,8', archetype: 'dungeon' };
  plantFarmland(terrain, /** @type {any} */ ([town, dungeon]), () => 0);
  assert.equal(terrain.cells[4 * 10 + 4], 'grass', 'the town cell stays grass');
  assert.equal(terrain.cells[3 * 10 + 4], 'forest', 'forest is not cleared');
  assert.equal(terrain.cells[2 * 10 + 2], 'farmland');
  assert.equal(terrain.cells[9 * 10 + 9], 'grass', 'no fields around a dungeon');
  // Cells past the map edge are skipped.
  plantFarmland(terrain, /** @type {any} */ ([{ ...town, x: 0, y: 0 }]), () => 0);
});

test('roads join every town and the keep and leave the map', () => {
  const size = 32;
  const terrain = meadow(size);
  const sites = planSites(terrain, mulberry32(2));
  const { roads, exits } = connectSites(terrain, sites);
  assert.equal(exits.length, 2, 'a 32-cell map has two exits');
  // Every linked site has a road beside it that points at it.
  for (const site of sites) {
    const near = [
      [0, -1, 's'],
      [1, 0, 'w'],
      [0, 1, 'n'],
      [-1, 0, 'e'],
    ].some(([dx, dy, arm]) =>
      roads.at(site.x + Number(dx), site.y + Number(dy)).has(/** @type {any} */ (arm)),
    );
    assert.equal(near, site.archetype !== 'dungeon', `${site.archetype} at ${site.tileId}`);
  }
  for (const id of exits) {
    const [x, y] = id.split(',').map(Number);
    assert.ok(x === 0 || y === 0 || x === size - 1 || y === size - 1, `${id} is on the border`);
  }
  const [a, b] = exits.map((id) => id.split(',').map(Number));
  assert.ok(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) >= size / 2, 'exits far apart');
});

test('a site no road can reach is left unlinked, and no sites means no roads', () => {
  const size = 14;
  const terrain = meadow(size);
  // A ring of water around the second town.
  for (let y = 7; y <= 11; y++) {
    for (let x = 7; x <= 11; x++) {
      if (x === 7 || y === 7 || x === 11 || y === 11) terrain.cells[y * size + x] = 'water';
    }
  }
  const base = { marker: 'settlement', poi: 'settlement', archetype: 'town' };
  const sites = /** @type {any} */ ([
    { ...base, x: 3, y: 3, tileId: '3,3' },
    { ...base, x: 9, y: 9, tileId: '9,9' },
  ]);
  const { roads, exits } = connectSites(terrain, sites);
  assert.equal(roads.has(9, 8), false, 'the island town has no road');
  assert.equal(exits.length, 1);
  assert.equal(connectSites(terrain, []).roads.arms.size, 0);
  // A town sealed in on every side gets no exit either.
  const sealed = meadow(8);
  sealed.cells.fill('water');
  sealed.cells[3 * 8 + 3] = 'grass';
  const lone = connectSites(sealed, /** @type {any} */ ([{ ...base, x: 3, y: 3, tileId: '3,3' }]));
  assert.deepEqual(lone.exits, []);
});

test('the first settlement of a large map is a city, and some later ones are villages', () => {
  const markers = new Set();
  for (const seed of [1, 2, 3, 4]) {
    const towns = planSites(meadow(40), mulberry32(seed)).filter((s) => s.archetype === 'town');
    assert.equal(towns[0].marker, 'city');
    for (const t of towns.slice(1)) markers.add(t.marker);
  }
  assert.deepEqual([...markers].sort(), ['settlement', 'village']);
  const [small] = planSites(meadow(20), mulberry32(1));
  assert.equal(small.marker, 'settlement');
});

/**
 * The road cells reachable along road arms from a cell.
 * @param {ArmNetwork} roads @param {number} x @param {number} y
 */
function roadReach(roads, x, y) {
  const seen = new Set([`${x},${y}`]);
  const queue = [[x, y]];
  while (queue.length) {
    const [cx, cy] = /** @type {number[]} */ (queue.pop());
    for (const [arm, dx, dy] of ARMS) {
      const id = `${cx + dx},${cy + dy}`;
      if (!roads.at(cx, cy).has(arm) || seen.has(id) || !roads.has(cx + dx, cy + dy)) continue;
      seen.add(id);
      queue.push([cx + dx, cy + dy]);
    }
  }
  return seen;
}

/**
 * Plan and join the sites of a generated terrain, as generateWilds does.
 * @param {string} archetype @param {number} size @param {number} seed
 */
function planned(archetype, size, seed) {
  const rng = mulberry32(seed);
  const terrain = wildTerrain(size, archetype, rng);
  const sites = planSites(terrain, rng);
  plantFarmland(terrain, sites, rng);
  return { terrain, sites, ...connectSites(terrain, sites) };
}

test('the first exit reaches every settlement and the keep', () => {
  // Highlands large seed 8 put two of its three sites in pockets that no
  // road reaches from the exit.
  const { sites, roads, exits } = planned('highlands', 22, 8);
  const [x, y] = exits[0].split(',').map(Number);
  const reach = roadReach(roads, x, y);
  const linked = sites.filter((s) => s.archetype !== 'dungeon');
  assert.equal(linked.length, 3);
  for (const site of linked) assert.ok(reach.has(site.tileId), `${site.marker} at ${site.tileId}`);
});

test('every generated site the roads link is on the network of the first exit', () => {
  for (const archetype of ['wilderness', 'highlands', 'frontier', 'desert', 'wetlands']) {
    for (const size of [14, 22, 32]) {
      for (let seed = 0; seed < 6; seed++) {
        const label = `${archetype} ${size} ${seed}`;
        const { sites, roads, exits } = planned(archetype, size, seed);
        assert.ok(
          sites.some((s) => s.archetype === 'town'),
          `${label}: a settlement`,
        );
        if (!exits.length) continue;
        const [x, y] = exits[0].split(',').map(Number);
        const reach = roadReach(roads, x, y);
        for (const id of exits) assert.ok(reach.has(id), `${label}: exit ${id} on the network`);
        for (const site of sites.filter((s) => s.archetype !== 'dungeon')) {
          assert.ok(reach.has(site.tileId), `${label}: ${site.tileId} reached`);
        }
      }
    }
  }
});

test('a small map with no room two cells in keeps its settlement one cell from the border', () => {
  // Wilderness small seed 2 has water beside every cell two cells in.
  const { sites } = planned('wilderness', 8, 2);
  assert.equal(sites.length, 1);
  const [town] = sites;
  assert.equal(Math.min(town.x, town.y, 7 - town.x, 7 - town.y), 1);
  // A map with room only beside water puts its settlement there.
  const shore = meadow(8);
  for (let i = 0; i < 64; i++) if (i % 2) shore.cells[i] = 'water';
  const [wet] = planSites(shore, mulberry32(1));
  assert.ok(wet, 'a settlement beside the water');
  assert.equal(shore.cells[wet.y * 8 + wet.x], 'grass');
});

test('a city beside the sea stays a city and opens into a coast town', () => {
  // Island huge seed 6 put its first settlement by the sea.
  const { sites } = planned('island', 32, 6);
  const [city, ...later] = sites.filter((s) => s.archetype === 'town');
  assert.equal(city.marker, 'city');
  assert.equal(city.coast, true);
  assert.equal(siteMap(city).environ, 'coast');
  assert.equal(siteMap(city).size, 'large');
  for (const town of later) {
    assert.equal(town.marker === 'port', town.coast, `${town.tileId}: a port is on the coast`);
  }
  const inland = planSites(meadow(40), mulberry32(1))[0];
  assert.equal(inland.coast, false);
  assert.equal(siteMap(inland).environ, 'grassland');
});

test('a site cut off from the first site gets no road and no exit', () => {
  const size = 14;
  const terrain = meadow(size);
  // A ring of water around 2,2, the site nearest the border.
  for (let y = 1; y <= 3; y++) {
    for (let x = 1; x <= 3; x++) if (x !== 2 || y !== 2) terrain.cells[y * size + x] = 'water';
  }
  const base = { marker: 'settlement', poi: 'settlement', archetype: 'town' };
  const sites = /** @type {any} */ ([
    { ...base, x: 8, y: 8, tileId: '8,8' },
    { ...base, x: 2, y: 2, tileId: '2,2' },
  ]);
  const { roads, exits } = connectSites(terrain, sites);
  assert.equal(exits.length, 1);
  assert.ok(roadReach(roads, 8, 8).has(exits[0]), 'the exit leads to the first site');
  assert.equal(roads.has(2, 2), false);
  // A first site cut off from the rest keeps them out of its tree.
  const alone = connectSites(terrain, [sites[1], sites[0]]);
  assert.deepEqual(alone.exits, [], 'the island site has no border to reach');
  assert.equal(alone.roads.arms.size, 0);
  // A site on ground that takes no road has no area and no exit.
  terrain.cells[1 * size + 1] = 'mountain';
  const peak = connectSites(terrain, [{ ...sites[0], x: 1, y: 1, tileId: '1,1' }]);
  assert.deepEqual(peak.exits, []);
  // Markers can box a site in although its area reaches the border.
  const dungeon = { ...base, marker: 'dungeon', poi: 'dungeon', archetype: 'dungeon' };
  const boxed = [
    { ...base, x: 8, y: 8, tileId: '8,8' },
    ...ARMS.map(([, dx, dy]) => ({
      ...dungeon,
      x: 8 + dx,
      y: 8 + dy,
      tileId: `${8 + dx},${8 + dy}`,
    })),
  ];
  assert.deepEqual(connectSites(terrain, /** @type {any} */ (boxed)).exits, []);
});
