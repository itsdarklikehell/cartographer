import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveBrush, toolChipLabel, PAINT_TAB } from '../src/view/BuildTool.js';

const grass = { id: 'grass', type: 'grass', label: 'Grass', imageRef: 'g', custom: false };

test('a brush paints only on the Paint tab', () => {
  assert.equal(effectiveBrush(grass, PAINT_TAB), grass);
  assert.equal(effectiveBrush('region', PAINT_TAB), 'region');
  assert.equal(effectiveBrush(grass, 'build-tab-tile'), null);
  assert.equal(effectiveBrush('erase', 'build-tab-encounters'), null);
});

test('the chip names what a click on the map does', () => {
  assert.equal(toolChipLabel(null, null), 'Inspect');
  assert.equal(toolChipLabel('erase', null), 'Erasing tiles');
  assert.equal(toolChipLabel('erase-path', null), 'Erasing paths');
  assert.equal(toolChipLabel('region', 'Ashogate'), 'Painting: Ashogate region');
  assert.equal(toolChipLabel('region', null), 'Clearing region links');
  assert.equal(toolChipLabel(grass, null), 'Painting: Grass');
});
