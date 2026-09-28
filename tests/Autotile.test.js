import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  smoothCoastline,
  coastKind,
  coastOverlays,
  connectorKind,
  ArmNetwork,
} from '../src/map/Autotile.js';

/** Build a cells array from rows of single-char codes: ~ water, . grass. */
function cellsFrom(rows) {
  return rows
    .join('')
    .split('')
    .map((c) => (c === '~' ? 'water' : 'grass'));
}

test('smoothCoastline drowns isthmuses and spits the coast pieces cannot draw', () => {
  // A land cell with water on opposite sides...
  const isthmus = cellsFrom(['~.~']);
  assert.deepEqual(smoothCoastline(isthmus, 3, 1), ['water', 'water', 'water']);
  // ...or three sides becomes water; a clean straight shore is untouched.
  const spit = cellsFrom(['.~.', '..~', '.~.']);
  assert.equal(smoothCoastline(spit, 3, 3)[4], 'water');
  const shore = cellsFrom(['~~~', '...', '...']);
  assert.deepEqual(smoothCoastline(shore, 3, 3), shore);
});

test('coastKind names the water edges: straights, outer corners, inner corners', () => {
  assert.equal(coastKind(true, false, false, false, false, false, false, false), 'n');
  assert.equal(coastKind(false, false, false, true, false, false, false, false), 'w');
  assert.equal(coastKind(true, true, false, false, false, false, false, false), 'corner-ne');
  assert.equal(coastKind(false, false, true, true, false, false, false, false), 'corner-sw');
  assert.equal(coastKind(false, false, false, false, true, false, false, false), 'inner-ne');
  assert.equal(coastKind(false, false, false, false, false, false, true, false), 'inner-sw');
  assert.equal(coastKind(false, false, false, false, false, false, false, false), null);
});

test('coastOverlays rings a lake with matching shoreline pieces', () => {
  const cells = cellsFrom(['....', '.~~.', '.~~.', '....']);
  const coast = coastOverlays(cells, 4, 4);
  assert.equal(coast.get('1,0'), 's'); // water below
  assert.equal(coast.get('0,1'), 'e'); // water to the east
  assert.equal(coast.get('3,2'), 'w');
  assert.equal(coast.get('2,3'), 'n');
  assert.equal(coast.get('0,0'), 'inner-se'); // touches the lake only diagonally
  assert.equal(coast.get('3,3'), 'inner-nw');
  assert.equal(coast.get('1,1'), undefined, 'water cells get no overlay');
});

test('connectorKind names every arm set with the shared road and river pieces', () => {
  const kind = (/** @type {string} */ arms) => connectorKind(new Set(arms.split('')));
  assert.equal(kind('nesw'), 'cross');
  assert.equal(kind('new'), 'tee-n');
  assert.equal(kind('nse'), 'tee-e');
  assert.equal(kind('sew'), 'tee-s');
  assert.equal(kind('nsw'), 'tee-w');
  assert.equal(kind('ns'), 'v');
  assert.equal(kind('ew'), 'h');
  assert.equal(kind('ne'), 'corner-ne');
  assert.equal(kind('nw'), 'corner-nw');
  assert.equal(kind('se'), 'corner-se');
  assert.equal(kind('sw'), 'corner-sw');
  assert.equal(kind('e'), 'end-e');
  assert.equal(connectorKind(new Set()), null);
});

test('ArmNetwork joins cells across an edge and keeps side-by-side channels apart', () => {
  const net = new ArmNetwork();
  // Two parallel north-south channels in columns 0 and 1 never join, even
  // though their cells touch.
  net.join(0, 0, 's');
  net.join(1, 0, 's');
  assert.equal(net.pieces().get('0,0'), 'end-s');
  assert.equal(net.pieces().get('0,1'), 'end-n');
  assert.equal(net.pieces().get('1,1'), 'end-n');
  net.add(0, 1, 's');
  assert.equal(net.pieces().get('0,1'), 'v');
  assert.deepEqual([...net.at(5, 5)], [], 'an empty cell has no arms');
  assert.ok(net.has(1, 1));
  // Dropping a cell leaves the arm that points at it, so a channel still
  // drains into whatever took the cell's place.
  net.drop(1, 1);
  assert.equal(net.has(1, 1), false);
  assert.equal(net.pieces().get('1,0'), 'end-s');
  assert.equal(net.arms.has('1,1'), false, 'the id map drops the cell too');
});

test('ArmNetwork keys cells off the map apart and finds a channel nearby', () => {
  const net = new ArmNetwork();
  net.add(-1, 0, 'e');
  net.add(0, -1, 's');
  assert.deepEqual([...net.at(-1, 0)], ['e']);
  assert.deepEqual([...net.at(0, -1)], ['s']);
  assert.equal(net.has(-1, -1) || net.has(0, 0), false, 'no two cells share a key');
  assert.equal(net.arms.get('-1,0'), net.at(-1, 0), 'both maps share the edge set');
  net.join(5, 5, 'e');
  assert.ok(net.near(5, 5, 0), 'the cell itself counts');
  assert.ok(net.near(3, 3, 2), 'a channel two cells off counts');
  assert.equal(net.near(2, 2, 2), false, 'a channel three cells off does not');
});
