import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFightXP, askFightXP } from '../src/app/combatEnd.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** Two wolves still standing at the end of a fight, and one character. */
function ended() {
  const wolf = (/** @type {string} */ id) =>
    createCreature(id, 'Gray Wolf', {
      disposition: 'hostile',
      maxHP: 11,
      location: HERE,
      cr: 0.25,
    });
  const app = stubApp({
    state: /** @type {any} */ ({
      characters: [createCharacter('wren', 'Wren')],
      creatures: [wolf('w1'), wolf('w2')],
    }),
  });
  const end = /** @type {any} */ ({
    outcome: 'victory',
    standing: 2,
    standingFoes: [
      { id: 'w1', name: 'Gray Wolf 1', xp: 50 },
      { id: 'w2', name: 'Gray Wolf 2', xp: 50 },
    ],
    xp: 0,
    earners: ['wren'],
    share: 0,
  });
  return { app, end };
}

test('the fate select offers each standing foe, and each fate lands', async () => {
  const { app, end } = ended();
  /** @type {any[]} */
  let asked = [];
  /** @type {any} */
  let opts = {};
  const prompt = /** @type {any} */ (
    async (/** @type {string} */ _title, /** @type {any[]} */ fields, /** @type {any} */ o) => {
      asked = fields;
      opts = o;
      return { 'fate:w1': 'surrendered', 'fate:w2': 'fled', amount: '100' };
    }
  );
  const values = await askFightXP(end, { prompt });
  assert.deepEqual(
    asked.map((f) => f.name),
    ['fate:w1', 'fate:w2', 'amount'],
  );
  assert.equal(asked[0].label, 'Gray Wolf 1, 50 XP if overcome');
  assert.equal(asked[0].value, 'hostile');
  assert.equal(opts.cancelLabel, 'Back to the fight');
  assert.equal(opts.submitLabel, 'End and award');
  assert.ok(values && values !== 'none');
  applyFightXP(app, end, values);
  const w1 = app.state.creatures.find((c) => c.id === 'w1');
  assert.notEqual(w1?.disposition, 'hostile', 'a captive stands down');
  assert.equal(
    app.state.creatures.some((c) => c.id === 'w2'),
    false,
    'a fled foe leaves the campaign',
  );
  assert.ok(app.log.includes('Gray Wolf 2 flees.'));
  assert.ok(app.log.includes('The party is awarded 100 XP each for the fight.'));
  assert.equal(app.state.characters[0].xp, 100);
});

test('the fate change restates the per-character amount', async () => {
  const { end } = ended();
  /** @type {Record<string, any>} */
  const form = { 'fate:w1': 'fled', 'fate:w2': 'hostile', amount: 0 };
  /** @type {string[]} */
  const labels = [];
  const prompt = /** @type {any} */ (
    async (/** @type {string} */ _t, /** @type {any} */ _f, /** @type {any} */ o) => {
      const api = {
        get: (/** @type {string} */ n) => form[n],
        set: (/** @type {string} */ n, /** @type {any} */ v) => (form[n] = v),
        setLabel: (/** @type {string} */ _n, /** @type {string} */ l) => labels.push(l),
      };
      o.onChange('amount', api);
      o.onChange('fate:w1', api);
      return null;
    }
  );
  assert.equal(await askFightXP(end, { prompt }), null);
  assert.equal(form.amount, 50);
  assert.equal(labels.length, 1);
});

test('going back to the fight returns null, and a zero award changes no XP', async () => {
  const { app, end } = ended();
  assert.equal(await askFightXP(end, { prompt: /** @type {any} */ (async () => null) }), null);
  applyFightXP(app, end, { 'fate:w1': 'hostile', 'fate:w2': 'hostile', amount: 0 });
  assert.equal(app.state.creatures.length, 2);
  assert.equal(app.state.characters[0].xp, 0);
  assert.deepEqual(app.log, []);
});

test('a defeat, or a fight with nothing to award, opens no dialog', async () => {
  const { end } = ended();
  const prompt = /** @type {any} */ (async () => assert.fail('no dialog'));
  assert.equal(await askFightXP({ ...end, outcome: 'defeat' }, { prompt }), 'none');
  assert.equal(await askFightXP({ ...end, standingFoes: [] }, { prompt }), 'none');
  assert.equal(await askFightXP({ ...end, earners: [] }, { prompt }), 'none');
});
