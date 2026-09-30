import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWarlockPicks,
  pactBoonPending,
  pendingInvocationCount,
  swapInvocation,
  unpickedInvocations,
} from '../src/entities/InvocationLevelUp.js';
import { emptyProficiencies } from '../src/entities/Proficiencies.js';

/** A warlock of the given level that knows Eldritch Blast. */
function warlock(level, rest = {}) {
  return /** @type {any} */ ({
    id: 'w',
    name: 'Wren',
    classes: [{ classId: 'warlock', level }],
    level,
    resources: [],
    proficiencies: emptyProficiencies(),
    spellbook: { cantrips: ['eldritch-blast'], known: [], prepared: [] },
    ...rest,
  });
}

test('pendingInvocationCount is the level count less the picks', () => {
  assert.equal(pendingInvocationCount(warlock(1)), 0);
  assert.equal(pendingInvocationCount(warlock(2)), 2);
  assert.equal(pendingInvocationCount(warlock(5, { invocations: ['agonizing-blast'] })), 2);
  assert.equal(
    pendingInvocationCount(warlock(2, { invocations: ['agonizing-blast', 'armor-of-shadows'] })),
    0,
  );
});

test('a pick that no longer qualifies counts as pending again', () => {
  // Thirsting Blade needs Pact of the Blade and 5th level.
  const c = warlock(5, { pactBoon: 'tome', invocations: ['thirsting-blade'] });
  assert.equal(pendingInvocationCount(c), 3);
});

test('pactBoonPending from 3rd warlock level until a boon is picked', () => {
  assert.equal(pactBoonPending(warlock(2)), false);
  assert.equal(pactBoonPending(warlock(3)), true);
  assert.equal(pactBoonPending(warlock(3, { pactBoon: 'chain' })), false);
});

test('unpickedInvocations leaves out the picks and what does not qualify', () => {
  const c = warlock(2, { invocations: ['agonizing-blast'] });
  const ids = unpickedInvocations(c).map((inv) => inv.id);
  assert.ok(!ids.includes('agonizing-blast'));
  assert.ok(ids.includes('armor-of-shadows'));
  assert.ok(!ids.includes('thirsting-blade'));
});

test('swapInvocation replaces a pick in place', () => {
  const c = warlock(2, { invocations: ['agonizing-blast', 'armor-of-shadows'] });
  const next = swapInvocation(c, 'agonizing-blast', 'eldritch-spear');
  assert.deepEqual(next.invocations, ['eldritch-spear', 'armor-of-shadows']);
});

test('swapInvocation refuses an unknown pick, a repeat, or one that does not qualify', () => {
  const c = warlock(2, { invocations: ['agonizing-blast', 'armor-of-shadows'] });
  assert.equal(swapInvocation(c, 'eldritch-spear', 'mask-of-many-faces'), c);
  assert.equal(swapInvocation(c, 'agonizing-blast', 'armor-of-shadows'), c);
  assert.equal(swapInvocation(c, 'agonizing-blast', 'thirsting-blade'), c);
});

test('swapInvocation undoes the skills of a swapped-out Beguiling Influence', () => {
  const c = applyWarlockPicks(warlock(2), { added: ['beguiling-influence'] });
  assert.ok(c.proficiencies.skills.includes('deception'));
  const next = swapInvocation(c, 'beguiling-influence', 'agonizing-blast');
  assert.ok(!next.proficiencies.skills.includes('deception'));
});

test('applyWarlockPicks sets the boon before the picks that need it', () => {
  const c = warlock(5, { invocations: ['agonizing-blast'] });
  const next = applyWarlockPicks(c, {
    boon: 'blade',
    added: ['thirsting-blade', 'eldritch-spear'],
  });
  assert.equal(next.pactBoon, 'blade');
  assert.deepEqual(next.invocations, ['agonizing-blast', 'thirsting-blade', 'eldritch-spear']);
});

test('applyWarlockPicks keeps a boon already picked and stops at the count', () => {
  const c = warlock(3, { pactBoon: 'chain', invocations: ['agonizing-blast'] });
  const next = applyWarlockPicks(c, {
    boon: 'tome',
    added: ['eldritch-spear', 'armor-of-shadows'],
  });
  assert.equal(next.pactBoon, 'chain');
  assert.deepEqual(next.invocations, ['agonizing-blast', 'eldritch-spear']);
});

test('applyWarlockPicks applies the swap after the new picks', () => {
  const c = warlock(5, { invocations: ['agonizing-blast', 'armor-of-shadows'] });
  const next = applyWarlockPicks(c, {
    added: ['eldritch-spear'],
    swap: { from: 'eldritch-spear', to: 'repelling-blast' },
  });
  assert.deepEqual(next.invocations, ['agonizing-blast', 'armor-of-shadows', 'repelling-blast']);
});

test('applyWarlockPicks with no picks returns the character', () => {
  const c = warlock(5);
  assert.equal(applyWarlockPicks(c, { added: [] }), c);
  assert.equal(applyWarlockPicks(c, { added: [], swap: null, boon: null }), c);
});
