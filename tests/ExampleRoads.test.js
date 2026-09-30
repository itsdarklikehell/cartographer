import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintRoadTo, roadArms } from '../src/campaign/ExampleRoads.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { createTile } from '../src/map/TileGrid.js';

const palette = new TilePalette();
/** @param {string} id */
const art = (id) =>
  /^(road|river)-/.test(id)
    ? /** @type {string} */ (palette.get(id)?.imageRef)
    : `assets/tiles/${id}/${id}-1.svg`;

/**
 * A map drawn from rows of characters: `.` grass, `^` mountain, `~` water,
 * `-` an east-west road, `*` grass with a river overlay.
 * @param {string[]} rows
 */
function mapOf(rows) {
  const tiles = rows.flatMap((row, y) =>
    [...row].map((ch, x) => {
      const id = `${x},${y}`;
      if (ch === '^') return createTile(id, art('mountain'));
      if (ch === '~') return createTile(id, art('water'));
      if (ch === '-') return createTile(id, art('grass'), { overlayRef: art('road-h') });
      if (ch === '*') return createTile(id, art('grass'), { overlayRef: art('river-v') });
      return createTile(id, art('grass'));
    }),
  );
  return { tiles };
}

/** @param {{ tiles: import('../src/types/map.js').Tile[] }} gen @param {string} id */
const at = (gen, id) =>
  /** @type {import('../src/types/map.js').Tile} */ (gen.tiles.find((t) => t.id === id));

test('roadArms reads the arms of a road piece and gives none off the road', () => {
  const gen = mapOf(['-.']);
  assert.deepEqual(roadArms(at(gen, '0,0')), ['e', 'w']);
  assert.deepEqual(roadArms(at(gen, '1,0')), []);
});

test('paintRoadTo lays the shortest spur off the road around blocked ground', () => {
  const gen = mapOf(['---^', '.^..', '~~..', '....']);
  const path = paintRoadTo(gen, palette, '3,3', 'e');
  assert.equal(path?.length, 5);
  assert.equal(path?.[0], '2,0', 'the spur leaves the road at its nearest tile');
  assert.equal(path?.[4], '3,3');
  // The road tile where the spur starts gains a third arm, and the gate opens east.
  assert.equal(roadArms(at(gen, '2,0')).length, 3);
  assert.deepEqual(roadArms(at(gen, '3,3')).sort(), ['e', 'n']);
  assert.equal(at(gen, '3,3').overlayRef, art('road-corner-ne'));
});

test('paintRoadTo paints nothing when no spur reaches the gate', () => {
  const walled = mapOf(['-^.']);
  assert.equal(paintRoadTo(walled, palette, '2,0', 'e'), null);
  assert.equal(at(walled, '2,0').overlayRef, null);
  const roadless = mapOf(['..']);
  assert.equal(paintRoadTo(roadless, palette, '1,0', 'e'), null);
  const river = mapOf(['-*.']);
  assert.equal(paintRoadTo(river, palette, '2,0', 'e'), null);
});
