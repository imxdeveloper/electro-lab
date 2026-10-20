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
  const preview = buildGdsVectorPreview(createSampleGds(), { maxShapes: 1 });
  assert.equal(preview.renderedShapes, 1);
  assert.equal(preview.shapesTruncated, true);
  assert.match(preview.warnings.join(' '), /Showing 1 of/);
});
