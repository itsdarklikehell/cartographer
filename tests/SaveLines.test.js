import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveOutcomeLine } from '../src/combat/SaveLines.js';

const BASE = {
  name: 'Wren Tallowby',
  verdict: 'fails',
  dc: 13,
  detail: 'WIS +1: 11',
  takes: 'takes 0 damage',
  damages: false,
  cond: '',
  saved: false,
};

test('a failed save against Fear names the condition and no damage', () => {
  assert.equal(
    saveOutcomeLine({ ...BASE, cond: ', Frightened' }),
    'Wren Tallowby fails DC 13 (WIS +1: 11), Frightened.',
  );
});

test('a success with no damage and no condition reads no effect', () => {
  assert.equal(
    saveOutcomeLine({ ...BASE, verdict: 'saves', saved: true }),
    'Wren Tallowby saves DC 13 (WIS +1: 11), no effect.',
  );
});

test('a failure with nothing to report ends at the verdict', () => {
  assert.equal(saveOutcomeLine({ ...BASE, detail: '' }), 'Wren Tallowby fails DC 13.');
});

test('a damage spell keeps its damage phrase, even at 0', () => {
  assert.equal(
    saveOutcomeLine({
      ...BASE,
      verdict: 'saves',
      saved: true,
      damages: true,
      takes: 'takes 0 fire damage',
    }),
    'Wren Tallowby saves DC 13 (WIS +1: 11), takes 0 fire damage.',
  );
  assert.equal(
    saveOutcomeLine({ ...BASE, damages: true, takes: 'takes 9 cold damage', cond: ', Slowed' }),
    'Wren Tallowby fails DC 13 (WIS +1: 11), takes 9 cold damage, Slowed.',
  );
});
