import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceRivers } from '../src/map/GeneratorRivers.js';
import { ARMS } from '../src/map/Autotile.js';
import { mulberry32 } from '../src/util/Rng.js';

/**
 * Build a field from rows of single-char codes: ~ water, M mountain, n
 * hills, anything else grass. Elevation falls from `top` at row 0 by one
 * per row unless `height` gives it per cell.
 * @param {string[]} rows
 * @param {(x: number, y: number) => number} [height]
 */
function fieldFrom(rows, height = (_x, y) => rows.length - y) {
  const size = rows.length;
  const code = { '~': 'water', M: 'mountain', n: 'hills' };
  const cells = rows
    .join('')
    .split('')
    .map((c) => code[/** @type {'~'} */ (c)] ?? 'grass');
  const elevation = new Float64Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) elevation[y * size + x] = height(x, y);
  return { size, cells, elevation };
}

/**
 * Every arm of every river cell leads to another river cell pointing back,
 * to water, or off the map.
 * @param {ReturnType<typeof fieldFrom>} field
 * @param {import('../src/map/Autotile.js').ArmNetwork} network
 */
function assertConnected(field, network) {
  const { size, cells } = field;
  for (const [id, arms] of network.arms) {
    const [x, y] = id.split(',').map(Number);
    assert.notEqual(cells[y * size + x], 'water', `${id} is not in water`);
    assert.notEqual(cells[y * size + x], 'mountain', `${id} is not on a mountain`);
    for (const arm of arms) {
      const [, dx, dy, back] = /** @type {[string, number, number]} */ (
        ARMS.find(([a]) => a === arm)
      ).concat({ n: 's', e: 'w', s: 'n', w: 'e' }[arm]);
      const nx = x + dx;
      const ny = y + dy;
      const off = nx < 0 || ny < 0 || nx >= size || ny >= size;
      const wet = !off && cells[ny * size + nx] === 'water';
      const joined = !off && network.at(nx, ny).has(/** @type {any} */ (back));
      assert.ok(off || wet || joined, `${id} arm ${arm} leads somewhere`);
    }
  }
}

test('a river runs downhill from the hills and drains into the lake', () => {
  const field = fieldFrom([
    '........',
    '.nnnnnn.',
    '........',
    '........',
    '........',
    '........',
    '~~~~~~~~',
    '~~~~~~~~',
  ]);
  const { network, ponds } = traceRivers(field, 1, mulberry32(2));
  assert.deepEqual(ponds, []);
  assert.ok(network.arms.size >= 4, 'the river reaches from row 1 to the shore');
  assertConnected(field, network);
  // The mouth sits on the shore row with an arm into the water.
  const mouth = [...network.arms].find(([id]) => id.endsWith(',5'));
  assert.ok(mouth?.[1].has('s'), 'the river empties south into the lake');
});

test('a second river joins the first as a tributary tee', () => {
  const size = 12;
  // Two ridges slope toward a central valley that drains south.
  const rows = Array.from({ length: size }, (_, y) =>
    y === 1 ? '.nn......nn.' : y === size - 1 ? '~'.repeat(size) : '.'.repeat(size),
  );
  const field = fieldFrom(rows, (x, y) => size - y + Math.abs(x - 6) * 1.5);
  const { network } = traceRivers(field, 2, mulberry32(1));
  assertConnected(field, network);
  const pieces = [...network.pieces().values()];
  assert.ok(
    pieces.some((p) => p.startsWith('tee-')),
    `the rivers meet: ${pieces.join(' ')}`,
  );
});

test('a river that boxes itself in ends in a pond', () => {
  // A bowl: the center is the lowest point and nothing drains off the map
  // because the rim is higher than everything inside.
  const size = 9;
  const rows = Array.from({ length: size }, () => '.'.repeat(size));
  rows[1] = '.nnnnnnn.';
  const field = fieldFrom(rows, (x, y) => Math.hypot(x - 4, y - 4));
  const { network, ponds } = traceRivers(field, 1, mulberry32(3));
  assert.equal(ponds.length, 1, 'the walk ends in one pond');
  const [pond] = ponds;
  assert.equal(network.has(pond % size, Math.floor(pond / size)), false, 'no channel on the pond');
});

test('a river on the border leaves the map when nothing inside is lower', () => {
  const size = 8;
  const rows = Array.from({ length: size }, () => '.'.repeat(size));
  rows[1] = '.nnnnnn.';
  // Ground falls to the west, so the river runs off the west edge.
  const field = fieldFrom(rows, (x) => x);
  const { network } = traceRivers(field, 1, mulberry32(5));
  assertConnected(field, network);
  assert.ok(
    [...network.arms].some(([id, arms]) => id.startsWith('0,') && arms.has('w')),
    'the channel exits through the west edge',
  );
});

test('a source with no room to run is dropped instead of drawn as a stub', () => {
  // The hills cell is walled in by mountains on three sides and the map
  // edge is two cells away, so any river would be shorter than three cells.
  const field = fieldFrom(['MMM', 'MnM', '~~~']);
  const { network } = traceRivers(field, 1, mulberry32(1));
  assert.equal(network.arms.size, 0);
});

test('no sources means no rivers', () => {
  const field = fieldFrom(['....', '....', '....', '....']);
  assert.equal(traceRivers(field, 3, mulberry32(1)).network.arms.size, 0);
});
