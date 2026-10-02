import test from 'node:test';
import assert from 'node:assert/strict';
import { GLOW_LIMIT, PoiGlow, glowMetrics, strokeGlow } from '../src/map/PoiGlow.js';
import { INK } from '../src/map/CanvasInk.js';

/** A context that records each call, with the state each call saw. */
function recordingCtx() {
  /** @type {{ op: string, args: unknown[], shadowBlur?: number }[]} */
  const calls = [];
  const ctx = /** @type {any} */ ({
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
    save: () => calls.push({ op: 'save', args: [] }),
    restore: () => calls.push({ op: 'restore', args: [] }),
    strokeRect: (/** @type {unknown[]} */ ...args) =>
      calls.push({ op: 'strokeRect', args, shadowBlur: ctx.shadowBlur }),
    drawImage: (/** @type {unknown[]} */ ...args) => calls.push({ op: 'drawImage', args }),
  });
  return { ctx, calls };
}

/** A canvas factory whose canvases record into their own contexts. */
function canvasFactory() {
  /** @type {any[]} */
  const made = [];
  const factory = (/** @type {number} */ width, /** @type {number} */ height) => {
    const { ctx, calls } = recordingCtx();
    const canvas = { width, height, calls, getContext: () => ctx };
    made.push(canvas);
    return /** @type {any} */ (canvas);
  };
  return { factory, made };
}

test('glowMetrics pads past the blur tail and keeps a 2 px stroke floor', () => {
  const small = glowMetrics(10);
  assert.equal(small.lineWidth, 2);
  assert.equal(small.inset, 2);
  const big = glowMetrics(100);
  assert.equal(big.lineWidth, 6);
  assert.equal(big.blur, 18);
  assert.equal(big.pad, 29);
});

test('strokeGlow strokes inside the tile with the gold glow', () => {
  const { ctx, calls } = recordingCtx();
  strokeGlow(ctx, 10, 20, 100);
  assert.deepEqual(
    calls.map((c) => c.op),
    ['save', 'strokeRect', 'restore'],
  );
  assert.deepEqual(calls[1].args, [14, 24, 92, 92]);
  assert.equal(calls[1].shadowBlur, 18);
  assert.equal(ctx.strokeStyle, INK.goldLit);
  assert.equal(ctx.shadowColor, INK.goldGlow);
});

test('draw blits one sprite per size, offset by the pad', () => {
  const { factory, made } = canvasFactory();
  const glow = new PoiGlow({ createCanvas: factory });
  const { ctx, calls } = recordingCtx();
  glow.draw(ctx, 100, 200, 100);
  glow.draw(ctx, 300, 200, 100);
  assert.equal(made.length, 1);
  assert.equal(made[0].width, 158);
  assert.equal(made[0].calls[1].op, 'strokeRect');
  assert.deepEqual(made[0].calls[1].args, [33, 33, 92, 92]);
  assert.deepEqual(
    calls.map((c) => [c.op, c.args[1], c.args[2]]),
    [
      ['drawImage', 71, 171],
      ['drawImage', 271, 171],
    ],
  );
  assert.equal(calls[0].args[0], made[0]);
});

test('draw strokes straight onto ctx when no canvas can be made', () => {
  const nullGlow = new PoiGlow({ createCanvas: () => null });
  const { ctx, calls } = recordingCtx();
  nullGlow.draw(ctx, 0, 0, 50);
  assert.deepEqual(
    calls.map((c) => c.op),
    ['save', 'strokeRect', 'restore'],
  );

  const noCtx = new PoiGlow({
    createCanvas: () => /** @type {any} */ ({ getContext: () => null }),
  });
  const second = recordingCtx();
  noCtx.draw(second.ctx, 0, 0, 50);
  assert.equal(second.calls[1].op, 'strokeRect');
});

test('the default factory gives null without a DOM', () => {
  const glow = new PoiGlow();
  assert.equal(glow.createCanvas(4, 4), null);
});

test('the cache drops the least recently used size past the limit', () => {
  const { factory } = canvasFactory();
  const glow = new PoiGlow({ createCanvas: factory });
  const { ctx } = recordingCtx();
  for (let size = 1; size <= GLOW_LIMIT; size++) glow.draw(ctx, 0, 0, size);
  glow.draw(ctx, 0, 0, 1); // A hit moves size 1 to the newest end.
  glow.draw(ctx, 0, 0, GLOW_LIMIT + 1);
  assert.equal(glow.sprites.size, GLOW_LIMIT);
  assert.ok(glow.sprites.has(1));
  assert.ok(!glow.sprites.has(2));
});
