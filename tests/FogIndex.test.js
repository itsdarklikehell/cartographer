import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exploredCount,
  revealedIds,
  withNodeTiles,
  withTileAppended,
  withTileReplaced,
} from '../src/map/TileIndex.js';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { hideAll, revealAround, setTileRevealed } from '../src/map/FogOfWar.js';
import { mulberry32 } from '../src/util/Rng.js';

/** A fogged node built whole, so its layout passes forward on each replace. */
function fogged(width = 8, height = 8) {
  const tiles = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) tiles.push(createTile(`${x},${y}`, 'g.png'));
  }
  return withNodeTiles(createMapNode('n', 'Node', null, width, height), tiles);
}

/** The explored count by a plain scan, for comparison. */
const scanned = (node) => node.tiles.filter((t) => t.revealed && /^\d+,\d+$/.test(t.id)).length;

test('exploredCount counts revealed tiles with a grid id and skips a loose one', () => {
  let node = createMapNode('n', 'Node', null, 4, 4);
  node = setTile(node, createTile('0,0', 'g.png', { revealed: true }));
  node = setTile(node, createTile('01,2', 'g.png', { revealed: true }));
  node = setTile(node, createTile('loose', 'g.png', { revealed: true }));
  node = setTile(node, createTile('3,3', 'g.png'));
  assert.equal(exploredCount(node), 2);
});

test('exploredCount follows a reveal and leaves the older node its own count', () => {
  const start = fogged();
  assert.equal(exploredCount(start), 0);
  const stepped = revealAround(start, '3,3', 1);
  assert.equal(exploredCount(stepped), 5);
  const hidden = setTileRevealed(stepped, '3,3', false);
  assert.equal(exploredCount(hidden), 4);
  // Undo hands back the older nodes. Each answers from its own layout.
  assert.equal(exploredCount(stepped), 5);
  assert.equal(exploredCount(start), 0);
});

test('exploredCount counts by scan on a node whose layout was never counted', () => {
  const start = fogged();
  const stepped = revealAround(start, '0,0', 2);
  assert.equal(exploredCount(stepped), scanned(stepped));
  assert.equal(exploredCount(hideAll(stepped)), 0);
});

test('exploredCount ignores a flip or an append of a tile with no grid id', () => {
  let node = withTileAppended(fogged(), createTile('loose', 'g.png'));
  assert.equal(exploredCount(node), 0);
  node = setTileRevealed(node, 'loose', true);
  assert.equal(exploredCount(node), 0);
  node = withTileAppended(node, createTile('odd', 'g.png', { revealed: true }));
  assert.equal(exploredCount(node), 0);
  node = withTileAppended(node, createTile('9,9', 'g.png', { revealed: true }));
  assert.equal(exploredCount(node), 1);
});

test('exploredCount stays uncounted through an append before the first read', () => {
  const node = withTileAppended(fogged(), createTile('9,9', 'g.png', { revealed: true }));
  assert.equal(exploredCount(node), 1);
});

test('exploredCount matches a scan through a random run of fog edits', () => {
  const rng = mulberry32(7);
  let node = fogged(10, 10);
  const history = [node];
  for (let i = 0; i < 300; i++) {
    const id = `${Math.floor(rng() * 10)},${Math.floor(rng() * 10)}`;
    const roll = rng();
    if (roll < 0.4) node = revealAround(node, id, rng() * 3);
    else if (roll < 0.8) node = setTileRevealed(node, id, rng() < 0.5);
    else node = setTile(node, createTile(id, 'w.png', { revealed: rng() < 0.5 }));
    history.push(node);
    if (i % 3 === 0) assert.equal(exploredCount(node), scanned(node), `edit ${i}`);
  }
  for (const old of history) assert.equal(exploredCount(old), scanned(old));
});

test('revealedIds answers from the tiles of its own node', () => {
  const start = fogged();
  const stepped = revealAround(start, '2,2', 1);
  const now = revealedIds(stepped);
  const before = revealedIds(start);
  assert.equal(now.has('2,2'), true);
  assert.equal(now.has('2,1'), true);
  assert.equal(now.has('0,0'), false);
  assert.equal(before.has('2,2'), false, 'the older node keeps its fog');
  assert.equal(now.has('9,9'), false, 'an id past the extent');
  assert.equal(now.has('missing'), false);
});

test('revealedIds reads an odd, appended, or displaced id through the id lookup', () => {
  let node = fogged(4, 4);
  node = withTileReplaced(node, 0, { ...node.tiles[0], revealed: true });
  node = withTileAppended(node, createTile('loose', 'g.png', { revealed: true }));
  const ids = revealedIds(node);
  assert.equal(ids.has('loose'), true);
  assert.equal(ids.has('0,0'), true, 'a grid id on a node with appended tiles');
  assert.equal(ids.has('1,0'), false);

  // "01,2" draws at the cell of "1,2" and comes later, so it takes the cell.
  let odd = createMapNode('n', 'Node', null, 4, 4);
  odd = withNodeTiles(odd, [
    createTile('1,2', 'g.png', { revealed: true }),
    createTile('01,2', 'g.png'),
  ]);
  const oddIds = revealedIds(odd);
  assert.equal(oddIds.has('01,2'), false);
  assert.equal(oddIds.has('1,2'), true);
});

test('revealedIds works on a node too large for the cell structure', () => {
  const huge = withNodeTiles(createMapNode('n', 'Node', null, 2000, 2000), [
    createTile('5,5', 'g.png', { revealed: true }),
  ]);
  assert.equal(revealedIds(huge).has('5,5'), true);
  assert.equal(revealedIds(huge).has('6,5'), false);
});
