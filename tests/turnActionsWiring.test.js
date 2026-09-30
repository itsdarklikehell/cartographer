import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeTurnAction, toggleBudget, turnActionsOf } from '../src/app/turnActions.js';
import { budgetOf, canSpend, spend, unspend } from '../src/combat/ActionBudget.js';
import { turnActions } from '../src/combat/TurnActions.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp } from './helpers/app.js';

/** @param {string} id @param {string} classId @param {number} level @returns {any} */
const hero = (id, classId, level) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  classes: [{ classId, level }],
  level,
  conditions: [],
  resources: [],
});

/** A stub app in a fight between a rogue, a fighter, and a goblin. */
function fight() {
  const goblin = { ...createCreature('Goblin', 7), id: 'gob' };
  const app = stubApp({
    state: /** @type {any} */ ({
      characters: [hero('wren', 'rogue', 4), hero('aldric', 'fighter', 4)],
      creatures: [goblin],
      combat: {
        order: ['wren', 'aldric', 'gob'].map((id) => ({ id, initiative: 10, modifier: 0 })),
        index: 0,
        round: 1,
        startedAt: 0,
      },
    }),
  });
  // The same budget write that encounterWiring registers.
  app.actions.spendBudget = (/** @type {string} */ id, /** @type {any} */ cost) => {
    const combat = app.state.combat;
    const i = combat.order.findIndex((/** @type {any} */ p) => p.id === id);
    if (!canSpend(combat.order[i], cost)) return false;
    const order = [...combat.order];
    order[i] = spend(order[i], cost);
    app.state.combat = { ...combat, order };
    return true;
  };
  app.actions.toggleBudget = (/** @type {string} */ id, /** @type {any} */ cost) => {
    const combat = app.state.combat;
    const i = combat ? combat.order.findIndex((/** @type {any} */ p) => p.id === id) : -1;
    if (i < 0) return null;
    const free = canSpend(combat.order[i], cost);
    const order = [...combat.order];
    order[i] = free ? spend(order[i], cost) : unspend(order[i], cost);
    app.state.combat = { ...combat, order };
    app.actions.markDirty();
    app.views.combatScreen.update();
    return free;
  };
  return app;
}

/** @param {any} app @param {string} id */
const usedOf = (app, id) =>
  budgetOf(app.state.combat.order.find((/** @type {any} */ p) => p.id === id).used);

test('a rogue of level 2 gets the Cunning Action entries, a fighter and a foe do not', () => {
  const app = fight();
  assert.ok(turnActionsOf(app, 'wren').some((a) => a.cost === 'bonus'));
  assert.ok(turnActionsOf(app, 'aldric').every((a) => a.cost === 'action'));
  assert.equal(turnActionsOf(app, 'gob').length, 6);
  assert.deepEqual(turnActionsOf(app, 'nobody'), []);
});

test('a standard action spends the action and logs a line', () => {
  const app = fight();
  const [dash] = turnActions();
  assert.equal(takeTurnAction(app, 'aldric', dash), true);
  assert.equal(usedOf(app, 'aldric').action, true);
  assert.deepEqual(app.log, ['Aldric takes the Dash action.']);
});

test('an action the turn already spent refuses with a toast and logs nothing', () => {
  /** @type {string[]} */
  const toasts = [];
  const app = fight();
  app.toasts = /** @type {any} */ ({ show: (/** @type {string} */ m) => toasts.push(m) });
  const [dash, disengage] = turnActions();
  takeTurnAction(app, 'aldric', dash);
  assert.equal(takeTurnAction(app, 'aldric', disengage), false);
  assert.deepEqual(toasts, ['Aldric has no action left this turn.']);
  assert.equal(app.log.length, 1);
  assert.equal(takeTurnAction(app, 'nobody', dash), false);
});

test('a Cunning Action hide spends the bonus action and leaves the action free', () => {
  const app = fight();
  const hide = turnActionsOf(app, 'wren').find((a) => a.id === 'hide' && a.cost === 'bonus');
  takeTurnAction(app, 'wren', /** @type {any} */ (hide));
  assert.deepEqual(usedOf(app, 'wren'), { ...usedOf(app, 'aldric'), bonus: true });
  assert.match(app.log[0], /as a bonus action \(Cunning Action\)/);
});

test('Dodge leaves a Dodging chip that ends at the start of the next turn', () => {
  const app = fight();
  const dodge = turnActions().find((a) => a.id === 'dodge');
  takeTurnAction(app, 'gob', /** @type {any} */ (dodge));
  const chip = app.state.creatures[0].conditions.find((c) => c.name === 'Dodging');
  assert.deepEqual(chip?.expires, { who: 'gob', at: 'start', count: 1 });
});

test('pressing a budget chip marks the cost used, and pressing it again frees it', () => {
  const app = fight();
  toggleBudget(app, 'aldric', 'bonus');
  assert.equal(usedOf(app, 'aldric').bonus, true);
  toggleBudget(app, 'aldric', 'bonus');
  assert.equal(usedOf(app, 'aldric').bonus, false);
  assert.deepEqual(app.log, [
    "Aldric's bonus action is marked used.",
    "Aldric's bonus action is marked free.",
  ]);
  assert.ok(app.refreshes.includes('combatScreen'));
  assert.equal(app.dirty, 2);
});

test('a budget chip outside a fight or for a stranger changes nothing', () => {
  const app = fight();
  toggleBudget(app, 'nobody', 'action');
  app.state.combat = null;
  toggleBudget(app, 'aldric', 'action');
  assert.equal(app.dirty, 0);
  assert.deepEqual(app.log, []);
});
