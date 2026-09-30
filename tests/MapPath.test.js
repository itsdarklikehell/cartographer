import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath, hasOpenPath, isPassable } from '../src/map/MapPath.js';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { townWallArt } from '../src/map/TileKinds.js';
import { gridTiles } from './helpers/grid.js';

/**
 * A node drawn from rows of characters: `.` grass, `#` a town wall, `g` a
 * gate, `~` deep water, `L` grass that links to a sub-map, `f` fogged grass,
 * and a space an empty cell. Every tile except `f` starts revealed.
 * @param {string[]} rows
 */
function nodeOf(rows) {
  const width = rows[0].length;
  const tiles = gridTiles(width, rows.length, (id, x, y) => {
    const c = rows[y][x];
    if (c === ' ') return null;
    const art =
      {
        '#': townWallArt('wall-h'),
        g: townWallArt('gate-h'),
        '~': 'assets/tiles/deep-water/deep-water-1.svg',
      }[c] ?? 'grass.svg';
    const link = c === 'L' ? { childNodeId: 'child' } : {};
    return { ...createTile(id, art), ...link, revealed: c !== 'f' };
  });
  return withNodeTiles(createMapNode('n', 'N', null, width, rows.length), tiles);
}

const TOWN = nodeOf([
  '.....', //
  '.###.',
  '.#.#.',
  '.###.',
  '.....',
]);

test('a wall ring keeps a walk out, and a gate lets it in', () => {
  assert.equal(hasOpenPath(TOWN, '0,0', '2,2'), false);
  assert.equal(hasOpenPath(TOWN, '0,0', '4,4'), true, 'around the ring');
  const gated = nodeOf(['.....', '.#g#.', '.#.#.', '.###.', '.....']);
  assert.equal(hasOpenPath(gated, '0,0', '2,2'), true);
});

test('no walk ends on a wall, but a walk can start on one', () => {
  assert.equal(hasOpenPath(TOWN, '0,0', '1,1'), false);
  assert.equal(hasOpenPath(TOWN, '1,1', '0,0'), true);
  assert.equal(hasOpenPath(TOWN, '1,1', '1,1'), true, 'the start tile itself');
});

test('a walk steps to side neighbours only', () => {
  const corner = nodeOf(['.#', '#.']);
  assert.equal(hasOpenPath(corner, '0,0', '1,1'), false);
});

test('an empty cell lets a walk through but is never its end', () => {
  const gap = nodeOf(['.. ..']);
  assert.equal(hasOpenPath(gap, '0,0', '1,0'), true);
  assert.equal(hasOpenPath(gap, '0,0', '3,0'), true, 'across the gap');
  assert.equal(hasOpenPath(gap, '0,0', '3,0', { revealedOnly: true }), false, 'a player walk');
  // The gap does not open a way around a wall ring.
  const ring = nodeOf(['     ', ' ### ', ' #.# ', ' ### ', '.    ']);
  assert.equal(hasOpenPath(ring, '0,4', '2,2'), false);
  assert.equal(hasOpenPath(gap, '0,0', '2,0'), false, 'the empty target');
  assert.equal(hasOpenPath(gap, '2,0', '0,0'), false, 'the empty start');
  assert.equal(hasOpenPath(gap, 'x', '0,0'), false);
  assert.equal(hasOpenPath(gap, '0,0', 'x'), false);
  assert.equal(hasOpenPath(gap, '0,0', '9,0'), false);
});

test('with revealedOnly, a fogged tile stops a walk', () => {
  const fog = nodeOf(['.f.', '...']);
  assert.equal(hasOpenPath(fog, '0,0', '2,0', { revealedOnly: true }), true, 'around below');
  const band = nodeOf(['.f.', '.f.']);
  assert.equal(hasOpenPath(band, '0,0', '2,0'), true);
  assert.equal(hasOpenPath(band, '0,0', '2,0', { revealedOnly: true }), false);
  assert.equal(hasOpenPath(band, '0,0', '1,0', { revealedOnly: true }), false, 'fogged target');
});

test('isPassable reads the wall rule and, on request, the fog', () => {
  const [wall, gate, fogged] = [TOWN.tiles[6], nodeOf(['g']).tiles[0], nodeOf(['f']).tiles[0]];
  assert.equal(isPassable(wall, false), false);
  assert.equal(isPassable(gate, true), true);
  assert.equal(isPassable(fogged, false), true);
  assert.equal(isPassable(fogged, true), false);
});

test('findPath lists every tile of the shortest walk, start and target included', () => {
  assert.deepEqual(findPath(nodeOf(['...']), '0,0', '2,0'), ['0,0', '1,0', '2,0']);
  assert.deepEqual(findPath(TOWN, '0,0', '0,0'), ['0,0'], 'the start tile itself');
  assert.equal(findPath(TOWN, '0,0', '2,2'), null);
  assert.equal(findPath(TOWN, '0,1', '4,1')?.length, 7, 'around the top of the ring');
  assert.deepEqual(findPath(nodeOf(['. .']), '0,0', '2,0'), ['0,0', '1,0', '2,0'], 'a gap');
});

test('deep water stops a walk, and a move cannot end on it', () => {
  const lake = nodeOf(['.~.', '...']);
  assert.deepEqual(findPath(lake, '0,0', '2,0'), ['0,0', '0,1', '1,1', '2,1', '2,0']);
  assert.equal(findPath(nodeOf(['.~.']), '0,0', '2,0'), null);
  assert.equal(findPath(lake, '0,0', '1,0'), null, 'the water target');
  assert.equal(isPassable(lake.tiles[1], false), false);
});

test('a walk goes around a link tile, and through it only when no other way exists', () => {
  const beside = findPath(nodeOf(['.L.', '...']), '0,0', '2,0');
  assert.deepEqual(beside, ['0,0', '0,1', '1,1', '2,1', '2,0']);
  assert.deepEqual(findPath(nodeOf(['.L.']), '0,0', '2,0'), ['0,0', '1,0', '2,0']);
  assert.deepEqual(findPath(nodeOf(['.L']), '0,0', '1,0'), ['0,0', '1,0'], 'the link target');
});
