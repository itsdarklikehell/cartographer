import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healingBonus } from '../src/entities/HealingBonus.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

const spell = (/** @type {string} */ id) =>
  /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));
const life = { classes: [{ classId: 'cleric', level: 4, subclass: 'Life Domain' }] };

test('Disciple of Life adds 2 + the slot level to a heal with dice', () => {
  assert.equal(healingBonus(life, spell('cure-wounds'), 1), 3);
  assert.equal(healingBonus(life, spell('cure-wounds'), 2), 4, 'an upcast uses the slot');
  assert.equal(healingBonus(life, spell('healing-word'), 1), 3);
  const byId = { classes: [{ classId: 'cleric', level: 1, subclass: 'life' }] };
  assert.equal(healingBonus(byId, spell('cure-wounds'), 1), 3);
});

test('Disciple of Life skips a heal with no dice, a revive, a stabilize, and a cantrip', () => {
  assert.equal(healingBonus(life, spell('lesser-restoration'), 2), 0);
  assert.equal(healingBonus(life, spell('revivify'), 3), 0);
  assert.equal(healingBonus(life, spell('spare-the-dying'), 0), 0);
  assert.equal(healingBonus(life, spell('fire-bolt'), 1), 0, 'not a heal');
  const cantrip = { ...spell('cure-wounds'), level: 0 };
  assert.equal(healingBonus(life, cantrip, 0), 0);
});

test('only a Life Domain cleric gets the bonus', () => {
  assert.equal(healingBonus({}, spell('cure-wounds'), 1), 0);
  const other = { classes: [{ classId: 'cleric', level: 1, subclass: 'Tempest' }] };
  assert.equal(healingBonus(other, spell('cure-wounds'), 1), 0);
  const bard = { classes: [{ classId: 'bard', level: 1, subclass: 'Life Domain' }] };
  assert.equal(healingBonus(bard, spell('cure-wounds'), 1), 0);
});
