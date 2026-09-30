import test from 'node:test';
import assert from 'node:assert/strict';

import { bringToParty, toggleCompanion } from '../src/app/companions.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp } from './helpers/app.js';

const party = { nodeId: 'town', tileId: '3,4' };

/** A stub app with Dorn, met, standing away from the party. */
function fakeApp() {
  const dorn = {
    ...createCreature('dorn', 'Dorn', { location: { nodeId: 'town', tileId: '0,0' } }),
    met: true,
  };
  return stubApp({
    state: { creatures: [dorn] },
    partyTracker: /** @type {any} */ ({ getPosition: () => party }),
  });
}

test('bringToParty moves the NPC to the party tile and keeps it met', () => {
  const app = fakeApp();
  bringToParty(app, app.state.creatures[0]);
  assert.deepEqual(app.state.creatures[0].location, party);
  assert.equal(app.state.creatures[0].met, true);
  assert.ok(app.calls.includes('meetCreatures'));
  assert.ok(app.calls.includes('markDirty'));
});

test('toggleCompanion turns the flag on with the NPC brought along, then off', () => {
  const app = fakeApp();
  toggleCompanion(app, app.state.creatures[0]);
  assert.equal(app.state.creatures[0].travelsWithParty, true);
  assert.deepEqual(app.state.creatures[0].location, party);
  toggleCompanion(app, app.state.creatures[0]);
  assert.equal('travelsWithParty' in app.state.creatures[0], false);
  assert.deepEqual(app.state.creatures[0].location, party, 'parting leaves the NPC in place');
  assert.deepEqual(app.log, ['Dorn joins the party.', 'Dorn parts from the party.']);
  assert.deepEqual(app.playerLog, [], 'both lines are GM-only');
  toggleCompanion(app, createCreature('gone', 'Gone'));
  assert.equal(app.state.creatures.length, 1);
});
