import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entriesFor, playerEntry, visibilityFields } from '../src/log/LogVisibility.js';
import { createEntry } from '../src/log/Travelogue.js';
import { logEntries } from '../src/storage/RecordCoercion.js';
import { paren, saveDetail, splitLine, unaffectedLine } from '../src/combat/SaveLines.js';

const open = createEntry('e1', 'combat', 'Goblin attacks.', 1);
const hidden = createEntry('e2', 'combat', 'Sleep rolls a pool of 15 HP.', 2, { gm: true });
const swapped = createEntry('e3', 'combat', 'Goblin takes 4 damage (HP 6/10).', 3, {
  player: 'Goblin takes 4 damage.',
});

test('visibilityFields marks a player line GM-only, and ignores an empty one', () => {
  assert.deepEqual(visibilityFields(), {});
  assert.deepEqual(visibilityFields({ gm: false, player: '' }), {});
  assert.deepEqual(visibilityFields({ gm: true }), { gm: true });
  assert.deepEqual(visibilityFields({ player: 'P' }), { gm: true, player: 'P' });
});

test('createEntry writes the flag only on a GM-only line', () => {
  assert.equal('gm' in open, false);
  assert.deepEqual(swapped, {
    id: 'e3',
    kind: 'combat',
    message: 'Goblin takes 4 damage (HP 6/10).',
    at: 3,
    gm: true,
    player: 'Goblin takes 4 damage.',
  });
});

test('a Player tab reads the player line, drops a GM line without one, and keeps the ids', () => {
  assert.equal(playerEntry(open), open);
  assert.equal(playerEntry(hidden), null);
  assert.deepEqual(playerEntry(swapped), {
    id: 'e3',
    kind: 'combat',
    at: 3,
    message: 'Goblin takes 4 damage.',
  });
  const log = [open, hidden, swapped];
  assert.equal(entriesFor(log, 'gm'), log);
  const seen = entriesFor(log, 'player');
  assert.deepEqual(
    seen.map((e) => [e.id, e.message]),
    [
      ['e1', 'Goblin attacks.'],
      ['e3', 'Goblin takes 4 damage.'],
    ],
  );
  assert.equal(entriesFor(log, 'player'), seen, 'the same source list maps once');
});

test('a saved GM-only line keeps its flag and player line through a load', () => {
  const loaded = logEntries(JSON.parse(JSON.stringify([open, hidden, swapped])));
  assert.deepEqual(loaded, [open, hidden, swapped]);
  // A flag of the wrong type still hides the line, and a stray player line on
  // an open entry drops out.
  const odd = logEntries([
    { id: 'a', at: 1, kind: 'combat', message: 'M', gm: 'yes', player: 7 },
    { id: 'b', at: 1, kind: 'combat', message: 'N', player: 'P' },
  ]);
  assert.deepEqual(odd, [
    { id: 'a', at: 1, kind: 'combat', message: 'M', gm: true },
    { id: 'b', at: 1, kind: 'combat', message: 'N' },
  ]);
});

test('the save line helpers hide a foe bonus and an HP rule from a Player tab', () => {
  assert.deepEqual(splitLine('A', 'A'), ['A', {}]);
  assert.deepEqual(splitLine('A', 'B'), ['A', { player: 'B' }]);
  assert.equal(paren(''), '');
  assert.equal(paren('x'), ' (x)');
  const roll = { bonus: 'WIS +2', ability: 'WIS', rode: '', total: 9, failedBy: null };
  assert.deepEqual(saveDetail({ ...roll, hpRule: false, secretBonus: true }), {
    gm: 'WIS +2: 9',
    player: 'WIS: 9',
  });
  assert.deepEqual(saveDetail({ ...roll, hpRule: false, secretBonus: false }), {
    gm: 'WIS +2: 9',
    player: 'WIS +2: 9',
  });
  const chip = { ...roll, failedBy: 'Paralyzed', secretBonus: true };
  assert.deepEqual(saveDetail({ ...chip, hpRule: false }), {
    gm: 'Paralyzed',
    player: 'Paralyzed',
  });
  assert.deepEqual(saveDetail({ ...chip, failedBy: '150 HP or fewer', hpRule: true }), {
    gm: '150 HP or fewer',
    player: '',
  });
  assert.deepEqual(unaffectedLine('Ogre', 'at 0 HP', false), ['Ogre is unaffected (at 0 HP).', {}]);
});

test('an in-game stamp stays on a Player line and through a load', () => {
  const stamped = { ...swapped, id: 's1', clock: { day: 2, watch: 1 }, round: 3 };
  assert.deepEqual(playerEntry(stamped), {
    id: 's1',
    at: stamped.at,
    kind: stamped.kind,
    message: stamped.player,
    clock: { day: 2, watch: 1 },
    round: 3,
  });
  const loaded = logEntries([
    { id: 'a', at: 1, kind: 'note', message: 'M', clock: { day: 2, watch: 5 }, round: 1 },
    { id: 'b', at: 1, kind: 'note', message: 'N', clock: { day: 0, watch: 1 }, round: 0 },
    { id: 'c', at: 1, kind: 'note', message: 'O', clock: { day: 1, watch: 6 } },
    { id: 'd', at: 1, kind: 'note', message: 'P', clock: 'x', round: 1.5 },
  ]);
  assert.deepEqual(
    loaded.map((e) => [e.clock ?? null, e.round ?? null]),
    [
      [{ day: 2, watch: 5 }, 1],
      [null, null],
      [null, null],
      [null, null],
    ],
  );
});
