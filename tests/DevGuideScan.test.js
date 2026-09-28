import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeLineCount } from '../scripts/dev-guide/scan.mjs';

test('codeLineCount skips blank lines and line comments', () => {
  assert.equal(codeLineCount('const a = 1;\n\n   \n// note\n  // indented\nb();\n'), 2);
});

test('codeLineCount skips every line of a block comment', () => {
  const text = ['/**', ' * Docs.', ' * @param {number} n', ' */', 'export function f(n) {}'];
  assert.equal(codeLineCount(text.join('\n')), 1);
});

test('codeLineCount counts code before or after a comment', () => {
  assert.equal(codeLineCount('x(); // trailing'), 1);
  assert.equal(codeLineCount('/* lead */ y();'), 1);
  assert.equal(codeLineCount('/* a */ /* b */'), 0);
  assert.equal(codeLineCount('/* open\n still */ z();'), 1);
  assert.equal(codeLineCount('/* open\n still */'), 0);
});

test('codeLineCount returns 0 for empty text', () => {
  assert.equal(codeLineCount(''), 0);
});
