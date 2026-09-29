import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chipTiming,
  dropBoundaryChips,
  ongoingChips,
  passBoundary,
} from '../src/entities/TurnEffects.js';
import { addCondition, chipLength, createCondition, outlasts } from '../src/entities/Conditions.js';

/** Every combatant in these fights is in the order. */
const inOrder = () => true;

/** A chip that ends at a boundary of `who`. */
const keyed = (name, who, at, count = 1) =>
  createCondition(name, null, { expires: { who, at, count } });

test('a boundary chip keyed to the caster ends at the start of its next turn', () => {
  const timing = chipTiming('caster-start', {
    casterId: 'mage',
    targetId: 'ogre',
    actingId: 'mage',
    inOrder,
  });
  assert.deepEqual(timing, { rounds: null, expires: { who: 'mage', at: 'start', count: 1 } });
});

test('"the end of your next turn" skips the end of the turn that is running', () => {
  const own = chipTiming('caster-end', {
    casterId: 'mage',
    targetId: 'ogre',
    actingId: 'mage',
    inOrder,
  });
  assert.equal(own.expires?.count, 2);
  // Cast on another combatant's turn, as a reaction, the next end is the one.
  const reaction = chipTiming('caster-end', {
    casterId: 'mage',
    targetId: 'ogre',
    actingId: 'ogre',
    inOrder,
  });
  assert.equal(reaction.expires?.count, 1);
});

test('a target-end chip is keyed to the target', () => {
  const timing = chipTiming('target-end', {
    casterId: 'mage',
    targetId: 'ogre',
    actingId: 'mage',
    inOrder,
  });
  assert.deepEqual(timing.expires, { who: 'ogre', at: 'end', count: 1 });
});

test('outside a fight, or keyed to someone with no turns, a boundary chip lasts one round', () => {
  const base = { casterId: 'mage', targetId: 'ogre', inOrder };
  assert.deepEqual(chipTiming('caster-start', { ...base, actingId: null }), { rounds: 1 });
  assert.deepEqual(
    chipTiming('caster-start', { ...base, actingId: 'ogre', inOrder: (id) => id !== 'mage' }),
    { rounds: 1 },
  );
});

test('a boundary counts down the chips keyed to it and ends the last one', () => {
  const list = [keyed('Blinded', 'mage', 'start'), keyed('Poisoned', 'mage', 'end', 2)];
  const start = passBoundary(list, 'mage', 'start');
  assert.deepEqual(
    start.ended.map((c) => c.name),
    ['Blinded'],
  );
  assert.deepEqual(
    start.conditions.map((c) => c.name),
    ['Poisoned'],
  );
  const end = passBoundary(start.conditions, 'mage', 'end');
  assert.equal(end.ended.length, 0);
  assert.equal(end.conditions[0].expires?.count, 1);
  assert.equal(passBoundary(end.conditions, 'mage', 'end').conditions.length, 0);
});

test('a boundary that touches nothing hands back the same list', () => {
  const list = [keyed('Blinded', 'mage', 'start'), createCondition('Prone')];
  assert.equal(passBoundary(list, 'ogre', 'start').conditions, list);
  assert.equal(passBoundary(list, 'mage', 'end').conditions, list);
});

test('dropping boundary chips takes one combatant or all of them', () => {
  const list = [keyed('Blinded', 'mage', 'start'), keyed('Poisoned', 'ogre', 'end')];
  assert.deepEqual(
    dropBoundaryChips(list, 'mage').conditions.map((c) => c.name),
    ['Poisoned'],
  );
  assert.equal(dropBoundaryChips(list).conditions.length, 0);
  const plain = [createCondition('Prone')];
  assert.equal(dropBoundaryChips(plain).conditions, plain);
});

test('only chips with damage and no repeated save deal damage at the end of a turn', () => {
  const acid = { damage: [{ count: 2, sides: 4, damageType: 'acid' }] };
  const burning = createCondition('Acid Arrow', null, { ongoing: acid });
  const dread = createCondition('Frightened', 10, {
    ongoing: acid,
    source: { spellId: 'pk', spellName: 'Phantasmal Killer', casterId: 'mage', saveEnds: true },
  });
  const empty = createCondition('Odd', null, { ongoing: { damage: [] } });
  assert.deepEqual(ongoingChips([burning, dread, empty, createCondition('Prone')]), [burning]);
});

test('a chip keeps its turn boundary and its later damage through addCondition', () => {
  const extras = {
    expires: { who: 'mage', at: /** @type {const} */ ('end'), count: 2 },
    ongoing: { damage: [{ count: 2, sides: 4, damageType: 'acid' }] },
  };
  const [chip] = addCondition([], 'Acid Arrow', null, extras);
  assert.deepEqual(chip.expires, extras.expires);
  assert.deepEqual(chip.ongoing, extras.ongoing);
  assert.deepEqual(Object.keys(createCondition('Prone')), ['name', 'rounds']);
});

test('a longer chip from another cast outlasts a shorter one of the same name', () => {
  const source = (spellId, casterId = 'mage') => ({ spellId, spellName: spellId, casterId });
  const long = createCondition('Blinded', 10, { source: source('blindness') });
  const short = createCondition('Blinded', null, {
    source: source('sunbeam'),
    expires: { who: 'mage', at: 'start', count: 1 },
  });
  assert.equal(chipLength(short), 1);
  assert.equal(chipLength(createCondition('Prone')), Infinity);
  assert.equal(outlasts(long, short), true);
  assert.equal(outlasts(short, long), false);
  // The same cast refreshes its own chip, and a hand-added chip always gives way.
  assert.equal(
    outlasts(long, createCondition('Blinded', 1, { source: source('blindness') })),
    false,
  );
  assert.equal(outlasts(createCondition('Blinded'), short), false);
  assert.equal(outlasts(undefined, short), false);
  assert.equal(outlasts(long, createCondition('Blinded', 1)), false);
});
