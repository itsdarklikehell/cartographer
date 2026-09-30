import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitEventLine } from '../src/combat/HitEventLines.js';

test('hitEventLine names each hit and heal event', () => {
  const cases = [
    [{ kind: 'downed' }, 'Ada drops to 0 HP.'],
    [{ kind: 'massive' }, 'Ada dies from massive damage.'],
    [{ kind: 'failures', count: 1 }, 'Ada takes a failed death save from the hit.'],
    [{ kind: 'failures', count: 2 }, 'Ada takes two failed death saves from the hit.'],
    [{ kind: 'revived' }, 'Ada regains consciousness.'],
    [{ kind: 'dead' }, 'Ada is dead, and the heal has no effect.'],
    [{ kind: 'raised' }, 'Ada returns to life.'],
    [{ kind: 'living' }, 'Ada is not dead, and the spell has no effect.'],
    [{ kind: 'fell', spellName: 'Bless' }, 'Ada falls and loses concentration on Bless.'],
  ];
  for (const [event, line] of cases) {
    assert.equal(hitEventLine('Ada', /** @type {any} */ (event)), line);
  }
});

test('hitEventLine reports a concentration save that keeps or loses the spell', () => {
  const save = { kind: 'concentration', spellName: 'Bless', total: 14, dc: 10 };
  assert.equal(
    hitEventLine('Ada', /** @type {any} */ ({ ...save, kept: true })),
    'Ada holds concentration on Bless (CON save 14 vs DC 10).',
  );
  assert.equal(
    hitEventLine('Ada', /** @type {any} */ ({ ...save, kept: false })),
    'Ada loses concentration on Bless (CON save 14 vs DC 10).',
  );
});
