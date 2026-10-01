import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxesOverlap, labelSpots, placeLabels } from '../src/map/RegionLabels.js';

test('labelSpots lists the cells in reading order, then above and below the region', () => {
  const cells = [
    { x: 3, y: 3 },
    { x: 2, y: 2 },
    { x: 3, y: 2 },
    { x: 2, y: 3 },
  ];
  assert.deepEqual(labelSpots(cells, 10), [
    { x: 2, y: 2, above: false },
    { x: 3, y: 2, above: false },
    { x: 2, y: 3, above: false },
    { x: 3, y: 3, above: false },
    { x: 2, y: 2, above: true },
    { x: 2, y: 4, above: false },
  ]);
});

test('labelSpots leaves out the outside spots on the first and last rows of the map', () => {
  assert.deepEqual(labelSpots([{ x: 1, y: 0 }], 1), [{ x: 1, y: 0, above: false }]);
});

test('labelSpots puts the spot below at the left end of the bottom row', () => {
  const cells = [
    { x: 4, y: 1 },
    { x: 5, y: 2 },
    { x: 6, y: 2 },
  ];
  assert.deepEqual(labelSpots(cells, 10).at(-1), { x: 5, y: 3, above: false });
});

test('labelSpots gives no spot for a region with no cell', () => {
  assert.deepEqual(labelSpots([], 10), []);
});

test('boxesOverlap is true for crossing boxes and false for boxes that only touch', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(boxesOverlap(a, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(boxesOverlap(a, { x: 10, y: 0, w: 10, h: 10 }), false);
  assert.equal(boxesOverlap(a, { x: 0, y: 10, w: 10, h: 10 }), false);
  assert.equal(boxesOverlap(a, { x: 11, y: 0, w: 10, h: 10 }, 2), true);
});

/** A box 30 wide and 10 high at a spot, with a cell size of 20. */
const boxAt = (/** @type {number} */ _i, /** @type {{ x: number, y: number }} */ s) => ({
  x: s.x * 20,
  y: s.y * 20,
  w: 30,
  h: 10,
});

test('placeLabels keeps the first spot of each label that is clear', () => {
  const boxes = placeLabels(
    [[{ x: 0, y: 0, above: false }], [{ x: 3, y: 0, above: false }]],
    boxAt,
  );
  assert.deepEqual(boxes, [
    { x: 0, y: 0, w: 30, h: 10 },
    { x: 60, y: 0, w: 30, h: 10 },
  ]);
});

test('placeLabels moves a label that overlaps an earlier one to its next spot', () => {
  const boxes = placeLabels(
    [
      [{ x: 0, y: 0, above: false }],
      [
        { x: 1, y: 0, above: false },
        { x: 1, y: 1, above: false },
      ],
    ],
    boxAt,
  );
  assert.deepEqual(boxes[1], { x: 20, y: 20, w: 30, h: 10 });
});

test('placeLabels leaves out a label with no clear spot, and only builds the boxes it tries', () => {
  /** @type {number[]} */
  const tried = [];
  const boxes = placeLabels(
    [
      [
        { x: 0, y: 0, above: false },
        { x: 0, y: 5, above: false },
      ],
      [{ x: 1, y: 0, above: false }],
      [{ x: 0, y: 3, above: false }],
    ],
    (i, s) => {
      tried.push(i);
      return boxAt(i, s);
    },
  );
  assert.equal(boxes[1], null);
  assert.deepEqual(boxes[2], { x: 0, y: 60, w: 30, h: 10 });
  assert.deepEqual(tried, [0, 1, 2]);
});

test('placeLabels keeps the gap between two labels', () => {
  const spots = [[{ x: 0, y: 0, above: false }], [{ x: 0, y: 0.55, above: false }]];
  assert.notEqual(placeLabels(spots, boxAt)[1], null);
  assert.equal(placeLabels(spots, boxAt, 2)[1], null);
});

test('placeLabels skips a spot that overlaps a blocked box', () => {
  const spots = [
    [
      { x: 0, y: 1, above: false },
      { x: 0, y: 1, above: true },
    ],
  ];
  const at = (
    /** @type {number} */ _i,
    /** @type {{ x: number, y: number, above: boolean }} */ s,
  ) => ({
    x: s.x * 10,
    y: s.above ? s.y * 10 - 5 : s.y * 10,
    w: 10,
    h: 5,
  });
  const blocked = [{ x: 0, y: 10, w: 10, h: 10 }];
  assert.deepEqual(placeLabels(spots, at, 0, blocked), [{ x: 0, y: 5, w: 10, h: 5 }]);
  assert.deepEqual(placeLabels([[spots[0][0]]], at, 0, blocked), [null]);
});
