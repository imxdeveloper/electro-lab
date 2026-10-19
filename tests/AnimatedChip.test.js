import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimatedChipModel } from '../src/core/AnimatedChip.js';

test('animated chip counts once per clock period', () => {
  const model = new AnimatedChipModel({ clockPeriod: 1 });

  model.update(0.4);
  assert.equal(model.value, 0);
  model.update(0.4);
  assert.equal(model.value, 0);
  model.update(0.3);
  assert.equal(model.value, 1, 'the first clock edge increments the counter');
  model.update(1);
  assert.equal(model.value, 2);
});

test('animated chip exposes binary, hex, and per-bit values', () => {
  const model = new AnimatedChipModel({ clockPeriod: 1 });
  model.update(1);
  let state = model.update(0);
  assert.equal(state.value, 1);
  assert.equal(state.binary, '00000001');
  assert.equal(state.hex, '0x01');
  assert.deepEqual(state.bits, [1, 0, 0, 0, 0, 0, 0, 0]);

  model.reset(0);
  for (let tick = 0; tick < 5; tick += 1) model.update(1);
  state = model.update(0);
  assert.equal(state.value, 5);
  assert.equal(state.binary, '00000101');
  assert.deepEqual(state.bits.slice(0, 3), [1, 0, 1]);
});

test('animated chip wraps at the bit width and toggles the clock line', () => {
  const model = new AnimatedChipModel({ bits: 2, clockPeriod: 1 });
  const seen = [];
  let clockStates = [];
  for (let tick = 0; tick < 5; tick += 1) {
    clockStates.push(model.update(1).clockHigh);
    seen.push(model.value);
  }

  assert.deepEqual(seen, [1, 2, 3, 0, 1], 'a 2-bit counter wraps after three');
  assert.deepEqual(clockStates, [true, false, true, false, true]);
});

test('animated chip catches up when frames are dropped and clamps long stalls', () => {
  const model = new AnimatedChipModel({ clockPeriod: 0.5 });
  for (let frame = 0; frame < 5; frame += 1) model.update(0.5);
  assert.equal(model.value, 5, 'every clock edge it spans is counted');

  // One long frame is clamped to a second of catch-up rather than counting
  // the whole stall, which keeps a backgrounded tab from spinning the counter.
  const stalled = new AnimatedChipModel({ clockPeriod: 0.5 });
  stalled.update(30);
  assert.equal(stalled.value, 2);
});

test('animated chip reports the clock phase for the moving electrons', () => {
  const model = new AnimatedChipModel({ clockPeriod: 2 });
  assert.equal(model.update(0).phase, 0);
  assert.ok(Math.abs(model.update(1).phase - 0.5) < 1e-9);
  assert.ok(Math.abs(model.update(0.5).phase - 0.75) < 1e-9);
});