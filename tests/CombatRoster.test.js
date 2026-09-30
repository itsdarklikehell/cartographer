import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combatRoster, initiativeLine } from '../src/combat/CombatRoster.js';
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
