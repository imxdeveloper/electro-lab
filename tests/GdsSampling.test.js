import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleGdsElementsByLayer } from '../src/utils/GdsSampling.js';

test('GDS shape sampling stays balanced by layer and covers the full element order', () => {
  const elements = Array.from({ length: 200 }, (_, index) => ({
    layer: index < 100 ? 1 : 2,
    datatype: 0,
    index: index % 100
  }));

  const sample = sampleGdsElementsByLayer(elements, 10);
  const layerOne = sample.filter(({ layer }) => layer === 1);
  const layerTwo = sample.filter(({ layer }) => layer === 2);

  assert.equal(sample.length, 10);
  assert.equal(layerOne.length, 5);
  assert.equal(layerTwo.length, 5);
  assert.ok(layerOne[0].index < 15);
  assert.ok(layerOne.at(-1).index > 85);
  assert.ok(layerTwo[0].index < 15);
  assert.ok(layerTwo.at(-1).index > 85);
});

test('GDS shape sampling is deterministic and respects limits smaller than layer count', () => {
  const elements = Array.from({ length: 30 }, (_, index) => ({
    layer: index % 3,
    datatype: 0,
    index
  }));

  const first = sampleGdsElementsByLayer(elements, 2);
  const second = sampleGdsElementsByLayer(elements, 2);
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assert.equal(new Set(first.map(({ layer }) => layer)).size, 2);
});
