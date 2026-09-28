import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import { childSeed, expandTree } from '../src/map/GeneratorTree.js';
import { generateNodeTiles } from '../src/map/MapGenerator.js';
import { tileKind } from '../src/map/TileKinds.js';
import { stairwayTo } from '../src/map/MapExits.js';
import { mulberry32 } from '../src/util/Rng.js';

const palette = new TilePalette();

/**
 * @param {string} archetype @param {string} size
 * @param {{ kind?: 'region' | 'interior', levels?: number }} [extra]
 * @returns {import('../src/map/GeneratorTree.js').TreeRoot}
 */
const root = (archetype, size, extra = {}) => ({
  id: 'root',
  name: 'Top',
  kind: extra.kind ?? 'region',
  environ: null,
  archetype,
  size,
  levels: extra.levels,
});

/** @returns {() => string} ids n1, n2, and so on */
const counter = () => {
  let n = 0;
  return () => `n${++n}`;
};

/**
 * Every link in the batch leads to a node of the batch whose parent holds
 * the link, and every node below the top has a link to it.
 * @param {import('../src/map/GeneratorTree.js').TreeNode[]} nodes
 */
function assertLinked(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const reached = new Set();
  for (const node of nodes) {
    for (const tile of node.tiles) {
      if (!tile.childNodeId) continue;
      const child = byId.get(tile.childNodeId);
      assert.ok(child, `${node.name} ${tile.id} leads to a node of the batch`);
      assert.equal(child.parentId, node.id, `${child.name} is a child of ${node.name}`);
      reached.add(child.id);
    }
  }
  assert.equal(reached.size, nodes.length - 1, 'every node below the top has a way in');
}

test('a child seed mixes the parent seed and the site index', () => {
  assert.equal(childSeed(5, 2), childSeed(5, 2));
  const seeds = new Set([childSeed(5, 0), childSeed(5, 1), childSeed(6, 0), childSeed(6, 1)]);
  assert.equal(seeds.size, 4);
  for (const s of seeds) assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
});

test('the top map is the same map with or without its sub-maps', () => {
  const alone = expandTree(palette, root('wilderness', 'large'), { seed: 1, depth: 0 }, counter());
  const nested = expandTree(palette, root('wilderness', 'large'), { seed: 1, depth: 1 }, counter());
  assert.equal(alone.nodes.length, 1);
  assert.ok(nested.nodes.length > 1);
  const plain = nested.nodes[0].tiles.map(({ childNodeId: _link, ...rest }) => rest);
  assert.deepEqual(
    plain,
    alone.nodes[0].tiles.map(({ childNodeId: _link, ...rest }) => rest),
  );
  const preview = generateNodeTiles(
    palette,
    { archetype: 'wilderness', size: 'large' },
    mulberry32(1),
  );
  assert.deepEqual(alone.nodes[0].tiles, preview.tiles, 'the preview matches the top map');
  assert.equal(alone.rng(), nested.rng(), 'the entrance art draws from the same RNG state');
});

test('one level down links every site of a wilderness to a named sub-map', () => {
  const { nodes, skipped } = expandTree(
    palette,
    root('wilderness', 'large'),
    { seed: 5, depth: 1 },
    counter(),
  );
  assert.equal(skipped, 0);
  assertLinked(nodes);
  const top = nodes.filter((n) => n.parentId === 'root');
  assert.ok(
    top.some((n) => n.kind === 'region'),
    'a town',
  );
  assert.ok(
    top.some((n) => n.kind === 'interior'),
    'a keep or a dungeon',
  );
  for (const node of top) assert.ok(node.name && node.name !== 'Top', node.name);
  // No town opens into its buildings at depth 1, but each dungeon keeps
  // every level that its stairs lead to.
  const deeper = nodes.filter((n) => n.parentId && n.parentId !== 'root');
  for (const level of deeper) assert.match(level.name, /\((level \d|upper floor|dungeons)\)$/);
});

test('the stairs of a multi-level dungeon lead down to each level, none from the bottom', () => {
  for (const seed of [5, 21]) {
    const { nodes } = expandTree(
      palette,
      root('dungeon', 'medium', { kind: 'interior', levels: 3 }),
      { seed, depth: 0 },
      counter(),
    );
    assert.deepEqual(
      nodes.map((n) => n.name),
      ['Top', 'Top (level 2)', 'Top (level 3)'],
    );
    assertLinked(nodes);
    nodes.forEach((level, i) => {
      const down = level.tiles.filter((t) => t.imageRef.includes('stairs-down'));
      assert.equal(down.length, i < 2 ? 1 : 0, `seed ${seed} level ${i + 1}: stairs down`);
      if (i < 2) assert.equal(down[0].childNodeId, nodes[i + 1].id);
    });
    // A deeper level is entered by its stairs up and has no door to the surface.
    for (const level of nodes.slice(1)) {
      const up = level.tiles.find((t) => t.imageRef.includes('stairs-up'));
      assert.equal(level.entry, up?.id);
      assert.ok(!level.tiles.some((t) => t.imageRef.includes('door')));
      assert.equal(level.parentId, nodes[nodes.indexOf(level) - 1].id);
    }
  }
});

test('cave levels chain through their stairs like dungeon levels', () => {
  const { nodes } = expandTree(
    palette,
    root('cave', 'medium', { kind: 'interior', levels: 2 }),
    { seed: 4, depth: 0 },
    counter(),
  );
  assert.equal(nodes.length, 2);
  const down = nodes[0].tiles.find((t) => t.imageRef.includes('stairs-down'));
  assert.equal(down?.childNodeId, nodes[1].id);
});

test('a building with a trapdoor gets its cellar even with no sub-maps', () => {
  const { nodes } = expandTree(
    palette,
    root('building', 'small', { kind: 'interior' }),
    { seed: 10, depth: 0 },
    counter(),
  );
  assert.deepEqual(
    nodes.map((n) => n.name),
    ['Top', 'Top (cellar)'],
  );
  const trapdoor = nodes[0].tiles.find((t) => t.childNodeId);
  assert.equal(trapdoor && tileKind(trapdoor), 'stairs-down');
  const cellar = nodes[1];
  assert.equal(cellar.kind, 'interior');
  assert.equal(cellar.environ, 'cellar');
  assert.equal(
    tileKind(/** @type {any} */ (cellar.tiles.find((t) => t.id === cellar.entry))),
    'stairs-up',
  );
  assert.ok(!cellar.tiles.some((t) => tileKind(t) === 'stairs-down'), 'a cellar goes no deeper');
});

test('a town links all four cells of each building to its inside', () => {
  const { nodes } = expandTree(palette, root('town', 'medium'), { seed: 3, depth: 1 }, counter());
  assertLinked(nodes);
  const buildings = nodes.filter((n) => n.parentId === 'root');
  assert.ok(buildings.length >= 3);
  for (const building of buildings) {
    const cells = nodes[0].tiles.filter((t) => t.childNodeId === building.id);
    assert.equal(cells.length, 4, building.name);
    assert.equal(building.kind, 'interior');
  }
});

test('the budget stops the optional sub-maps and counts the places left out', () => {
  const { nodes, skipped } = expandTree(
    palette,
    root('wilderness', 'large'),
    { seed: 5, depth: 9, budget: 2 },
    counter(),
  );
  assert.ok(skipped > 0);
  const optional = nodes.filter((n) => n.parentId === 'root');
  assert.equal(optional.length, 2);
  assertLinked(nodes);
});

test('the ids of one batch never clash, even when the id source repeats', () => {
  const ids = ['a', 'a', 'root', 'b', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const { nodes } = expandTree(
    palette,
    root('dungeon', 'small', { kind: 'interior', levels: 3 }),
    { seed: 2, depth: 0 },
    () => /** @type {string} */ (ids.shift()),
  );
  assert.deepEqual(
    nodes.map((n) => n.id),
    ['root', 'a', 'b'],
  );
});

test('a world opens into its regions, and the regions into their places', () => {
  const { nodes } = expandTree(palette, root('world', 'medium'), { seed: 2, depth: 2 }, counter());
  assertLinked(nodes);
  const regions = nodes.filter((n) => n.parentId === 'root');
  assert.ok(regions.length >= 2);
  for (const region of regions) {
    assert.equal(region.kind, 'region');
    assert.equal(region.width, 22, 'a region map is large');
  }
  assert.ok(
    nodes.some((n) => regions.some((r) => r.id === n.parentId)),
    'the regions have places',
  );
});

test('no generated stairs or trapdoor leads nowhere', () => {
  const cases = [
    ['dungeon', 'interior', 1],
    ['dungeon', 'interior', 3],
    ['cave', 'interior', 2],
    ['castle', 'interior', 1],
    ['building', 'interior', 1],
    ['wilderness', 'region', 1],
    ['town', 'region', 1],
  ];
  for (const [archetype, kind, levels] of cases) {
    for (const seed of [1, 2, 3, 10]) {
      const { nodes } = expandTree(
        palette,
        root(/** @type {string} */ (archetype), 'medium', {
          kind: /** @type {any} */ (kind),
          levels: /** @type {number} */ (levels),
        }),
        { seed, depth: 1 },
        counter(),
      );
      const byId = new Map(nodes.map((n) => [n.id, n]));
      for (const node of nodes) {
        const parent = node.parentId ? byId.get(node.parentId) : null;
        const back = parent ? stairwayTo(/** @type {any} */ (parent), node.id)?.back : null;
        for (const tile of node.tiles) {
          const stairs = tileKind(tile);
          if (stairs !== 'stairs-up' && stairs !== 'stairs-down') continue;
          assert.ok(
            tile.childNodeId || stairs === back,
            `${archetype} seed ${seed}: ${node.name} ${tile.id} ${stairs} leads somewhere`,
          );
        }
      }
    }
  }
});

test('a castle opens up into its upper floor and down into its dungeons', () => {
  const { nodes } = expandTree(
    palette,
    root('castle', 'medium', { kind: 'interior' }),
    { seed: 4, depth: 0 },
    counter(),
  );
  assert.deepEqual(
    nodes.map((n) => n.name),
    ['Top', 'Top (upper floor)', 'Top (dungeons)'],
  );
  const [keep, upper, dungeons] = nodes;
  assert.equal(stairwayTo(/** @type {any} */ (keep), upper.id)?.back, 'stairs-down');
  assert.equal(stairwayTo(/** @type {any} */ (keep), dungeons.id)?.back, 'stairs-up');
  const entry = upper.tiles.find((t) => t.id === upper.entry);
  assert.equal(entry && tileKind(entry), 'stairs-down');
  const edge = (/** @type {string} */ id) => {
    const [x, y] = id.split(',').map(Number);
    return x === 0 || y === 0 || x === upper.width - 1 || y === upper.height - 1;
  };
  assert.ok(
    !upper.tiles.some((t) => edge(t.id) && tileKind(t) === 'door'),
    'the upper floor has no door out',
  );
  assert.ok(!upper.tiles.some((t) => tileKind(t) === 'stairs-up'));
  assert.equal(dungeons.environ, 'dungeon');
});
