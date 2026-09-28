import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import {
  CAVE_ART,
  DOOR_H,
  DOOR_V,
  farthest,
  FLOOR,
  floorCells,
  maskTiles,
  tileStamper,
  tunnelToEdge,
  VOID,
  walkDistances,
  WALL,
  wrapWalls,
} from '../src/map/GeneratorInteriorMask.js';

const palette = new TilePalette();

/**
 * A mask from rows of single-char codes: `.` floor, `#` wall, `-` and `|`
 * doors in a horizontal and a vertical wall, anything else void.
 * @param {string[]} rows
 */
function maskFrom(rows) {
  const code = { '.': FLOOR, '#': WALL, '-': DOOR_H, '|': DOOR_V };
  return rows
    .join('')
    .split('')
    .map((c) => code[/** @type {'.'} */ (c)] ?? VOID);
}

test('wrapWalls seals floor and doors on all eight sides and leaves far void alone', () => {
  const cells = maskFrom(['     ', ' .   ', '   - ', '     ', '     ']);
  wrapWalls(cells, 5);
  assert.deepEqual(cells, maskFrom(['###  ', '#.###', '###-#', '  ###', '     ']));
});

test('tunnelToEdge cuts to the nearest side and sets the matching door', () => {
  const cases = [
    [2, 1, '2,0', DOOR_H],
    [2, 5, '2,6', DOOR_H],
    [1, 3, '0,3', DOOR_V],
    [5, 3, '6,3', DOOR_V],
  ];
  for (const [x, y, door, kind] of cases) {
    const cells = new Array(49).fill(VOID);
    assert.equal(tunnelToEdge(cells, 7, Number(x), Number(y)), door);
    const [dx, dy] = String(door).split(',').map(Number);
    assert.equal(cells[dy * 7 + dx], kind);
    assert.equal(cells[Number(y) * 7 + Number(x)], FLOOR, 'the start cell is floor');
  }
});

test('walkDistances walks floor and doors and farthest picks the far reachable cell', () => {
  const cells = maskFrom(['...#.', '#.#..', '#.-..']);
  const dist = walkDistances(cells, 5, 0, 0);
  assert.equal(dist[2 * 5 + 1], 3);
  assert.equal(dist[2 * 5 + 4], 6, 'the walk passes the door');
  assert.equal(dist[1 * 5 + 0], -1, 'walls stay unreached');
  assert.deepEqual(farthest(dist, 5, floorCells(cells, 5)), [4, 0]);
  assert.equal(farthest(dist, 5, [[0, 0]]), null, 'the start cell is never picked');
  const around = walkDistances(cells, 5, 0, 0, new Set([1 * 5 + 1]));
  assert.equal(around[2 * 5 + 1], -1, 'a blocked cell cuts the walk');
});

test('maskTiles skips void, joins walls to doors, and the stamper ignores missing ids', () => {
  const cells = maskFrom(['#-#', '|. ', '###']);
  const tiles = maskTiles(palette, cells, 3, () => 0);
  const byId = new Map(tiles.map((t) => [t.id, t.imageRef]));
  assert.equal(byId.has('2,1'), false);
  assert.match(byId.get('0,0') ?? '', /wall-corner-se/);
  assert.match(byId.get('1,0') ?? '', /door-h/);
  assert.match(byId.get('0,1') ?? '', /door-v/);
  assert.match(byId.get('1,1') ?? '', /floor-1/);
  const stamp = tileStamper(tiles, palette);
  stamp('2,1', 'stairs-up');
  stamp('1,1', 'stairs-up');
  assert.equal(tiles.length, 8);
  stamp('0,2', 'no-such-piece');
  assert.equal(tiles.find((t) => t.id === '0,2')?.imageRef, '', 'a missing piece draws nothing');
  assert.match(tiles.find((t) => t.id === '1,1')?.imageRef ?? '', /stairs-up/);
});

test('maskTiles draws a cave with one rough wall piece and cave mouths', () => {
  const cells = maskFrom(['#-#', '|..', '###']);
  const byId = new Map(
    maskTiles(palette, cells, 3, () => 0.6, CAVE_ART).map((t) => [t.id, t.imageRef]),
  );
  assert.match(byId.get('0,0') ?? '', /cave-wall/);
  assert.match(byId.get('2,2') ?? '', /cave-wall/);
  assert.match(byId.get('1,0') ?? '', /cave-mouth-h/);
  assert.match(byId.get('0,1') ?? '', /cave-mouth-v/);
  assert.match(byId.get('1,1') ?? '', /cave-floor-2/);
});
