import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fightEnd, splitCaption, xpSplit } from '../src/combat/FightEnd.js';
import { createCharacter, withHP, damageCharacter } from '../src/entities/Character.js';
import { createCreature, applyDamage } from '../src/entities/Creature.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** @param {string} id @param {number} [cr] */
const foe = (id, cr) =>
  createCreature(id, id, { disposition: 'hostile', maxHP: 10, location: HERE, cr });

/** @param {Record<string, any>} byId */
const resolver = (byId) => (/** @type {string} */ id) => byId[id] ?? null;

/** @param {string[]} ids */
const combatOf = (ids) => ({
  round: 1,
  index: 0,
  order: ids.map((id) => ({ id, initiative: 10, modifier: 0 })),
});

test('fightEnd counts foes still standing, and pays nothing before a victory', () => {
  const hero = withHP(createCharacter('hero', 'Hero'), 12);
  const end = fightEnd(
    combatOf(['hero', 'ogre', 'imp']),
    resolver({
      hero: { kind: 'character', entity: hero },
      ogre: { kind: 'creature', entity: applyDamage(foe('ogre', 2), 99) },
      imp: { kind: 'creature', entity: foe('imp', 1) },
    }),
  );
  assert.equal(end.outcome, null);
  assert.equal(end.standing, 1);
  assert.equal(end.xp, 450, 'the defeated ogre is worth CR 2');
});

test('fightEnd splits the XP of a victory among the living characters', () => {
  const hero = withHP(createCharacter('hero', 'Hero'), 12);
  const dying = damageCharacter(withHP(createCharacter('dying', 'Dying'), 8), 8);
  const dead = {
    ...damageCharacter(withHP(createCharacter('dead', 'Dead'), 8), 8),
    deathSaves: { successes: 0, failures: 3, stable: false },
  };
  const sage = createCreature('sage', 'Sage', { location: HERE });
  const end = fightEnd(
    combatOf(['hero', 'dying', 'dead', 'sage', 'ogre', 'rat', 'ghost']),
    resolver({
      hero: { kind: 'character', entity: hero },
      dying: { kind: 'character', entity: dying },
      dead: { kind: 'character', entity: dead },
      sage: { kind: 'creature', entity: sage },
      ogre: { kind: 'creature', entity: applyDamage(foe('ogre', 2), 99) },
      rat: { kind: 'creature', entity: applyDamage(foe('rat'), 99) },
    }),
  );
  assert.equal(end.outcome, 'victory');
  assert.equal(end.standing, 0);
  assert.equal(end.xp, 450, 'a foe with no challenge rating is worth nothing');
  assert.deepEqual(end.earners, ['hero', 'dying']);
  assert.equal(end.share, 225);
});

test('fightEnd shares nothing when no character is left alive', () => {
  const end = fightEnd(
    combatOf(['ogre']),
    resolver({
      ogre: { kind: 'creature', entity: applyDamage(foe('ogre', 2), 99) },
    }),
  );
  assert.deepEqual(end.earners, []);
  assert.equal(end.share, 0);
});

test('fightEnd lists the foes still standing with their worth', () => {
  const hero = withHP(createCharacter('hero', 'Hero'), 12);
  const end = fightEnd(
    combatOf(['hero', 'ogre', 'imp', 'rat']),
    resolver({
      hero: { kind: 'character', entity: hero },
      ogre: { kind: 'creature', entity: applyDamage(foe('ogre', 2), 99) },
      imp: { kind: 'creature', entity: foe('imp', 1) },
      rat: { kind: 'creature', entity: foe('rat') },
    }),
  );
  assert.deepEqual(end.standingFoes, [
    { id: 'imp', name: 'imp', xp: 200 },
    { id: 'rat', name: 'rat', xp: 0 },
  ]);
});

test('xpSplit rounds each share down and reports what is left over', () => {
  assert.deepEqual(xpSplit(50, 4), { share: 12, remainder: 2 });
  assert.deepEqual(xpSplit(100, 4), { share: 25, remainder: 0 });
  assert.deepEqual(xpSplit(30, 0), { share: 0, remainder: 30 });
  assert.deepEqual(xpSplit(-5, 2), { share: 0, remainder: 0 });
});

test('splitCaption names the split and any left over', () => {
  assert.equal(splitCaption(250, 4), '250 XP split 4 ways, 2 XP left over');
  assert.equal(splitCaption(200, 1), '200 XP split 1 way');
});
