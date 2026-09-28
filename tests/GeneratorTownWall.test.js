import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArmNetwork } from '../src/map/Autotile.js';
import { planWall, wallRadii, wallRing } from '../src/map/GeneratorTownWall.js';

/**
 * A 22-cell town with one straight street through the center on each axis.
 * @returns {{ size: number, roads: ArmNetwork, rivers: ArmNetwork }}
 */
function crossTown() {
  const size = 22;
  const roads = new ArmNetwork();
  for (let i = 0; i < size - 1; i++) {
    roads.join(11, i, 's');
    roads.join(i, 11, 'e');
  }
  return { size, roads, rivers: new ArmNetwork() };
}

test('a wall ring names its corners for their open edges and gates each street', () => {
  const walls = /** @type {Map<string, string>} */ (wallRing(crossTown(), 11, 8));
  assert.equal(walls.size, 64);
  assert.equal(walls.get('3,3'), 'wall-corner-se');
  assert.equal(walls.get('19,3'), 'wall-corner-sw');
  assert.equal(walls.get('3,19'), 'wall-corner-ne');
  assert.equal(walls.get('19,19'), 'wall-corner-nw');
  assert.equal(walls.get('11,3'), 'gate-h');
  assert.equal(walls.get('11,19'), 'gate-h');
  assert.equal(walls.get('3,11'), 'gate-v');
  assert.equal(walls.get('19,11'), 'gate-v');
  assert.equal(walls.get('5,3'), 'wall-h');
  assert.equal(walls.get('19,6'), 'wall-v');
});

test('a wall ring puts a water gate where the river goes straight through', () => {
  const plan = crossTown();
  for (let y = 0; y < plan.size - 1; y++) plan.rivers.join(6, y, 's');
  const walls = /** @type {Map<string, string>} */ (wallRing(plan, 11, 8));
  assert.equal(walls.size, 64);
  assert.equal(walls.get('6,3'), 'water-gate-h');
  assert.equal(walls.get('6,19'), 'water-gate-h');
  const across = crossTown();
  for (let x = 0; x < across.size - 1; x++) across.rivers.join(x, 14, 'e');
  assert.equal(wallRing(across, 11, 8)?.get('3,14'), 'water-gate-v');
});

test('a wall ring refuses a river at a corner, along the wall, or bent on it', () => {
  const corner = crossTown();
  corner.rivers.join(3, 3, 'e');
  assert.equal(wallRing(corner, 11, 8), null);
  const along = crossTown();
  for (let y = 0; y < 9; y++) along.rivers.join(3, y, 's');
  assert.equal(wallRing(along, 11, 8), null);
  const bent = crossTown();
  bent.rivers.join(6, 2, 's');
  bent.rivers.join(6, 3, 'e');
  assert.equal(wallRing(bent, 11, 8), null);
});

test('a wall ring refuses a street at a corner, along the wall, or on a bridge', () => {
  const corner = crossTown();
  corner.roads.join(3, 3, 'e');
  assert.equal(wallRing(corner, 11, 8), null);
  const along = crossTown();
  along.roads.join(11, 3, 'e');
  assert.equal(wallRing(along, 11, 8), null);
  const bent = crossTown();
  bent.roads.join(5, 2, 's');
  bent.roads.join(5, 3, 'e');
  assert.equal(wallRing(bent, 11, 8), null, 'a street that turns on the wall');
  const bridge = crossTown();
  bridge.rivers.join(11, 2, 's');
  assert.equal(wallRing(bridge, 11, 8), null);
});

test('a wall ring refuses the sea and its shore in a town with no sea side', () => {
  const port = { ...crossTown(), sea: (/** @type {number} */ x) => x <= 3 };
  assert.equal(wallRing(port, 11, 8), null, 'the west side of the ring is on the shore');
  assert.equal(wallRing(port, 11, 7)?.size, 56, 'a smaller ring keeps clear of it');
});

/**
 * The cross town as a port with its sea on the west, where `wet` marks the
 * cells of the sea and its shore.
 * @param {(x: number, y: number) => boolean} [wet]
 */
function westPort(wet = (x) => x <= 3) {
  return { ...crossTown(), sea: wet, side: /** @type {const} */ ('w') };
}

test('a port wall opens on the sea side and runs to the shore', () => {
  const walls = /** @type {Map<string, string>} */ (wallRing(westPort(), 11, 8));
  assert.equal(walls.size, 47, 'the far side and two sides that reach the shore');
  assert.equal(walls.get('19,3'), 'wall-corner-sw');
  assert.equal(walls.get('19,19'), 'wall-corner-nw');
  assert.equal(walls.get('19,11'), 'gate-v');
  assert.equal(walls.get('11,3'), 'gate-h');
  assert.equal(walls.get('4,3'), 'wall-h', 'the side ends one cell before the shore');
  assert.equal(walls.get('4,19'), 'wall-h');
  assert.ok(![...walls.keys()].some((id) => id.startsWith('3,')), 'no wall on the shore');
  assert.equal(walls.get('3,11'), undefined, 'no wall faces the sea');
  // A ring clear of the sea stays closed.
  assert.equal(wallRing(westPort(), 11, 7)?.size, 56);
  // The same port with its sea on the north runs its sides north.
  const north = {
    ...crossTown(),
    sea: (_x = 0, y = 0) => y <= 3,
    side: /** @type {const} */ ('n'),
  };
  const up = /** @type {Map<string, string>} */ (wallRing(north, 11, 8));
  assert.equal(up.get('3,19'), 'wall-corner-ne');
  assert.equal(up.get('3,4'), 'wall-v');
  assert.equal(up.get('11,19'), 'gate-h');
  assert.equal(up.get('3,11'), 'gate-v');
});

test('a port wall refuses a far side on the shore, a side with no shore, or a bad street', () => {
  const far = westPort((x, y) => x <= 3 || (x === 19 && y === 10));
  assert.equal(wallRing(far, 11, 8), null, 'the far side meets the shore');
  const corner = westPort((x, y) => x <= 3 || (x === 19 && y === 3));
  assert.equal(wallRing(corner, 11, 8), null, 'a far corner meets the shore');
  const pond = westPort((x, y) => x === 3 && y === 11);
  assert.equal(wallRing(pond, 11, 8), null, 'the sides reach the border first');
  const along = westPort();
  along.roads.join(5, 3, 'e');
  assert.equal(wallRing(along, 11, 8), null, 'a street along a side');
  const bent = westPort();
  bent.roads.join(20, 5, 'w');
  bent.roads.join(19, 5, 's');
  assert.equal(wallRing(bent, 11, 8), null, 'a street that turns on the far side');
});

test('wallRadii lists the rings a large town tries, clear of the map border', () => {
  assert.deepEqual(wallRadii(14, 7, 4), []);
  assert.deepEqual(wallRadii(22, 11, 7), [8, 7], 'a ring of 9 comes too near the border');
  assert.deepEqual(wallRadii(48, 24, 14), [15, 16, 14]);
});

test('planWall builds a ring for a large town only, and only when one fits', () => {
  const always = () => 0;
  assert.equal(planWall({ ...crossTown(), size: 14 }, 7, 4, always).size, 0);
  assert.equal(planWall(crossTown(), 11, 7, () => 0.9).size, 0);
  const walls = planWall(crossTown(), 11, 7, always);
  assert.equal(walls.get('3,3'), 'wall-corner-se', 'one cell past the core');
  const blocked = crossTown();
  for (const r of [7, 8, 9]) blocked.roads.join(11 - r, 11 - r, 'e');
  assert.equal(planWall(blocked, 11, 7, always).size, 0);
});
