import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fullRef, mapOverlay, shortRef, variesByCell } from '../src/storage/TileRefs.js';
import { buildBuiltins, variantCount, variantIdAt } from '../src/map/TileCatalog.js';

/** A cell whose position pick of grass is not `grass-1`. */
function cellAvoiding(/** @type {string} */ id) {
  for (let x = 0; ; x += 1) if (variantIdAt('grass', x, 0) !== id) return x;
}

test('every built-in path stores in a short form and reads back', () => {
  for (const entry of buildBuiltins()) {
    for (const [x, y] of [
      [0, 0],
      [3, 7],
      [11, 2],
    ]) {
      const stored = shortRef(entry.imageRef, x, y);
      const family = entry.id.replace(/-\d+$/, '');
      const picked = variantIdAt(family, x, y) === entry.id;
      assert.equal(stored, picked ? family : entry.id);
      assert.equal(fullRef(stored, x, y), entry.imageRef);
    }
  }
});

test('the short forms of the catalog are distinct and bare', () => {
  const ids = buildBuiltins().map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.equal(/[/:=]/.test(id), false, id);
    assert.equal(variantCount(id), 0, `${id} is also a family name`);
  }
});

test('a variant that differs from the position pick keeps its id', () => {
  const x = cellAvoiding('grass-1');
  const ref = 'assets/tiles/grass/grass-1.svg';
  assert.equal(shortRef(ref, x, 0), 'grass-1');
  assert.equal(fullRef('grass-1', x, 0), ref);
  // The type alone reads as the pick of the cell it is read at.
  const picked = /** @type {string} */ (variantIdAt('grass', x, 0));
  assert.equal(fullRef('grass', x, 0), `assets/tiles/grass/${picked}.svg`);
});

test('a ref with a slash or a colon passes through both ways', () => {
  for (const ref of [
    'assets/tiles/grass/grass-9.svg',
    'custom/grass-1',
    'asset:abc~1',
    'data:image/png;base64,AAAA',
  ]) {
    assert.equal(shortRef(ref, 0, 0), ref);
    assert.equal(fullRef(ref, 0, 0), ref);
  }
});

test('a bare live ref that reads as a short form gets the escape', () => {
  for (const ref of ['grass-1', 'grass', 'interior-floor', '=grass-1', '=', 'settlement']) {
    const stored = shortRef(ref, 0, 0);
    assert.equal(stored, `=${ref}`);
    assert.equal(fullRef(stored, 0, 0), ref);
  }
  // A bare ref that no short form uses stays as written.
  for (const ref of ['lava', '', 'constructor']) {
    assert.equal(shortRef(ref, 0, 0), ref);
    assert.equal(fullRef(ref, 0, 0), ref);
  }
});

test('only a type with variants varies by cell', () => {
  assert.equal(variesByCell('grass'), true);
  assert.equal(variesByCell('grass-1'), false);
  assert.equal(variesByCell('constructor'), false);
  assert.equal(variesByCell(null), false);
});

test('fullRef passes a value that is not a string through', () => {
  assert.equal(fullRef(42, 0, 0), 42);
  assert.equal(fullRef(null, 0, 0), null);
});

test('mapOverlay maps a ref and a stack, and passes anything else through', () => {
  const upper = (/** @type {string} */ ref) => ref.toUpperCase();
  assert.equal(mapOverlay('a', upper), 'A');
  assert.deepEqual(mapOverlay(['a', 'b'], upper), ['A', 'B']);
  assert.equal(mapOverlay(null, upper), null);
  assert.equal(mapOverlay(7, upper), 7);
});
