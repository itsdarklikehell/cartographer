import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHONE_VIEWS, phoneViewForTab, tabForPhoneView } from '../src/view/PhoneViews.js';

test('the bar lists Map, Party, Sheet, Story, and Log in order', () => {
  assert.deepEqual(
    PHONE_VIEWS.map((view) => view.label),
    ['Map', 'Party', 'Sheet', 'Story', 'Log'],
  );
  assert.ok(Object.isFrozen(PHONE_VIEWS));
});

test('a sidebar tab maps to the view that shows it', () => {
  assert.equal(phoneViewForTab('tab-session'), 'map');
  assert.equal(phoneViewForTab('tab-character'), 'sheet');
  assert.equal(phoneViewForTab('tab-story'), 'story');
  assert.equal(phoneViewForTab('tab-log'), 'log');
  assert.equal(phoneViewForTab('tab-unknown'), 'map');
});

test('a view maps to the tab it opens', () => {
  assert.equal(tabForPhoneView('map'), 'tab-session');
  assert.equal(tabForPhoneView('sheet'), 'tab-character');
  assert.equal(tabForPhoneView('party'), null);
  assert.equal(tabForPhoneView('nope'), null);
});
