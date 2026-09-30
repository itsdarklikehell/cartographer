import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepPairs } from '../src/ui/NPCPanel.js';

test('keepPairs joins each column and row number to its word', () => {
  assert.equal(keepPairs('Briarwick Vale, column 11, row 4'), 'Briarwick Vale, column 11, row 4');
  assert.equal(keepPairs('Everywhere'), 'Everywhere');
});
