import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOutcomes } from '../src/app/spellOutcomes.js';
import { createCharacter, damageCharacter, getHP, withHP } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { dropToDying, killOutright } from '../src/entities/DeathSaves.js';
import { healBlocked, healBlockedLine } from '../src/entities/HealTarget.js';
import { assembleEffect } from '../src/entities/SpellDraft.js';
import { normalizeLibrary } from '../src/library/Library.js';
import { effectSummary } from '../src/view/SpellEffectText.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp } from './helpers/app.js';

const spare = /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === 'spare-the-dying'));
const dying = () => dropToDying(damageCharacter(withHP(createCharacter('pc', 'Ada'), 12), 12));

/** @param {any} app @param {{ id: string, name: string }} target */
function cast(app, target) {
  applyOutcomes(
    app,
    spare,
    { outcomes: [{ target, healing: { total: 0 } }], targets: [target] },
    'cleric',
  );
}

test('Spare the Dying is a cleric cantrip that stabilizes and skips undead and constructs', () => {
  assert.equal(spare.level, 0);
  assert.deepEqual(spare.classes, ['cleric']);
  assert.deepEqual(spare.effect, {
    kind: 'heal',
    healing: [],
    stabilizes: true,
    typeRules: { skip: ['undead', 'construct'] },
  });
  assert.equal(
    effectSummary(spare, null),
    'Stabilizes a dying character. No effect on undead, construct.',
  );
});

test('Spare the Dying stabilizes a dying character at 0 HP', () => {
  const app = stubApp({ state: { characters: [dying()] } });
  cast(app, { id: 'pc', name: 'Ada' });
  assert.deepEqual(app.log, ['Ada is stabilized at 0 HP.']);
  assert.equal(app.state.characters[0].deathSaves.stable, true);
  assert.equal(getHP(app.state.characters[0]).current, 0);
});

test('Spare the Dying has no effect on a standing, dead, or defeated target', () => {
  const standing = { ...withHP(createCharacter('up', 'Bo'), 12) };
  const dead = { ...killOutright(dying()), id: 'dead', name: 'Cy' };
  const goblin = { ...createCreature('gob', 'Goblin'), maxHP: 7, currentHP: 0 };
  const app = stubApp({ state: { characters: [standing, dead], creatures: [goblin] } });
  cast(app, { id: 'up', name: 'Bo' });
  cast(app, { id: 'dead', name: 'Cy' });
  cast(app, { id: 'gob', name: 'Goblin' });
  assert.deepEqual(app.log, [
    'Spare the Dying has no effect on Bo, who is not dying.',
    'Spare the Dying has no effect on Cy, who is not dying.',
    'Spare the Dying has no effect on Goblin, who is not dying.',
  ]);
});

test('healBlocked lets a stabilizing spell reach only a dying character', () => {
  assert.equal(healBlocked('character', dying(), false, true), null);
  assert.equal(
    healBlocked('character', withHP(createCharacter('a', 'A'), 5), false, true),
    'notDying',
  );
  assert.equal(healBlockedLine('X', 'Y', 'notDying'), 'X has no effect on Y, who is not dying.');
});

test('the library and the spell form keep the stabilize flag only when it is true', () => {
  const lib = normalizeLibrary({
    spells: [
      { name: 'Steady', effect: { kind: 'heal', healing: [], stabilizes: true } },
      { name: 'Odd', effect: { kind: 'heal', healing: [], stabilizes: 'yes' } },
    ],
  });
  assert.equal(/** @type {any} */ (lib.spells[0].effect).stabilizes, true);
  assert.equal('stabilizes' in lib.spells[1].effect, false);
  const draft = (/** @type {object} */ over) =>
    /** @type {any} */ ({ kind: 'heal', damage: [], ...over });
  assert.equal(/** @type {any} */ (assembleEffect(draft({ stabilizes: true }))).stabilizes, true);
  assert.equal('stabilizes' in assembleEffect(draft({})), false);
});
