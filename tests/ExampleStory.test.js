import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { toCaster } from '../src/entities/Caster.js';
import { buildExampleContent } from '../src/campaign/ExampleContent.js';
import { tileKind } from '../src/map/TileKinds.js';
import { opensOutward } from '../src/map/MapExits.js';
import { coerceCR, crXP } from '../src/data/challenge.js';

const campaign = buildExampleCampaign(new TilePalette());

/** @param {string} id */
const creature = (id) => {
  const found = campaign.creatures.find((c) => c.id === id);
  assert.ok(found, id);
  return found;
};

test('every example quest has steps to follow and links to what it involves', () => {
  const ids = campaign.quests.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate quest ids');
  for (const q of campaign.quests) {
    assert.ok(q.objectives.length >= 2, `${q.id} has steps`);
    assert.ok(q.links.length >= 1, `${q.id} has links`);
    assert.ok(
      q.objectives.some((o) => !o.hidden),
      `${q.id} shows the players at least one step`,
    );
    const steps = q.objectives.map((o) => o.id);
    assert.equal(new Set(steps).size, steps.length, `${q.id} repeats a step id`);
  }
});

test('the hidden hand of the story stays hidden from the players', () => {
  const irenne = creature('castellan-irenne');
  assert.notEqual(irenne.disposition, 'hostile');
  assert.doesNotMatch(irenne.role ?? '', /crown|ostrand|pale|cult/i);
  const hand = campaign.quests.find((q) => q.id === 'the-hand-that-writes');
  assert.equal(hand?.revealed, false);
  for (const q of campaign.quests.filter((shown) => shown.revealed)) {
    for (const o of q.objectives.filter((step) => !step.hidden)) {
      assert.doesNotMatch(o.text, /irenne|castellan/i, `${q.id}: ${o.text}`);
    }
  }
  for (const c of campaign.creatures) {
    assert.doesNotMatch(c.role ?? '', /secret|traitor|hidden/i, c.id);
  }
});

test('the party knows its own contacts from the start, and nobody else', () => {
  const known = campaign.creatures.filter((c) => c.met).map((c) => c.id);
  assert.deepEqual(known.sort(), [
    'caravan-master-dorn',
    'castellan-irenne',
    'corvin-the-smuggler',
    'lord-aldemar',
  ]);
});

test('the undead of the example resist what the rules say, and the dead are trained', () => {
  assert.deepEqual(creature('barrow-skeleton-1').defenses?.vulnerable, ['bludgeoning']);
  assert.ok(creature('crypt-shade').defenses?.immune.includes('necrotic'));
  assert.ok(creature('ostrand').defenses?.immune.includes('poison'));
  assert.deepEqual(creature('ostrand').proficiencies?.saves, ['STR', 'CON', 'WIS']);
  for (const c of campaign.creatures) {
    assert.deepEqual(
      Object.keys(c.stats).filter((k) => !/^(STR|DEX|CON|INT|WIS|CHA|AC)$/.test(k)),
      [],
      c.id,
    );
  }
});

test('every example caster creature knows spells of its own class', () => {
  const byId = new Map(DEFAULT_SPELLS.map((s) => [s.id, s]));
  const casters = campaign.creatures.filter((c) => c.spellbook);
  assert.deepEqual(casters.map((c) => c.id).sort(), [
    'castellan-irenne',
    'ostrand',
    'pale-sworn-2',
  ]);
  for (const c of casters) {
    const view = toCaster(c);
    assert.ok(view.resources.length > 0, `${c.id} has slots`);
    for (const id of [...(c.spellbook?.cantrips ?? []), ...(c.spellbook?.known ?? [])]) {
      const spell = byId.get(id);
      assert.ok(spell, `${c.id}: unknown spell ${id}`);
      assert.ok(spell.classes?.includes(c.class ?? ''), `${c.id}: ${id} is not a ${c.class} spell`);
    }
  }
});

test('each character starts with one personal handout that only its own tab sees', () => {
  const hooks = campaign.handouts.filter((h) => h.revealed);
  assert.deepEqual(
    hooks.map((h) => h.audience),
    campaign.characters.map((c) => [c.id]),
  );
  assert.ok(hooks.every((h) => h.nodeId === null && h.tileId === null));
});

test('the clues of the example lie on the tiles where the party finds them', () => {
  /** @param {string} id */
  const handout = (id) => campaign.handouts.find((h) => h.id === id);
  /** @param {string} id */
  const where = (id) => {
    const found = handout(id);
    return { nodeId: found?.nodeId, tileId: found?.tileId };
  };
  const inscription = handout('barrow-inscription');
  assert.equal(inscription?.nodeId, creature('barrow-skeleton-1').location?.nodeId);
  const barrow = campaign.grid.getNode('barrow');
  const door = barrow?.tiles.find((t) => t.id === inscription?.tileId);
  assert.ok(door && tileKind(door) === 'door' && opensOutward(barrow, door), 'at the barrow door');

  assert.equal(handout('snagtooth-orders')?.tileId, creature('snagtooth').location?.tileId);
  assert.equal(handout('irennes-letter')?.nodeId, creature('pale-sworn-1').location?.nodeId);
  assert.deepEqual(where('letter-for-dorn'), creature('innkeeper-bram').location);
  assert.deepEqual(where('empty-seal-niche'), creature('crypt-shade').location);
  assert.equal(handout('crypt-ledger')?.tileId, null);
  assert.equal(handout('legend-of-ostrand')?.nodeId, null);
});

test('the prose of the example uses no em-dashes', () => {
  const prose = [
    ...campaign.handouts.flatMap((h) => [h.title, h.body]),
    ...campaign.quests.flatMap((q) => [q.title, q.notes, ...q.objectives.map((o) => o.text)]),
    ...campaign.creatures.flatMap((c) => [c.name, c.role ?? '', c.notes ?? '']),
  ];
  for (const text of prose) assert.doesNotMatch(text, /—/, text);
});

test('the example content refuses a world that lacks one of its story places', () => {
  const world = { grid: campaign.grid, places: {} };
  assert.throws(() => buildExampleContent(world), /no place named start/);
});

/** @param {string} id */
const questOf = (id) => {
  const found = campaign.quests.find((q) => q.id === id);
  assert.ok(found, id);
  return found;
};

test('the example quests reveal each other along the story, and the barrow has three ways in', () => {
  const ids = new Set(campaign.quests.map((q) => q.id));
  for (const q of campaign.quests) {
    for (const id of q.unlocks) assert.ok(ids.has(id) && id !== q.id, `${q.id} unlocks ${id}`);
  }
  const unlockedBy = (/** @type {string} */ id) =>
    campaign.quests.filter((q) => q.unlocks.includes(id)).map((q) => q.id);
  assert.deepEqual(unlockedBy('the-barrow-king'), [
    'the-hermit-of-graypeak',
    'the-hollowvein-knocking',
    'the-silver-road',
  ]);
  assert.deepEqual(unlockedBy('the-pale-seal'), ['the-goblin-raids']);
  // The party meets Petra and Grelka before the GM reveals their quests.
  assert.deepEqual(unlockedBy('dead-water'), []);
  assert.deepEqual(unlockedBy('the-mire-hags-bargain'), []);
  // Every quest that starts hidden has a quest that reveals it, or a person to meet.
  for (const q of campaign.quests.filter((shown) => !shown.revealed)) {
    const met = ['dead-water', 'the-mire-hags-bargain'].includes(q.id);
    assert.ok(met || unlockedBy(q.id).length > 0, `${q.id} has a way to be revealed`);
  }
});

test('Mirelle has a personal quest for the open graves, apart from the pale seal', () => {
  const graves = questOf('the-opened-graves');
  assert.equal(graves.revealed, true);
  assert.ok(graves.links.some((l) => l.kind === 'creature' && l.creatureId === 'sister-alwyn'));
  const seal = questOf('the-pale-seal');
  assert.ok(seal.objectives.every((o) => !/alwyn/i.test(o.text)));
});

test('the quest rewards pay what the story promises and bring the party near level 5', () => {
  assert.deepEqual(questOf('wolves-on-the-vale-road').reward, { gp: 25, xp: 200, per: 'each' });
  assert.equal(questOf('dead-water').reward?.gp, 10);
  assert.ok(campaign.quests.every((q) => q.reward?.per === 'each' && q.reward.xp > 0));
  // The fights and quests of the main line before the barrow.
  const quests = [
    'rumors-at-the-waystation',
    'wolves-on-the-vale-road',
    'the-goblin-raids',
    'the-pale-seal',
    'the-hermit-of-graypeak',
    'the-lord-of-thornhold',
    'the-hand-that-writes',
    'dorns-sealed-cargo',
  ];
  const foes = [
    ...['gray-wolf-1', 'gray-wolf-2', 'gray-wolf-3', 'gray-wolf-4', 'dire-wolf-1', 'dire-wolf-2'],
    ...['bandit-1', 'bandit-2', 'bandit-captain'],
    ...['goblin-raider-1', 'goblin-raider-2', 'snagtooth', 'camp-bugbear'],
    ...['camp-goblin1', 'camp-goblin2', 'skalvyr', 'crypt-shade'],
    ...[
      'thornhold-guard-1',
      'thornhold-guard-2',
      'castellan-irenne',
      'pale-sworn-1',
      'pale-sworn-2',
    ],
  ];
  const party = campaign.characters;
  const fightXP = foes.reduce((sum, id) => sum + crXP(coerceCR(creature(id).cr)), 0);
  const questXP = quests.reduce((sum, id) => sum + (questOf(id).reward?.xp ?? 0), 0);
  for (const c of party) {
    const total = c.xp + Math.floor(fightXP / party.length) + questXP;
    assert.ok(total >= 6300 && total < 7000, `${c.id} reaches ${total} XP before the barrow`);
  }
});

test('Dorn can join the escort as a companion, but starts at the crossroads', () => {
  const dorn = creature('caravan-master-dorn');
  assert.equal(dorn.travelsWithParty, undefined);
  assert.match(dorn.notes, /Travels with the party/);
});
