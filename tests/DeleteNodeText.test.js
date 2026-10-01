import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteNodeQuestion } from '../src/view/DeleteNodeText.js';

test('the question names one map and leaves out empty counts', () => {
  assert.equal(
    deleteNodeQuestion({ name: 'Ivwick', maps: 1, creatures: 0, handouts: 0, inLastSave: true }),
    'Delete "Ivwick" and everything inside it? This removes 1 map. Undo in the header steps back to the last save, which still has it.',
  );
});

test('the question counts maps, creatures, and handouts', () => {
  const text = deleteNodeQuestion({
    name: 'Vale',
    maps: 4,
    creatures: 1,
    handouts: 2,
    inLastSave: true,
  });
  assert.match(text, /This removes 4 maps\./);
  assert.match(text, /1 creature placed there becomes unplaced\./);
  assert.match(text, /2 handouts bound there become campaign-wide\./);
  const many = deleteNodeQuestion({
    name: 'Vale',
    maps: 2,
    creatures: 3,
    handouts: 1,
    inLastSave: true,
  });
  assert.match(many, /3 creatures placed there/);
  assert.match(many, /1 handout bound there/);
});

test('the question counts the quest links that go with the maps', () => {
  const one = deleteNodeQuestion({
    name: 'Vale',
    maps: 1,
    creatures: 0,
    handouts: 0,
    questLinks: 1,
    inLastSave: true,
  });
  assert.match(one, /1 quest link to these maps goes too\./);
  const two = deleteNodeQuestion({
    name: 'Vale',
    maps: 1,
    creatures: 0,
    handouts: 0,
    questLinks: 2,
    inLastSave: true,
  });
  assert.match(two, /2 quest links to these maps go too\./);
});

test('the question promises no Undo for a node that the last save lacks', () => {
  const text = deleteNodeQuestion({
    name: 'Vale',
    maps: 1,
    creatures: 0,
    handouts: 0,
    inLastSave: false,
  });
  assert.match(
    text,
    /The last save does not have it yet, so Undo in the header cannot bring it back\./,
  );
  assert.doesNotMatch(text, /which still has it/);
});
