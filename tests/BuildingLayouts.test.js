import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { BUILDING_LAYOUTS, furnishHalls } from '../src/map/GeneratorFurnish.js';
import { generateNodeTiles } from '../src/map/MapGenerator.js';
import { mulberry32 } from '../src/util/Rng.js';

/**
 * A recorder in place of a furnisher, which accepts every cell.
 * @returns {{ place: (x: number, y: number, kind: string) => boolean, log: string[] }}
 */
function recorder() {
  /** @type {string[]} */
  const log = [];
  return { place: (x, y, kind) => log.push(`${kind}@${x},${y}`) > 0, log };
}

/** The room behind the entrance, 5 cells wide and 5 deep. */
const FRONT = { x0: 1, y0: 5, x1: 5, y1: 9 };
/** A second room, which draws its role from the layout. */
const BACK = { x0: 1, y0: 1, x1: 3, y1: 3 };

/**
 * The furnishings that a building with `environ` puts in the two rooms,
 * with the role roll `roll` for the back room and `rest` for every later roll.
 * @param {string | undefined} environ @param {number} [roll] @param {number} [rest]
 */
function furnish(environ, roll = 0, rest = 0.99) {
  const { place, log } = recorder();
  let first = true;
  const rng = () => {
    const value = first ? roll : rest;
    first = false;
    return value;
  };
  furnishHalls(place, rng, [BACK, FRONT], { castle: false, entrance: [3, 9], environ });
  return log;
}

test('each environ furnishes the room behind the entrance in its own way', () => {
  const main = (/** @type {string | undefined} */ environ, rest = 0.99) =>
    furnish(environ, 0, rest).filter((entry) => Number(entry.split(',')[1]) >= FRONT.y0);
  assert.deepEqual(main('house'), ['hearth@3,5', 'table@3,7', 'table@2,7', 'table@4,7']);
  assert.deepEqual(main('inn'), main('house'));
  assert.deepEqual(main(undefined), main('house'), 'a building with no environ is a home');
  assert.deepEqual(main('constructor'), main('house'), 'an inherited key is no environ');
  assert.deepEqual(main('temple'), [
    'altar@3,5',
    'pillar@2,6',
    'pillar@2,8',
    'pillar@4,6',
    'pillar@4,8',
  ]);
  assert.deepEqual(main('barracks'), ['bed@1,5', 'bed@3,5', 'bed@5,5']);
  // A shop has a counter, and with low rolls its stock stands in the corners.
  assert.deepEqual(main('shop'), ['table@3,7']);
  assert.deepEqual(main('shop', 0.1), [
    'table@3,7',
    'barrel@1,5',
    'barrel@5,5',
    'barrel@1,9',
    'barrel@5,9',
    'chest@3,7',
  ]);
  assert.deepEqual(main('academy'), [
    'bookshelf@1,5',
    'bookshelf@2,5',
    'bookshelf@3,5',
    'bookshelf@4,5',
    'bookshelf@5,5',
    'table@3,7',
  ]);
  assert.deepEqual(main('warehouse'), []);
  assert.equal(main('warehouse', 0.1).length, 5);
});

test('a narrow temple hall has an altar and no colonnade', () => {
  const { place, log } = recorder();
  furnishHalls(place, () => 0.99, [{ x0: 1, y0: 1, x1: 3, y1: 3 }], {
    castle: false,
    entrance: [2, 3],
    environ: 'temple',
  });
  assert.deepEqual(log, ['altar@2,1']);
});

test('the other rooms of a building draw their roles from its environ', () => {
  for (const [environ, layout] of Object.entries(BUILDING_LAYOUTS)) {
    assert.ok(layout.roles.length > 0, environ);
  }
  // The first role of an inn is a bedroom and of a temple a chapel.
  assert.deepEqual(furnish('inn').slice(0, 1), ['bed@1,1']);
  assert.deepEqual(furnish('temple').slice(0, 1), ['altar@2,1']);
});

test('an inn, a temple, and a barracks from one seed get different rooms', () => {
  const palette = new TilePalette();
  const inside = (/** @type {string} */ environ) =>
    generateNodeTiles(palette, { archetype: 'building', size: 'small', environ }, mulberry32(4))
      .tiles.map((t) => t.overlayRef)
      .join('|');
  const inn = inside('inn');
  assert.notEqual(inside('temple'), inn);
  assert.notEqual(inside('barracks'), inn);
  assert.notEqual(inside('barracks'), inside('temple'));
});
