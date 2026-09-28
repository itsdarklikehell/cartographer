import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArmNetwork } from '../src/map/Autotile.js';
import { planTown } from '../src/map/GeneratorTown.js';
import {
  CORE_BUILDINGS,
  EXTRA_BUILDINGS,
  HOME,
  buildingList,
  placeBuildings,
  townPlacer,
} from '../src/map/GeneratorTownBuildings.js';
import { mulberry32 } from '../src/util/Rng.js';

/**
 * A bare lot with no plaza, no wall, and no river unless one is given.
 * @param {number} size @param {Partial<import('../src/map/GeneratorTownBuildings.js').TownLot>} [over]
 * @returns {import('../src/map/GeneratorTownBuildings.js').TownLot}
 */
function lot(size, over = {}) {
  return {
    size,
    c: Math.floor(size / 2),
    core: 3,
    cells: new Array(size * size).fill('grass'),
    roads: new ArmNetwork(),
    rivers: new ArmNetwork(),
    walls: new Map(),
    paved: () => false,
    ...over,
  };
}

test('buildingList puts the core set first, then the civic set', () => {
  const small = buildingList(8, mulberry32(1));
  assert.equal(small.first.length, 3, 'a small town has three buildings');
  assert.ok(small.first.every((art) => CORE_BUILDINGS.includes(art)));
  assert.deepEqual(small.rest, []);
  const medium = buildingList(14, mulberry32(1));
  assert.deepEqual(medium.first.slice(0, 5).sort(), [...CORE_BUILDINGS].sort());
  assert.ok(['well', 'fountain'].includes(medium.first[5]));
  assert.deepEqual(medium.rest, [HOME], 'one slot left, and a home takes it');
  const large = buildingList(22, mulberry32(1));
  assert.deepEqual(large.first.slice(6), ['market', 'town-hall']);
});

test('buildingList gives extras half of the remaining slots, with no cap', () => {
  const { first, rest } = buildingList(48, mulberry32(3));
  const wanted = Math.round((48 * 48) / 30);
  assert.equal(first.length + rest.length, wanted);
  const extras = rest.filter((art) => art !== HOME);
  assert.equal(extras.length, Math.floor((wanted - first.length) / 2));
  assert.ok(extras.length > EXTRA_BUILDINGS.length, `extras: ${extras.length}`);
  assert.deepEqual(rest.slice(extras.length), new Array(rest.length - extras.length).fill(HOME));
  // Each round of the list has every kind once, so the counts differ by one at most.
  const counts = EXTRA_BUILDINGS.map((art) => extras.filter((e) => e === art).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `counts: ${counts}`);
  for (let i = 0; i + EXTRA_BUILDINGS.length <= extras.length; i += EXTRA_BUILDINGS.length) {
    const round = extras.slice(i, i + EXTRA_BUILDINGS.length);
    assert.equal(new Set(round).size, EXTRA_BUILDINGS.length, `round at ${i}`);
  }
});

test('townPlacer splits the free blocks into street blocks and loose blocks', () => {
  const roads = new ArmNetwork();
  for (let y = 0; y < 7; y++) roads.join(3, y, 's');
  const placer = townPlacer(lot(8, { roads }));
  const ids = (/** @type {{ x: number, y: number }[]} */ list) => list.map((b) => `${b.x},${b.y}`);
  assert.ok(ids(placer.street).includes('1,0'), 'a block beside the street');
  assert.ok(ids(placer.street).includes('4,5'));
  assert.ok(ids(placer.loose).includes('0,0'), 'a block one cell off the street');
  assert.ok(!ids([...placer.street, ...placer.loose]).some((id) => id.startsWith('3,')));
  assert.equal(placer.open(3, 2), false, 'a street cell is not open');
});

test('townPlacer places on free blocks only and turns homes into houses and cottages', () => {
  const placer = townPlacer(lot(8));
  const at = (/** @type {number} */ x, /** @type {number} */ y) => ({ x, y, d: 0, river: false });
  placer.place([at(3, 3), at(4, 3), at(0, 0), at(6, 6)], [HOME, HOME, 'inn'], 'settlement');
  assert.deepEqual(
    placer.buildings.map((b) => [b.id, b.art]),
    [
      ['3,3', 'house'],
      ['0,0', 'cottage'],
      ['6,6', 'inn'],
    ],
    'the overlapping block at 4,3 is skipped',
  );
  assert.equal(placer.openBlock(3, 3), false);
  placer.place([at(1, 1), at(1, 3)], ['tavern'], 'settlement');
  assert.equal(placer.buildings.length, 4);
  assert.equal(placer.buildings[3].id, '1,3', '1,1 overlaps the cottage');
});

test('placeBuildings falls back to blocks off the streets when a small town runs out', () => {
  const buildings = placeBuildings(lot(8), mulberry32(1));
  assert.equal(buildings.length, 3, 'no street, but the core set still stands');
  for (const { id } of buildings) {
    const [x, y] = id.split(',').map(Number);
    assert.ok(Math.max(Math.abs(x + 0.5 - 4), Math.abs(y + 0.5 - 4)) <= 3, `${id} near the center`);
  }
});

test('placeBuildings puts the watermill and the graveyard before the extras and homes', () => {
  let [mills, graveyards] = [0, 0];
  for (let seed = 1; seed <= 12; seed++) {
    const arts = planTown(32, mulberry32(seed)).buildings.map((b) => b.art);
    const mill = arts.indexOf('watermill');
    const grave = arts.indexOf('graveyard');
    const civic = CORE_BUILDINGS.length + 3;
    if (mill >= 0) mills++;
    if (grave >= 0) graveyards++;
    assert.ok(mill < 0 || mill === civic, `seed ${seed}: the watermill after the civic set`);
    assert.ok(grave < 0 || grave === (mill < 0 ? civic : mill + 1), `seed ${seed}: graveyard`);
  }
  assert.ok(mills > 3 && graveyards > 3, `mills ${mills}, graveyards ${graveyards}`);
});

test('every river town gets a watermill, and three towns in five get a graveyard', () => {
  for (const [size, seeds] of [
    [14, 100],
    [48, 60],
  ]) {
    let [rivers, mills, graveyards] = [0, 0, 0];
    for (let seed = 1; seed <= seeds; seed++) {
      const plan = planTown(size, mulberry32(seed));
      const arts = plan.buildings.map((b) => b.art);
      if (plan.rivers.arms.size) rivers++;
      if (arts.includes('watermill')) mills++;
      if (arts.includes('graveyard')) graveyards++;
    }
    assert.equal(mills, rivers, `size ${size}: a watermill in each river town`);
    const rate = graveyards / seeds;
    assert.ok(rate > 0.5 && rate < 0.72, `size ${size}: graveyards ${rate}`);
  }
});
