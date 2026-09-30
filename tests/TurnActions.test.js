import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDARD_ACTIONS,
  STANDARD_GROUP,
  FIGHTER_GROUP,
  actionSurgeLine,
  hasCunningAction,
  secondWindLine,
  turnActionLine,
  turnActions,
} from '../src/combat/TurnActions.js';

/** @param {{ classId: string, level: number }[]} classes @returns {any} */
const hero = (classes) => ({ classes, level: classes.reduce((n, c) => n + c.level, 0) });

test('every combatant has the six standard actions, each costing the action', () => {
  const list = turnActions();
  assert.deepEqual(
    list.map((a) => a.name),
    ['Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Ready'],
  );
  assert.equal(list.length, STANDARD_ACTIONS.length);
  assert.ok(list.every((a) => a.cost === 'action' && a.group === STANDARD_GROUP));
  assert.match(list[2].title, /^Take the Dodge action: .*disadvantage/);
});

test('Cunning Action adds Dash, Disengage, and Hide as bonus actions in their own group', () => {
  const extra = turnActions({ cunningAction: true }).filter((a) => a.cost === 'bonus');
  assert.deepEqual(
    extra.map((a) => a.id),
    ['dash', 'disengage', 'hide'],
  );
  assert.ok(extra.every((a) => a.source === 'Cunning Action'));
  assert.equal(extra[0].group, 'Cunning Action (bonus action)');
  assert.match(extra[2].title, /as a bonus action/);
});

test('a rogue has Cunning Action from level 2, in any multiclass mix', () => {
  assert.equal(hasCunningAction(hero([{ classId: 'rogue', level: 1 }])), false);
  assert.equal(hasCunningAction(hero([{ classId: 'rogue', level: 2 }])), true);
  assert.equal(
    hasCunningAction(
      hero([
        { classId: 'fighter', level: 3 },
        { classId: 'rogue', level: 4 },
      ]),
    ),
    true,
  );
  assert.equal(hasCunningAction(hero([{ classId: 'fighter', level: 5 }])), false);
});

test('the log line names the action, and a bonus action names its feature', () => {
  const [dash] = turnActions();
  assert.equal(turnActionLine('Aldric', dash), 'Aldric takes the Dash action.');
  const hide = turnActions({ cunningAction: true }).at(-1);
  assert.equal(
    turnActionLine('Wren', /** @type {any} */ (hide)),
    'Wren takes the Hide action as a bonus action (Cunning Action).',
  );
  assert.equal(
    turnActionLine('Wren', { ...dash, cost: 'reaction' }),
    'Wren takes the Dash action as a reaction.',
  );
});

test('a fighter with the pools gets Second Wind and Action Surge in the Fighter group', () => {
  const list = turnActions({ secondWind: 1, actionSurge: 0 }).filter(
    (a) => a.group === FIGHTER_GROUP,
  );
  assert.deepEqual(
    list.map((a) => [a.id, a.cost, a.poolId]),
    [
      ['second-wind', 'bonus', 'second-wind'],
      ['action-surge', null, 'action-surge'],
    ],
  );
  assert.match(list[0].title, /\(1 use left\)$/);
  assert.match(list[1].title, /\(0 uses left\)$/);
  assert.equal(list[1].ariaLabel, 'Use Action Surge');
  assert.equal(
    turnActions().some((a) => a.group === FIGHTER_GROUP),
    false,
  );
});

test('the class action lines name the heal roll and the surge', () => {
  assert.equal(
    secondWindLine('Aldric', 5, 4),
    'Aldric uses Second Wind and regains 9 HP (d10 5 + 4).',
  );
  assert.equal(
    actionSurgeLine('Aldric'),
    'Aldric uses Action Surge and takes one more action this turn.',
  );
  assert.equal(
    turnActionLine('Aldric', /** @type {any} */ ({ name: 'Wait', cost: null })),
    'Aldric takes the Wait action.',
  );
});
