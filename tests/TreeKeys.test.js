import { test } from 'node:test';
import assert from 'node:assert/strict';
import { treeKeyAction } from '../src/view/TreeKeys.js';

/** world (open) > region (closed), then a leaf town under world. */
const rows = [
  { id: 'world', parentId: null, expanded: true },
  { id: 'region', parentId: 'world', expanded: false },
  { id: 'town', parentId: 'world', expanded: null },
];
const act = (key, id, shiftKey = false) => treeKeyAction({ key, shiftKey }, rows, id);

test('Up and Down move one row and stop at the ends', () => {
  assert.deepEqual(act('ArrowDown', 'world'), { focus: 'region' });
  assert.deepEqual(act('ArrowUp', 'region'), { focus: 'world' });
  assert.equal(act('ArrowDown', 'town'), null);
  assert.equal(act('ArrowUp', 'world'), null);
});

test('Home and End go to the first and last row', () => {
  assert.deepEqual(act('Home', 'town'), { focus: 'world' });
  assert.deepEqual(act('End', 'world'), { focus: 'town' });
});

test('Right opens a closed branch, enters an open one, and does nothing on a leaf', () => {
  assert.deepEqual(act('ArrowRight', 'region'), { expand: 'region' });
  assert.deepEqual(act('ArrowRight', 'world'), { focus: 'region' });
  assert.equal(act('ArrowRight', 'town'), null);
});

test('Left closes an open branch, or moves to the parent, or does nothing at a root', () => {
  assert.deepEqual(act('ArrowLeft', 'world'), { collapse: 'world' });
  assert.deepEqual(act('ArrowLeft', 'region'), { focus: 'world' });
  assert.deepEqual(act('ArrowLeft', 'town'), { focus: 'world' });
  const closedRoot = [{ id: 'world', parentId: null, expanded: false }];
  assert.equal(treeKeyAction({ key: 'ArrowLeft' }, closedRoot, 'world'), null);
});

test('Shift+F10 and the ContextMenu key open the row menu', () => {
  assert.deepEqual(act('ContextMenu', 'town'), { menu: 'town' });
  assert.deepEqual(act('F10', 'town', true), { menu: 'town' });
  assert.equal(act('F10', 'town'), null);
});

test('Enter and Space select the row', () => {
  assert.deepEqual(act('Enter', 'region'), { select: 'region' });
  assert.deepEqual(act(' ', 'town'), { select: 'town' });
});

test('other keys and an unknown row give null', () => {
  assert.equal(act('a', 'world'), null);
  assert.equal(act('ArrowDown', 'missing'), null);
});
