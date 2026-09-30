import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOutcomes } from '../src/app/spellOutcomes.js';
import { applyToTarget } from '../src/app/combatants.js';
import { createCharacter, damageCharacter, getHP, withHP } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { killOutright, dropToDying } from '../src/entities/DeathSaves.js';
import { DEFAULT_SPELLS as SPELLS } from '../src/data/spells.js';
import { stubApp } from './helpers/app.js';

const HERE = { nodeId: 'root', x: 0, y: 0 };
const spellById = (/** @type {string} */ id) => {
  const found = SPELLS.find((s) => s.id === id);
  assert.ok(found, id);
  return found;
};
const revivify = spellById('revivify');
const cure = spellById('cure-wounds');

/** A 12 HP character at 0 HP, dying. */
const dying = () => dropToDying(damageCharacter(withHP(createCharacter('pc', 'Ada'), 12), 12));
const dead = () => killOutright(dying());

/**
 * Cast a heal spell at one target through the outcome path.
 * @param {any} app
 * @param {any} spell
 * @param {{ id: string, name: string }} target
 * @param {number} total
 */
function castHeal(app, spell, target, total) {
  applyOutcomes(
    app,
    spell,
    { outcomes: [{ target, healing: { total } }], targets: [target] },
    'cleric',
  );
}

test('a healing spell has no effect on a dead character, and the log says why', () => {
  const app = stubApp({ state: { characters: [dead()] } });
  castHeal(app, cure, { id: 'pc', name: 'Ada' }, 8);
  assert.deepEqual(app.log, ['Cure Wounds has no effect on Ada, who is dead.']);
  assert.equal(getHP(app.state.characters[0]).current, 0);
  assert.equal(app.state.characters[0].deathSaves.failures, 3);
});

test('Revivify raises a dead character to 1 HP', () => {
  const app = stubApp({ state: { characters: [dead()] } });
  castHeal(app, revivify, { id: 'pc', name: 'Ada' }, 1);
  assert.deepEqual(app.log, ['Revivify heals Ada for 1 HP.', 'Ada returns to life.']);
  assert.equal(getHP(app.state.characters[0]).current, 1);
  assert.equal(app.state.characters[0].deathSaves, null);
});

test('Revivify has no effect on a dying character', () => {
  const app = stubApp({ state: { characters: [dying()] } });
  castHeal(app, revivify, { id: 'pc', name: 'Ada' }, 1);
  assert.deepEqual(app.log, ['Revivify has no effect on Ada, who is not dead.']);
  assert.equal(getHP(app.state.characters[0]).current, 0);
});

test('a healing spell skips a creature at 0 HP, and Revivify raises one', () => {
  const goblin = { ...createCreature('gob', 'Goblin', { location: HERE }), maxHP: 7, currentHP: 0 };
  const app = stubApp({ state: { creatures: [goblin] } });
  castHeal(app, cure, { id: 'gob', name: 'Goblin' }, 5);
  assert.deepEqual(app.log, ['Cure Wounds has no effect on Goblin, who is at 0 HP.']);
  assert.equal(app.state.creatures[0].currentHP, 0);
  castHeal(app, revivify, { id: 'gob', name: 'Goblin' }, 1);
  assert.equal(app.state.creatures[0].currentHP, 1);
  castHeal(app, revivify, { id: 'gob', name: 'Goblin' }, 1);
  assert.equal(app.log.at(-1), 'Revivify has no effect on Goblin, who is not dead.');
});

test('a heal on a target that is gone still logs the heal line', () => {
  const app = stubApp();
  castHeal(app, cure, { id: 'nobody', name: 'Nobody' }, 3);
  assert.deepEqual(app.log, ['Cure Wounds heals Nobody for 3 HP.']);
});

test('the manual heal control logs a dead character and writes no amount line', () => {
  const app = stubApp({ state: { characters: [dead()] } });
  applyToTarget(app, 'pc', 5, true, { manual: true });
  assert.deepEqual(app.log, ['Ada is dead, and the heal has no effect.']);
  assert.equal(getHP(app.state.characters[0]).current, 0);
});

test('a reviving heal on a living character through the write path logs the refusal', () => {
  const app = stubApp({ state: { characters: [withHP(createCharacter('pc', 'Ada'), 12)] } });
  applyToTarget(app, 'pc', 1, true, { revives: true });
  assert.deepEqual(app.log, ['Ada is not dead, and the spell has no effect.']);
});
