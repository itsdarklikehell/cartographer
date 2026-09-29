import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile, TileGrid } from '../src/map/TileGrid.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { buildState, packState, warmPackSteps } from '../src/storage/SaveManager.js';
import { tabulateStrings } from '../src/storage/StringTable.js';

function sampleState() {
  const grid = new TileGrid();
  grid.addNode(setTile(createMapNode('world', 'World', null, 2, 2), createTile('0,0', 'g.svg')));
  grid.addNode(createMapNode('region', 'Region', 'world', 1, 1));
  return buildState({
    grid,
    characters: [createCharacter('hero', 'Hero')],
    creatures: [createCreature('ogre', 'Ogre', { maxHP: 30 })],
  });
}

test('warmPackSteps gives one step per node and per entity', () => {
  const state = sampleState();
  assert.equal(warmPackSteps(state).length, 4);
});

test('each warm step fills the cache packState reads', () => {
  const state = sampleState();
  const [world, region, hero, ogre] = warmPackSteps(state).map((step) => step());
  const packed = packState(state);
  // packState moves palette strings into the save's table. The table step
  // caches on the encoded node, so it gives back the object packState made
  // only when packState used the warmed encode.
  const table = tabulateStrings({ nodes: [world, region] });
  assert.equal(packed.nodes[0], table.nodes[0], 'a warmed node packs to the cached object');
  assert.equal(packed.nodes[1], region, 'a node with no palette string is the encode itself');
  assert.equal(packed.characters[0], hero, 'a warmed entity packs to the cached object');
  assert.equal(packed.creatures[0], ogre);
});

test('warmPackSteps skips a collection that is not a list', () => {
  const state = /** @type {any} */ ({ ...sampleState(), handouts: undefined });
  assert.equal(warmPackSteps(state).length, 4);
});
