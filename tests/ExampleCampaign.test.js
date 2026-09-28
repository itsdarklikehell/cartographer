import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { REGIONS, WORLD_SEED } from '../src/campaign/ExampleWorld.js';
import { isStandable } from '../src/campaign/ExampleStaging.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { getTile } from '../src/map/TileGrid.js';
import { tileKind } from '../src/map/TileKinds.js';
import { authoringWarning } from '../src/map/MapExits.js';
import { buildState, QUOTA_WARN_BYTES, serialize } from '../src/storage/SaveManager.js';
import { getHP, getClasses } from '../src/entities/Character.js';
import { isHitDicePool } from '../src/entities/HitDice.js';
import { coerceCR, crXP } from '../src/data/challenge.js';
import { difficultyLine } from '../src/entities/EncounterDifficulty.js';
import { effectiveStatBlock } from '../src/entities/Creature.js';

const campaign = buildExampleCampaign(new TilePalette());
const { grid } = campaign;

/** @param {string} id */
const nodeOf = (id) => {
  const node = grid.getNode(id);
  assert.ok(node, `missing node ${id}`);
  return node;
};

/** @param {string} id */
const creature = (id) => {
  const found = campaign.creatures.find((c) => c.id === id);
  assert.ok(found, id);
  return found;
};

/** The ids of a node and every node above it. @param {string} id */
const lineage = (id) => {
  const ids = [];
  for (let n = grid.getNode(id); n; n = n.parentId ? grid.getNode(n.parentId) : undefined) {
    ids.push(n.id);
  }
  return ids;
};

test('the example campaign is the same on every load', () => {
  const again = buildExampleCampaign(new TilePalette());
  assert.equal(serialize(buildState(again)), serialize(buildState(campaign)));
});

test('the example world takes its regions from the seeded world generator', () => {
  const world = nodeOf('world');
  assert.equal(world.width, 48, `world seed ${WORLD_SEED}`);
  const anchors = new Set();
  for (const region of REGIONS) {
    const tile = getTile(world, region.anchor);
    // A failure here means a generator change moved the regions of the
    // seed: pick the anchors again, then refresh the docs and screenshots.
    assert.equal(tile?.childNodeId, region.id, `anchor ${region.anchor} of ${region.id}`);
    assert.ok(tile?.metadata.notes, `${region.id} has a GM note on its anchor`);
    anchors.add(tile?.childNodeId);
    assert.equal(nodeOf(region.id).parentId, 'world');
  }
  assert.equal(anchors.size, REGIONS.length, 'each anchor names its own region');
});

test('the start region is revealed on the world map and the party stands in it', () => {
  const world = nodeOf('world');
  const block = world.tiles.filter((t) => t.childNodeId === 'briarwick-vale');
  assert.ok(block.length > 0 && block.every((t) => t.revealed));
  assert.ok(
    world.tiles.filter((t) => t.childNodeId !== 'briarwick-vale').every((t) => !t.revealed),
  );
  assert.equal(campaign.party.nodeId, 'briarwick-vale');
  const start = getTile(nodeOf('briarwick-vale'), campaign.party.tileId);
  assert.ok(start && isStandable(start));
});

test('every example node has a way in and a way out', () => {
  for (const node of grid.nodes.values()) {
    const parent = node.parentId ? nodeOf(node.parentId) : null;
    assert.equal(authoringWarning(node, parent), null, `${node.id} (${node.name})`);
  }
});

test('every linked tile names a node, and every node but the world is linked', () => {
  const linked = new Set();
  for (const node of grid.nodes.values()) {
    for (const t of node.tiles) {
      if (!t.childNodeId) continue;
      assert.ok(grid.getNode(t.childNodeId), `${node.id}/${t.id} links to ${t.childNodeId}`);
      assert.equal(nodeOf(t.childNodeId).parentId, node.id);
      linked.add(t.childNodeId);
    }
  }
  assert.equal(linked.size, grid.nodes.size - 1);
});

test('the story places are the expected generated maps', () => {
  assert.equal(nodeOf('briarwick').parentId, 'briarwick-vale');
  assert.equal(nodeOf('saltmere').parentId, 'saltreach');
  assert.equal(nodeOf('thornhold').parentId, 'barrowdowns');
  assert.equal(nodeOf('barrow').parentId, 'barrowdowns');
  assert.equal(nodeOf('hollowvein').parentId, 'graypeak');
  // Saltmere is a port: its sea has piers.
  assert.ok(nodeOf('saltmere').tiles.some((t) => String(t.overlayRef).includes('/dock/')));
  // The two story towns have furnished buildings, and the inn has its name.
  const names = [...grid.nodes.values()]
    .filter((n) => n.parentId === 'briarwick')
    .map((n) => n.name);
  assert.ok(names.includes('The Waystation'));
  assert.equal(
    nodeOf('thornhold').tiles.filter((t) => t.childNodeId).length,
    2,
    'upper floor and dungeons',
  );
});

test('the save of the example stays well under the storage warning', () => {
  const bytes = serialize(buildState(campaign)).length * 2;
  assert.ok(bytes < QUOTA_WARN_BYTES / 3, `${bytes} bytes`);
});

test('every creature stands where the party can meet it', () => {
  const ids = campaign.creatures.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate creature ids');
  for (const c of campaign.creatures) {
    assert.ok(c.location, `${c.id} unplaced`);
    const tile = getTile(nodeOf(c.location.nodeId), c.location.tileId);
    assert.ok(tile, `${c.id} on missing tile ${c.location.nodeId}/${c.location.tileId}`);
    assert.ok(
      !tile.childNodeId && tileKind(tile) !== 'wall' && tileKind(tile) !== 'obstacle',
      c.id,
    );
  }
  const camp = getTile(nodeOf('northmarch'), creature('snagtooth').location?.tileId ?? '');
  assert.equal(camp?.metadata.poiType, 'landmark', 'Snagtooth stands on a stamped camp');
  const tomb = creature('ostrand').location;
  const deepest = nodeOf(tomb?.nodeId ?? '');
  assert.ok(lineage(deepest.id).includes('barrow'), 'Ostrand lies in the barrow');
  assert.ok(!deepest.tiles.some((t) => tileKind(t) === 'stairs-down'), 'on its last level');
  assert.equal(tileKind(/** @type {any} */ (getTile(deepest, tomb?.tileId ?? ''))), 'floor');
  assert.ok(lineage(creature('innkeeper-bram').location?.nodeId ?? '').includes('briarwick'));
});

test('the handouts name real nodes, and a bound handout a real tile', () => {
  for (const h of campaign.handouts) {
    if (h.nodeId === null) {
      assert.equal(h.tileId, null, h.id);
      continue;
    }
    const node = nodeOf(h.nodeId);
    if (h.tileId !== null) assert.ok(getTile(node, h.tileId), `${h.id} on ${h.tileId}`);
  }
});

test('example campaign ships a full arc: quests, NPCs, bosses, field enemies', () => {
  assert.ok(campaign.quests.length >= 5, 'expected a quest chain');
  assert.ok(campaign.quests.every((q) => q.status === 'active' && q.notes.length > 0));

  const folk = campaign.creatures.filter((c) => c.disposition !== 'hostile');
  assert.ok(folk.length >= 5, 'expected a staffed world');
  assert.ok(folk.every((n) => (n.notes ?? '').length > 0));

  const legends = campaign.creatures.filter((e) => e.tier === 'legend');
  const mobs = campaign.creatures.filter((e) => e.tier === 'mob');
  assert.ok(legends.length >= 4, 'expected minor bosses plus a major boss');
  assert.ok(mobs.length >= 8, 'expected field enemies');
  const major = legends.reduce((a, b) => ((b.level ?? 0) > (a.level ?? 0) ? b : a));
  assert.equal(major.id, 'ostrand');

  assert.ok(campaign.bestiary.length >= 6, 'expected reusable mob templates');
  assert.ok(campaign.handouts.length >= 4, 'expected lore handouts');
  assert.ok(campaign.handouts.every((h) => !h.revealed));

  assert.ok(campaign.characters.length >= 2);
  for (const character of campaign.characters) {
    const hp = getHP(character);
    assert.ok(hp && hp.current === hp.max && hp.max > 0, `${character.name} needs an HP pool`);
    assert.ok(character.inventory.length > 0, `${character.name} needs starting kit`);
    // The example party exercises the whole character model: each member is
    // classed, has an origin, has assembled proficiencies, and owns a
    // spendable hit-dice pool sized to its class levels.
    assert.ok(getClasses(character).length >= 1, `${character.name} needs a class`);
    assert.ok(character.background, `${character.name} needs a background`);
    assert.ok(
      character.proficiencies && character.proficiencies.skills.length > 0,
      `${character.name} needs skill proficiencies`,
    );
    assert.ok(character.resources.some(isHitDicePool), `${character.name} needs a hit-dice pool`);
  }
});

test('every example enemy and template is rated, so the difficulty hint has numbers', () => {
  const hostiles = campaign.creatures.filter((c) => c.disposition === 'hostile');
  assert.ok(hostiles.length > 0);
  for (const entry of [...hostiles, ...campaign.bestiary]) {
    assert.ok(crXP(entry.cr) > 0, `${entry.name} needs a rating worth XP`);
    // A rating stamped by hand must be one of the defined steps, or the write
    // paths would drop it and the hint would silently read short.
    assert.equal(coerceCR(entry.cr), entry.cr, `${entry.name} names no defined rating`);
  }
  assert.match(
    difficultyLine(campaign.characters, [creature('ostrand')]),
    /^Deadly: /,
    'the major boss alone is deadly for the example party',
  );
});

test('example enemies reach their stat block AC, and beasts fight unarmored with natural attacks', () => {
  const expected = {
    'goblin-scout': 13,
    'bandit-1': 12,
    'barrow-skeleton-1': 13,
    'gray-wolf-1': 13,
    'giant-scorpion': 15,
    snagtooth: 16,
    'grave-wight': 14,
    ostrand: 18,
  };
  for (const [id, ac] of Object.entries(expected)) {
    assert.equal(effectiveStatBlock(creature(id)).AC, ac, id);
  }
  for (const id of ['gray-wolf-1', 'hill-harpy', 'giant-scorpion', 'skalvyr', 'crypt-shade']) {
    const beast = creature(id);
    assert.equal(beast.armor, null, `${id} wears no armor`);
    assert.equal(beast.weapon?.category, null, `${id} attacks with a natural weapon`);
  }
  const wolf = campaign.bestiary.find((t) => t.id === 'gray-wolf');
  assert.equal(wolf?.armor, null);
  assert.equal(wolf?.weapon?.name, 'Bite');
});

test('the world build refuses a region table that does not match the generated regions', () => {
  const palette = new TilePalette();
  REGIONS.push({ anchor: '0,0', id: 'nowhere', name: 'Nowhere', notes: '' });
  assert.throws(
    () => buildExampleCampaign(palette),
    /No world region covers the anchor of nowhere/,
  );
  REGIONS.pop();
  const [first] = REGIONS.splice(0, 1);
  assert.throws(() => buildExampleCampaign(palette), /has no entry in REGIONS/);
  REGIONS.unshift(first);
});

test('every quest link names a real place or creature', () => {
  const creatures = new Set(campaign.creatures.map((c) => c.id));
  for (const quest of campaign.quests) {
    for (const link of quest.links) {
      if (link.kind === 'creature') {
        assert.ok(creatures.has(link.creatureId), `${quest.id}: ${link.creatureId}`);
      } else {
        const node = nodeOf(link.nodeId);
        if (link.tileId !== null)
          assert.ok(getTile(node, link.tileId), `${quest.id}: ${link.tileId}`);
      }
    }
  }
});
