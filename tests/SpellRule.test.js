import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spellRuleBlock, spellRuleFlag } from '../src/combat/SpellRule.js';
import { budgetOf } from '../src/combat/ActionBudget.js';

const AFTER_BONUS = budgetOf({ bonus: true, bonusSpell: true });
const AFTER_LEVELED = budgetOf({ action: true, actionSpell: true });

test('a fresh turn allows every cast', () => {
  const fresh = budgetOf(undefined);
  for (const cost of /** @type {const} */ (['action', 'bonus', 'reaction'])) {
    assert.equal(spellRuleBlock(fresh, 1, cost), null);
  }
});

test('after a bonus action spell, an action cantrip is allowed', () => {
  assert.equal(spellRuleBlock(AFTER_BONUS, 0, 'action'), null);
});

test('after a bonus action spell, a leveled action spell is blocked', () => {
  assert.match(String(spellRuleBlock(AFTER_BONUS, 1, 'action')), /only a cantrip/);
});

test('after a bonus action spell, a reaction spell on the same turn is blocked', () => {
  assert.match(String(spellRuleBlock(AFTER_BONUS, 1, 'reaction')), /only a cantrip/);
  assert.match(String(spellRuleBlock(AFTER_BONUS, 0, 'reaction')), /only a cantrip/);
});

test('after a leveled action spell, a bonus action spell is blocked', () => {
  assert.match(String(spellRuleBlock(AFTER_LEVELED, 1, 'bonus')), /already took the action/);
});

test('after an action cantrip, a bonus action spell is allowed', () => {
  assert.equal(spellRuleBlock(budgetOf({ action: true }), 1, 'bonus'), null);
});

test('a casting time longer than a turn meets no rule', () => {
  assert.equal(spellRuleBlock(AFTER_BONUS, 3, null), null);
});

test('a cast sets the flag the rule reads', () => {
  assert.equal(spellRuleFlag(1, 'bonus'), 'bonusSpell');
  assert.equal(spellRuleFlag(0, 'bonus'), 'bonusSpell');
  assert.equal(spellRuleFlag(1, 'action'), 'actionSpell');
  assert.equal(spellRuleFlag(0, 'action'), null);
  assert.equal(spellRuleFlag(1, 'reaction'), null);
  assert.equal(spellRuleFlag(1, null), null);
});
