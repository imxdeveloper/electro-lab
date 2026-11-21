import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGdsVectorPreview } from '../src/utils/GdsVectorPreview.js';
import { createSampleGds } from './helpers/gdsFixture.js';

test('GDS vector preview keeps placed geometry grouped by its original layer', () => {
  const preview = buildGdsVectorPreview(createSampleGds());
  assert.ok(preview.layers.length >= 2);
  assert.ok(preview.renderedShapes > 2);
  assert.ok(preview.layers.every((layer) => layer.polygons || layer.strokes.length));
  assert.ok(preview.bounds.maxX > preview.bounds.minX);
  assert.ok(preview.bounds.maxY > preview.bounds.minY);
});

test('GDS vector preview applies the shape limit and reports truncation', () => {
  const input = createSampleGds();
  const complete = buildGdsVectorPreview(input);
  const preview = buildGdsVectorPreview(input, { maxShapes: 1 });
  assert.equal(preview.renderedShapes, 1);
  assert.equal(preview.shapesTruncated, true);
  assert.match(preview.warnings.join(' '), /representative sample of 1 of/);
  assert.deepEqual(preview.bounds, complete.bounds);
  assert.equal(preview.layers.reduce((sum, layer) => sum + layer.shapes, 0), preview.drawableShapes);
  assert.equal(preview.layers.reduce((sum, layer) => sum + layer.sampledShapes, 0), 1);
});
