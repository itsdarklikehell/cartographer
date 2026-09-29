import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fullRef, mapOverlay, shortRef } from '../src/storage/TileRefs.js';
import { buildBuiltins } from '../src/map/TileCatalog.js';

test('every built-in path stores as its palette id and reads back', () => {
  for (const entry of buildBuiltins()) {
    assert.equal(shortRef(entry.imageRef), entry.id);
    assert.equal(fullRef(entry.id), entry.imageRef);
  }
});

test('the palette ids of the catalog are distinct and bare', () => {
  const ids = buildBuiltins().map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(/[/:=]/.test(id), false, id);
});

test('a ref with a slash or a colon passes through both ways', () => {
  for (const ref of [
    'assets/tiles/grass/grass-9.svg',
    'custom/grass-1',
    'asset:abc~1',
    'data:image/png;base64,AAAA',
  ]) {
    assert.equal(shortRef(ref), ref);
    assert.equal(fullRef(ref), ref);
  }
});

test('a bare live ref that reads as a short form gets the escape', () => {
  for (const ref of ['grass-1', '=grass-1', '=', 'settlement']) {
    const stored = shortRef(ref);
    assert.equal(stored, `=${ref}`);
    assert.equal(fullRef(stored), ref);
  }
  // A bare ref that no short form uses stays as written.
  for (const ref of ['lava', '', 'grass']) {
    assert.equal(shortRef(ref), ref);
    assert.equal(fullRef(ref), ref);
  }
});

test('fullRef passes a value that is not a string through', () => {
  assert.equal(fullRef(42), 42);
  assert.equal(fullRef(null), null);
});

test('mapOverlay maps a ref and a stack, and passes anything else through', () => {
  const upper = (/** @type {string} */ ref) => ref.toUpperCase();
  assert.equal(mapOverlay('a', upper), 'A');
  assert.deepEqual(mapOverlay(['a', 'b'], upper), ['A', 'B']);
  assert.equal(mapOverlay(null, upper), null);
  assert.equal(mapOverlay(7, upper), 7);
});
