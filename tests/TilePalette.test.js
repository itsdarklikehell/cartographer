import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { TilePalette } from '../src/map/TilePalette.js';
import { DOCK_KINDS, isOverlayType, isTerrainType, isVariantType } from '../src/map/TileCatalog.js';
import { kindOf } from '../src/map/TileKinds.js';

test('TilePalette ships with built-in terrain variants', () => {
  const palette = new TilePalette();
  const grassVariants = palette.listVariants('grass');
  assert.equal(grassVariants.length, 3);
  assert.equal(palette.get('grass-1').custom, false);
  assert.equal(palette.get('grass-1').imageRef, 'assets/tiles/grass/grass-1.svg');
  const counts = {
    forest: 3,
    mountain: 5,
    water: 3,
    desert: 3,
    swamp: 3,
    snow: 3,
    hills: 3,
    farmland: 3,
    'deep-water': 3,
    jungle: 3,
    taiga: 4,
    savanna: 3,
    badlands: 5,
    volcanic: 3,
    glacier: 3,
    'snow-hills': 3,
    'snow-mountain': 5,
    plaza: 5,
  };
  for (const [type, count] of Object.entries(counts)) {
    assert.equal(
      palette.listVariants(type).length,
      count,
      `expected ${count} variants of "${type}"`,
    );
  }
});

test('TilePalette ships with built-in road connector pieces', () => {
  const palette = new TilePalette();
  const cross = palette.getRoadPiece('cross');
  assert.equal(cross.imageRef, 'assets/tiles/road/road-cross.svg');
  assert.equal(palette.getRoadPiece('tee-n').imageRef, 'assets/tiles/road/road-tee-n.svg');
  assert.equal(palette.listVariants('road').length, 15);
});

test('TilePalette ships with river connector and bridge pieces', () => {
  const palette = new TilePalette();
  assert.equal(palette.getRiverPiece('h').imageRef, 'assets/tiles/river/river-h.svg');
  assert.equal(
    palette.getRiverPiece('corner-ne').imageRef,
    'assets/tiles/river/river-corner-ne.svg',
  );
  assert.equal(palette.getRiverPiece('bridge-h').imageRef, 'assets/tiles/river/river-bridge-h.svg');
  assert.equal(palette.getRiverPiece('bridge-v').type, 'river');
  assert.equal(palette.getRiverPiece('ford-v').imageRef, 'assets/tiles/river/river-ford-v.svg');
  assert.equal(palette.listVariants('river').length, 19);
});

test('TilePalette ships with coast transition pieces', () => {
  const palette = new TilePalette();
  assert.equal(palette.getCoastPiece('n').imageRef, 'assets/tiles/coast/coast-n.svg');
  assert.equal(palette.getCoastPiece('w').id, 'coast-w');
  assert.equal(
    palette.getCoastPiece('corner-nw').imageRef,
    'assets/tiles/coast/coast-corner-nw.svg',
  );
  assert.equal(palette.getCoastPiece('inner-se').type, 'coast');
  assert.equal(palette.listVariants('coast').length, 12);
});

test('TilePalette ships with dock pieces that the party can walk on', () => {
  const palette = new TilePalette();
  assert.equal(palette.getDockPiece('pier-v').imageRef, 'assets/tiles/dock/dock-pier-v.svg');
  assert.equal(palette.getDockPiece('quay-e').label, 'Dock (quay-e)');
  assert.equal(palette.getDockPiece('pier-head-w').type, 'dock');
  assert.equal(palette.listVariants('dock').length, DOCK_KINDS.length);
  for (const kind of DOCK_KINDS) {
    assert.equal(kindOf(palette.getDockPiece(kind).imageRef), 'plain', kind);
  }
  assert.equal(palette.getDockPiece('pier-x'), undefined);
});

test('TilePalette ships with single-image POI markers', () => {
  const palette = new TilePalette();
  assert.equal(palette.get('settlement').imageRef, 'assets/tiles/settlement/settlement.svg');
  assert.equal(palette.get('dungeon').imageRef, 'assets/tiles/dungeon/dungeon.svg');
  assert.equal(palette.get('castle').imageRef, 'assets/tiles/castle/castle.svg');
  assert.equal(palette.get('wizard-tower').label, 'Wizard Tower');
  assert.equal(palette.get('general-store').label, 'General Store');
  assert.equal(palette.get('cave-entrance').label, 'Cave Entrance');
  assert.equal(
    palette.get('standing-stones').imageRef,
    'assets/tiles/standing-stones/standing-stones.svg',
  );
  for (const type of [
    'tavern',
    'inn',
    'blacksmith',
    'alchemist',
    'temple',
    'shrine',
    'academy',
    'barracks',
    'ruins',
    'mine',
    'port',
    'farm',
    'graveyard',
    'camp',
    'village',
    'city',
    'oasis',
    'lighthouse',
    'watchtower',
  ]) {
    assert.ok(palette.get(type), `missing marker "${type}"`);
  }
});

test('TilePalette ships with building-interior pieces', () => {
  const palette = new TilePalette();
  assert.equal(palette.listVariants('interior').length, 23);
  assert.equal(
    palette.getInteriorPiece('wall-corner-ne').imageRef,
    'assets/tiles/interior/interior-wall-corner-ne.svg',
  );
  assert.equal(
    palette.getInteriorPiece('wall-cross').imageRef,
    'assets/tiles/interior/interior-wall-cross.svg',
  );
  assert.equal(palette.getInteriorPiece('wall-tee-n').type, 'interior');
  assert.equal(palette.getInteriorPiece('floor-1').type, 'interior');
  assert.equal(palette.getInteriorPiece('stairs-down').id, 'interior-stairs-down');
  assert.equal(palette.getInteriorPiece('cave-wall')?.type, 'interior');
  assert.equal(
    palette.getInteriorPiece('cave-mouth-h')?.imageRef,
    'assets/tiles/interior/interior-cave-mouth-h.svg',
  );
});

test('TilePalette ships with furnishing overlays', () => {
  const palette = new TilePalette();
  assert.equal(palette.listVariants('furnishing').length, 12);
  assert.equal(palette.getInteriorPiece('bookshelf')?.label, 'Bookshelf');
  assert.equal(
    palette.getInteriorPiece('trapdoor')?.imageRef,
    'assets/tiles/interior/interior-trapdoor.svg',
  );
});

test('pickVariant selects deterministically from an injected rng', () => {
  const palette = new TilePalette();
  const first = palette.pickVariant('grass', () => 0);
  const last = palette.pickVariant('grass', () => 0.999);
  assert.equal(first.id, 'grass-1');
  assert.equal(last.id, 'grass-3');
});

test('pickVariant throws for an unknown type', () => {
  const palette = new TilePalette();
  assert.throws(() => palette.pickVariant('lava', () => 0), /No variants/);
});

test('addCustom registers a new tile entry', () => {
  const palette = new TilePalette();
  const entry = palette.addCustom('my-tile', 'My Tile', 'data:image/png;base64,abc');
  assert.equal(entry.custom, true);
  assert.equal(palette.get('my-tile'), entry);
  assert.equal(palette.listCustom().length, 1);
});

test('addCustom refuses to override a built-in id', () => {
  const palette = new TilePalette();
  assert.throws(() => palette.addCustom('grass-1', 'Fake Grass', 'data:x'), /built-in/);
});

test('removeCustom deletes a custom entry but ignores built-ins', () => {
  const palette = new TilePalette();
  palette.addCustom('my-tile', 'My Tile', 'data:x');
  palette.removeCustom('my-tile');
  assert.equal(palette.get('my-tile'), undefined);

  palette.removeCustom('grass-1');
  assert.ok(palette.get('grass-1'));
});

test('listAll returns both built-in and custom entries', () => {
  const palette = new TilePalette();
  const before = palette.listAll().length;
  palette.addCustom('my-tile', 'My Tile', 'data:x');
  assert.equal(palette.listAll().length, before + 1);
});

test('listBuiltins excludes custom entries, and listCustom the built-ins', () => {
  const palette = new TilePalette();
  const builtins = palette.listBuiltins().length;
  assert.ok(builtins > 0);
  palette.addCustom('my-tile', 'My Tile', 'data:x');
  assert.equal(palette.listBuiltins().length, builtins, 'custom tiles are not built-ins');
  assert.deepEqual(
    palette.listCustom().map((e) => e.id),
    ['my-tile'],
  );
});

test('isOverlayType flags the terrain-crossing overlay types only', () => {
  for (const type of ['road', 'river', 'coast', 'dock', 'town-wall', 'furnishing']) {
    assert.equal(isOverlayType(type), true);
  }
  for (const type of ['grass', 'poi-town', 'interior', 'house']) {
    assert.equal(isOverlayType(type), false);
  }
});

test('every built-in entry points at a file that exists', () => {
  for (const { id, imageRef } of new TilePalette().listBuiltins()) {
    assert.ok(existsSync(new URL(`../${imageRef}`, import.meta.url)), `${id}: ${imageRef}`);
  }
});

test('isTerrainType covers the variant types and custom art only', () => {
  const palette = new TilePalette();
  assert.equal(palette.get('deep-water-2')?.label, 'Deep Water 2');
  for (const type of ['grass', 'snow-mountain', 'custom']) assert.ok(isTerrainType(type), type);
  for (const type of ['road', 'inn', 'interior']) assert.ok(!isTerrainType(type), type);
});

test('TilePalette ships with span-2 town buildings and town wall pieces', () => {
  const palette = new TilePalette();
  assert.equal(palette.get('house').imageRef, 'assets/tiles/town/house.svg');
  assert.equal(palette.get('town-hall').label, 'Town Hall');
  for (const type of ['cottage', 'market', 'well', 'fountain', 'guildhall', 'bakery']) {
    assert.equal(palette.get(type)?.type, type);
  }
  for (const type of ['warehouse', 'stables', 'windmill', 'watermill']) {
    assert.equal(palette.get(type)?.imageRef, `assets/tiles/town/${type}.svg`);
  }
  assert.equal(palette.listVariants('town-wall').length, 10);
  assert.equal(
    palette.getTownWallPiece('wall-corner-se')?.imageRef,
    'assets/tiles/town/town-wall-corner-se.svg',
  );
  assert.equal(palette.getTownWallPiece('gate-v')?.label, 'Town Wall (gate-v)');
  assert.equal(
    palette.getTownWallPiece('water-gate-h')?.imageRef,
    'assets/tiles/town/town-water-gate-h.svg',
  );
  assert.equal(palette.getTownWallPiece('gate-x'), undefined);
});

test('isVariantType covers the multi-variant terrain types only', () => {
  assert.equal(isVariantType('grass'), true);
  assert.equal(isVariantType('snow-mountain'), true);
  assert.equal(isVariantType('custom'), false);
  assert.equal(isVariantType('road'), false);
});

test('anyVariant builds a random-variant brush for a variant type', () => {
  const palette = new TilePalette();
  assert.deepEqual(palette.anyVariant('deep-water'), {
    id: 'any:deep-water',
    type: 'deep-water',
    label: 'Deep Water',
    imageRef: 'assets/tiles/deep-water/deep-water-1.svg',
    custom: false,
    anyVariant: true,
  });
  assert.equal(palette.anyVariant('road'), undefined);
  assert.equal(palette.anyVariant('custom'), undefined);
});

test('listAnyVariants yields one brush per variant type in catalog order', () => {
  const palette = new TilePalette();
  const brushes = palette.listAnyVariants();
  assert.equal(brushes.length, 19);
  assert.equal(brushes[0].id, 'any:grass');
  assert.ok(brushes.every((b) => b.anyVariant && isVariantType(b.type)));
});

test('brushById resolves catalog ids and random-variant ids', () => {
  const palette = new TilePalette();
  assert.equal(palette.brushById('grass-2'), palette.get('grass-2'));
  assert.equal(palette.brushById('any:forest')?.type, 'forest');
  assert.equal(palette.brushById('any:road'), undefined);
  assert.equal(palette.brushById('nope'), undefined);
});

test('imageFor picks a variant per call for a random brush only', () => {
  const palette = new TilePalette();
  const brush = /** @type {import('../src/map/TilePalette.js').PaletteEntry} */ (
    palette.anyVariant('grass')
  );
  const rolls = [0, 0.5, 0.99];
  const rng = () => /** @type {number} */ (rolls.shift());
  assert.deepEqual(
    [palette.imageFor(brush, rng), palette.imageFor(brush, rng), palette.imageFor(brush, rng)],
    [1, 2, 3].map((i) => `assets/tiles/grass/grass-${i}.svg`),
  );
  const exact = /** @type {import('../src/map/TilePalette.js').PaletteEntry} */ (
    palette.get('grass-3')
  );
  assert.equal(
    palette.imageFor(exact, () => 0),
    'assets/tiles/grass/grass-3.svg',
  );
});

test('a custom tile of a variant type joins the random pick', () => {
  const palette = new TilePalette();
  palette.addCustom('my-grass', 'My Grass', 'data:image/png;base64,AA', 'grass');
  const brush = /** @type {import('../src/map/TilePalette.js').PaletteEntry} */ (
    palette.anyVariant('grass')
  );
  assert.equal(
    palette.imageFor(brush, () => 0.99),
    'data:image/png;base64,AA',
  );
});
