import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wireHandoutCue } from '../src/app/handoutCue.js';
import { createHandout } from '../src/handout/Handouts.js';
import { stubApp } from './helpers/app.js';

/** A hidden handout bound to one tile of the world node. */
const on = (/** @type {string} */ id, /** @type {string} */ tileId) => ({
  ...createHandout(id, `Note ${id}`),
  nodeId: 'world',
  tileId,
});

/**
 * A GM app with the party on 2,2, recording each toast and each reveal.
 * @param {Record<string, unknown>} [state]
 */
function cueApp(state = {}) {
  /** @type {{ message: string, options: any }[]} */
  const toasts = [];
  /** @type {string[]} */
  const revealed = [];
  const app = stubApp({
    state: { handouts: [on('a', '2,2'), on('b', '5,5')], ...state },
    partyTracker: /** @type {any} */ ({ getPosition: () => ({ nodeId: 'world', tileId: '2,2' }) }),
    toasts: { show: (message, options) => toasts.push({ message, options }) },
  });
  wireHandoutCue(app, (id) => revealed.push(id));
  return { app, toasts, revealed };
}

test('the GM tab cues a hidden handout on the party tile once, with a Reveal button', () => {
  const { app, toasts, revealed } = cueApp();
  app.actions.cueHandouts();
  app.actions.cueHandouts();
  assert.deepEqual(
    toasts.map((t) => t.message),
    ["The party stands on 'Note a'."],
  );
  assert.equal(toasts[0].options.action.label, 'Reveal');
  toasts[0].options.action.onClick();
  assert.deepEqual(revealed, ['a']);
});

test('a character on their own tile cues the handout there', () => {
  const { app, toasts } = cueApp({
    characters: [{ id: 'wren', location: { nodeId: 'world', tileId: '5,5' } }, { id: 'aldric' }],
  });
  app.actions.cueHandouts();
  assert.deepEqual(
    toasts.map((t) => t.message),
    ["The party stands on 'Note a'.", "A character stands on 'Note b'."],
  );
});

test('a Player tab never cues', () => {
  const { app, toasts } = cueApp({ role: 'player' });
  app.actions.cueHandouts();
  assert.deepEqual(toasts, []);
});
