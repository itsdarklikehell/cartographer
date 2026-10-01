import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteNodeQuestion } from '../src/view/DeleteNodeText.js';

test('the question names one map and leaves out empty counts', () => {
  assert.equal(
    deleteNodeQuestion({ name: 'Ivwick', maps: 1, creatures: 0, handouts: 0 }),
    'Delete "Ivwick" and everything inside it? This removes 1 map. Undo in the header steps back to the last save, which still has it.',
  );
});

test('the question counts maps, creatures, and handouts', () => {
  const text = deleteNodeQuestion({ name: 'Vale', maps: 4, creatures: 1, handouts: 2 });
  assert.match(text, /This removes 4 maps\./);
  assert.match(text, /1 creature placed there becomes unplaced\./);
  assert.match(text, /2 handouts bound there become campaign-wide\./);
  const many = deleteNodeQuestion({ name: 'Vale', maps: 2, creatures: 3, handouts: 1 });
  assert.match(many, /3 creatures placed there/);
  assert.match(many, /1 handout bound there/);
});
