import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_CELL_LIMIT, revealRoom } from '../src/map/RoomReveal.js';
import { litRooms, revealSight } from '../src/party/Sight.js';
import { PartyTracker } from '../src/party/PartyTracker.js';
import { revealedCount } from '../src/map/FogOfWar.js';
import { tileAt, withNodeTiles } from '../src/map/TileIndex.js';
import { interiorArt } from '../src/map/TileKinds.js';
import { TileGrid, createMapNode, createTile } from '../src/map/TileGrid.js';
import { gridTiles } from './helpers/grid.js';

/**
 * An interior node drawn from rows of characters: `#` wall, `D` door,
 * `c` a counter on a floor, `.` floor, and a space for a cell with no tile.
 * @param {string[]} rows
 * @param {string | null} [environ]
 */
function interior(rows, environ = 'inn') {
  const node = createMapNode('hall', 'Hall', 'town', rows[0].length, rows.length, {
    kind: 'interior',
    environ,
  });
  const tiles = gridTiles(node.width, node.height, (id, x, y) => {
    const ch = rows[y][x];
    if (ch === ' ') return null;
    if (ch === '#') return createTile(id, interiorArt('wall-h'));
    if (ch === 'D') return createTile(id, interiorArt('door-v'));
    const overlayRef = ch === 'c' ? interiorArt('counter') : null;
    return createTile(id, interiorArt('floor-1'), { overlayRef });
  });
  return withNodeTiles(node, tiles);
}

/** Two rooms of nine floor tiles each, joined by one door at 4,2. */
const TWO_ROOMS = ['#########', '#...#...#', '#...D...#', '#.c.#...#', '#########'];

const shown = (node, id) => tileAt(node, id)?.revealed;

test('a room reveal opens the room and its walls and doors, and stops there', () => {
  const node = interior(TWO_ROOMS);
  const lit = revealRoom(node, '1,1', { maxCells: 50 });
  // Nine floor tiles (the counter does not split the room) and 16 bounds.
  assert.equal(revealedCount(lit), 25);
  assert.ok(shown(lit, '2,3'), 'the counter tile is part of the room');
  assert.ok(shown(lit, '4,2'), 'the door shows');
  assert.ok(shown(lit, '0,0'), 'the corner wall shows');
  assert.ok(!shown(lit, '5,2'), 'the room past the door stays dark');
  assert.equal(revealRoom(lit, '2,2', { maxCells: 50 }), lit, 'nothing new returns the node');
});

test('a party in a door sees into the rooms on both sides', () => {
  const node = interior(TWO_ROOMS);
  const lit = revealRoom(node, '4,2', { maxCells: 50 });
  assert.equal(revealedCount(lit), node.tiles.length);
});

test('a room past the cell limit reveals nothing', () => {
  const node = interior(TWO_ROOMS);
  assert.equal(revealRoom(node, '1,1', { maxCells: 8 }), node);
  assert.notEqual(revealRoom(node, '1,1', { maxCells: 9 }), node);
});

test('a wall, an off-grid id, or an empty cell reveals nothing', () => {
  const node = interior(['#.#', '# #']);
  assert.equal(revealRoom(node, '0,0'), node);
  assert.equal(revealRoom(node, 'nope'), node);
  assert.equal(revealRoom(node, '1,1'), node);
  assert.equal(revealRoom(node, '9,9'), node);
});

test('lit rooms belong to set environs other than dungeon, cave, and cellar', () => {
  assert.equal(litRooms(interior(TWO_ROOMS, 'inn')), true);
  assert.equal(litRooms(interior(TWO_ROOMS, 'dungeon')), false);
  assert.equal(litRooms(interior(TWO_ROOMS, 'cave')), false);
  assert.equal(litRooms(interior(TWO_ROOMS, 'cellar')), false);
  assert.equal(litRooms(interior(TWO_ROOMS, null)), false);
  assert.equal(litRooms(createMapNode('v', 'Vale', 'w', 2, 2, { environ: 'inn' })), false);
});

test('revealSight adds the room on a lit map and only the disc on a dark one', () => {
  const rows = ['###########', '#...#.....#', '#...D.....#', '#...#.....#', '###########'];
  const lit = revealSight(interior(rows), ['1,2'], 0);
  assert.ok(shown(lit, '3,1') && shown(lit, '4,2'));
  assert.ok(!shown(lit, '5,2'));
  const dark = revealSight(interior(rows, 'dungeon'), ['1,2'], 0);
  assert.equal(revealedCount(dark), 1);
  const walked = revealSight(interior(rows), ['1,1', '1,2', '2,2', '4,2'], 0);
  assert.equal(revealedCount(walked), rows.join('').length, 'a walk fills each room it passes');
});

test('the party tracker reveals the room of the tile it moves to', () => {
  const node = interior(TWO_ROOMS);
  const grid = new TileGrid();
  grid.addNode(node);
  const tracker = new PartyTracker(grid, { nodeId: 'hall', tileId: '1,1' }, { sight: () => 0 });
  const after = /** @type {any} */ (grid.getNode('hall'));
  assert.equal(revealedCount(after), 25);
  assert.equal(tracker.reveal(after, ['1,2']), after);
});

test('a room of more than the cell limit reveals nothing by default', () => {
  const big = interior(Array.from({ length: 11 }, () => '.'.repeat(10)));
  assert.equal(revealRoom(big, '1,1'), big);
  assert.ok(ROOM_CELL_LIMIT < 110);
});

test('a door on the map edge fills from its neighbours inside the map', () => {
  const node = interior(['D..']);
  assert.equal(revealedCount(revealRoom(node, '0,0')), 3);
});

test('a wall beside a door opens nothing on its side', () => {
  assert.equal(revealedCount(revealRoom(interior(['#D.']), '1,0')), 2);
  assert.equal(revealedCount(revealRoom(interior(['.D#']), '1,0')), 2);
});
