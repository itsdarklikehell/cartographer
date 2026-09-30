import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  combatRoster,
  creatureParticipant,
  fightInReach,
  initiativeLine,
  nearbyFoes,
  nearbyRadius,
} from '../src/combat/CombatRoster.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

test('combatRoster seeds each combatant from its DEX, takes foes beside the party, and skips a defeated foe', () => {
  const hero = createCharacter('hero', 'Hero', { DEX: 14 });
  const goblin = createCreature('gob', 'Goblin', {
    disposition: 'hostile',
    maxHP: 7,
    location: HERE,
  });
  const fallen = { ...goblin, id: 'fallen', currentHP: 0 };
  const bystander = { ...createCreature('cat', 'Cat', { location: HERE }), currentHP: 0 };
  const neighbour = createCreature('dog', 'Dog', { location: { nodeId: 'n1', tileId: '1,0' } });
  const beside = { ...goblin, id: 'gob2', location: { nodeId: 'n1', tileId: '1,1' } };
  const far = { ...goblin, id: 'far', location: { nodeId: 'n1', tileId: '2,0' } };
  const roster = combatRoster([hero], [goblin, fallen, bystander, neighbour, beside, far], HERE);
  assert.deepEqual(
    roster.map((p) => [p.id, p.initiative, p.modifier]),
    [
      ['hero', 12, 2],
      ['gob', 10, 0],
      ['cat', 10, 0],
      ['gob2', 10, 0],
    ],
  );
});

test('initiativeLine lists each result and the note that slanted it', () => {
  assert.equal(
    initiativeLine([
      { name: 'Hero', value: 15, note: '' },
      { name: 'Goblin', value: 9, note: 'poisoned, disadvantage' },
    ]),
    'Initiative rolled: Hero 15, Goblin 9 (poisoned, disadvantage).',
  );
});

const at = (/** @type {string} */ tileId) => ({ nodeId: 'n1', tileId });
/** @param {string} id @param {string} tileId @param {any} [extra] */
const foe = (id, tileId, extra = {}) => ({
  ...createCreature(id, id, { disposition: 'hostile', maxHP: 7, location: at(tileId) }),
  ...extra,
});

test('nearbyFoes lists undefeated hostiles past the encounter group, nearest first', () => {
  const creatures = [
    foe('beside', '1,1'),
    foe('far', '6,0'),
    foe('near', '3,0', { stats: { DEX: 14 } }),
    foe('down', '2,0', { currentHP: 0 }),
    foe('friend', '2,0', { disposition: 'friendly' }),
    foe('gone', '20,0'),
    foe('elsewhere', '2,0', { location: { nodeId: 'n2', tileId: '2,0' } }),
    foe('unplaced', '2,0', { location: null }),
  ];
  assert.deepEqual(
    nearbyFoes(creatures, HERE, nearbyRadius(2)).map((n) => [
      n.participant.id,
      n.distance,
      n.participant.modifier,
    ]),
    [
      ['near', 3, 2],
      ['far', 6, 0],
    ],
  );
  assert.deepEqual(nearbyFoes(creatures, /** @type {any} */ (null), 8), []);
  assert.equal(creatureParticipant(foe('x', '0,0', { stats: { DEX: 8 } })).initiative, 9);
});

test('fightInReach keeps a fight open while a hostile in it stands within the radius', () => {
  const order = [{ id: 'hero' }, { id: 'wolf' }, { id: 'cat' }].map((p) => ({
    ...p,
    initiative: 10,
  }));
  const wolf = foe('wolf', '5,0');
  const cat = foe('cat', '1,0', { disposition: 'neutral' });
  assert.equal(fightInReach(order, [wolf], HERE, 8), true);
  assert.equal(fightInReach(order, [wolf], HERE, 4), false);
  assert.equal(fightInReach(order, [cat], HERE, 0), true);
  assert.equal(fightInReach(order, [{ ...cat, location: at('3,0') }], HERE, 8), false);
  assert.equal(fightInReach(order, [{ ...wolf, location: null }], HERE, 8), false);
  assert.equal(fightInReach(order, [foe('other', '1,0')], HERE, 8), false);
});
