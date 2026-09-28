import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { generateDungeon, roomLinks } from '../src/map/GeneratorInteriors.js';
import { generateCave, growCavern } from '../src/map/GeneratorCave.js';
import { generateBuilding, generateCastle, hallLayout } from '../src/map/GeneratorHalls.js';
import { DOOR_H, DOOR_V, FLOOR, WALL } from '../src/map/GeneratorInteriorMask.js';
import { generateLevels } from '../src/map/MapGenerator.js';
import { mulberry32 } from '../src/util/Rng.js';

const palette = new TilePalette();

test('roomLinks spans every room and adds loops between near rooms', () => {
  const centers = /** @type {[number, number][]} */ (
    Array.from({ length: 14 }, (_, i) => [(i % 4) * 5, Math.floor(i / 4) * 5])
  );
  const links = roomLinks(centers, () => 0.9);
  assert.equal(links.length, 13 + 2, 'a tree of 13 links plus two loops');
  const reached = new Set([0]);
  for (let pass = 0; pass < 14; pass++) {
    for (const [a, b] of links) if (reached.has(a) || reached.has(b)) reached.add(a).add(b);
  }
  assert.equal(reached.size, 14);
  assert.equal(roomLinks(centers, () => 0).length, 13, 'a low roll skips every loop');
  assert.deepEqual(
    roomLinks([[1, 1]], () => 0),
    [],
  );
});

test('a vast dungeon has more rooms, some of them round', () => {
  const gen = generateDungeon(palette, 48, mulberry32(8));
  const floor = new Set(gen.tiles.filter((t) => !/wall|door/.test(t.imageRef)).map((t) => t.id));
  assert.ok(floor.size > 400, `vast dungeons are big: ${floor.size}`);
  // A round room leaves a wall cell in the corner of its floor block. The
  // wall has floor to its east, south, and southeast, and wall past both
  // of those floor cells, where a corridor would have floor instead.
  const walls = new Set(gen.tiles.filter((t) => t.imageRef.includes('wall-')).map((t) => t.id));
  const trimmed = [...walls].some((id) => {
    const [x, y] = id.split(',').map(Number);
    const f = (/** @type {number} */ dx, /** @type {number} */ dy) =>
      floor.has(`${x + dx},${y + dy}`);
    const w = (/** @type {number} */ dx, /** @type {number} */ dy) =>
      walls.has(`${x + dx},${y + dy}`);
    return f(1, 0) && f(0, 1) && f(1, 1) && f(2, 0) && f(0, 2) && w(1, -1) && w(-1, 1);
  });
  assert.ok(trimmed, 'some room has a trimmed corner');
});

test('growCavern keeps one connected cavern inside a rock border', () => {
  const size = 22;
  const cells = growCavern(size, mulberry32(5));
  const open = cells.flatMap((c, i) => (c === FLOOR ? [i] : []));
  assert.ok(open.length > size * 2);
  for (const i of open) {
    const x = i % size;
    const y = Math.floor(i / size);
    assert.ok(x > 0 && y > 0 && x < size - 1 && y < size - 1, 'the border stays rock');
  }
  const seen = new Set([open[0]]);
  const queue = [open[0]];
  while (queue.length) {
    const i = /** @type {number} */ (queue.pop());
    for (const j of [i - 1, i + 1, i - size, i + size]) {
      if (cells[j] === FLOOR && !seen.has(j)) {
        seen.add(j);
        queue.push(j);
      }
    }
  }
  assert.equal(seen.size, open.length, 'one cavern');
  assert.equal(
    growCavern(8, () => 0).some((c) => c === FLOOR),
    false,
    'solid rock has no cavern',
  );
});

test('a cave with no cavern falls back to a small room with both stairs', () => {
  const gen = generateCave(palette, 8, () => 0, { entrance: 'stairs' });
  const up = gen.tiles.find((t) => t.imageRef.includes('stairs-up'));
  assert.equal(gen.entry, up?.id, 'a stairs level enters on its stairs up');
  assert.ok(gen.stairsDown);
  assert.equal(gen.tiles.filter((t) => /floor|stairs/.test(t.imageRef)).length, 9);
  assert.ok(!gen.tiles.some((t) => t.imageRef.includes('door')));
});

test('a cave enters through a border door and descends by default', () => {
  const size = 14;
  const gen = generateCave(palette, size, mulberry32(2));
  const [x, y] = gen.entry.split(',').map(Number);
  assert.ok(x === 0 || y === 0 || x === size - 1 || y === size - 1);
  assert.match(gen.tiles.find((t) => t.id === gen.entry)?.imageRef ?? '', /cave-mouth/);
  assert.ok(gen.stairsDown);
});

test('cave levels chain through their stairs like dungeon levels', () => {
  const ids = ['c2', 'c3'];
  const levels = generateLevels(
    palette,
    { archetype: 'cave', size: 'medium', levels: 3 },
    mulberry32(4),
    () => /** @type {string} */ (ids.shift()),
  );
  assert.deepEqual(
    levels.map((l) => l.id),
    [null, 'c2', 'c3'],
  );
  const down = levels[0].tiles.find((t) => t.imageRef.includes('stairs-down'));
  assert.equal(down?.childNodeId, 'c2');
});

test('hall walls split rooms with one door each and never block a door', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const size = 22;
    const { cells, rooms } = hallLayout(size, mulberry32(seed), { minRoom: 2, maxDepth: 6 });
    assert.ok(rooms.length >= 4, `seed ${seed}: rooms ${rooms.length}`);
    for (const room of rooms) {
      assert.ok(room.x1 - room.x0 >= 1 && room.y1 - room.y0 >= 1, 'rooms keep the minimum side');
    }
    // Each door has floor on both sides along its crossing axis.
    cells.forEach((code, i) => {
      const x = i % size;
      const y = Math.floor(i / size);
      if (code === DOOR_V) {
        assert.equal(cells[i - 1], FLOOR, `seed ${seed}: door ${x},${y} west`);
        assert.equal(cells[i + 1], FLOOR, `seed ${seed}: door ${x},${y} east`);
      }
      if (code === DOOR_H && y < size - 1) {
        assert.equal(cells[i - size], FLOOR, `seed ${seed}: door ${x},${y} north`);
        assert.equal(cells[i + size], FLOOR, `seed ${seed}: door ${x},${y} south`);
      }
    });
    const doors = cells.filter((c) => c === DOOR_H || c === DOOR_V).length;
    assert.equal(doors, rooms.length, 'one door per split plus the entrance');
    assert.equal(cells[size - 1], WALL);
  }
});

test('a castle has stairs and a building has none', () => {
  const castle = generateCastle(palette, 22, mulberry32(3));
  assert.ok(castle.tiles.some((t) => t.imageRef.includes('stairs-up')));
  assert.ok(castle.tiles.some((t) => t.imageRef.includes('stairs-down')));
  const building = generateBuilding(palette, 14, mulberry32(3));
  assert.equal(building.tiles.length, 14 * 14);
  assert.ok(!building.tiles.some((t) => t.imageRef.includes('stairs')));
  assert.ok(building.tiles.filter((t) => t.imageRef.includes('door')).length >= 3);
});
