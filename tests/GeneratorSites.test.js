import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArmNetwork } from '../src/map/Autotile.js';
import { wildTerrain } from '../src/map/GeneratorWilds.js';
import { connectSites, plantFarmland, planSites, siteCounts } from '../src/map/GeneratorSites.js';
import { mulberry32 } from '../src/util/Rng.js';

/**
 * A plain grass terrain of the given size with no rivers.
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
