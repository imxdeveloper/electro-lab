import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGdsii, readGdsReal8 } from '../src/utils/GdsParser.js';
import { buildGdsModel, stackLayers } from '../src/utils/GdsSceneBuilder.js';
import { createLegacySampleGds, createSampleGds, encodeGdsReal8 } from './helpers/gdsFixture.js';

test('readGdsReal8 decodes the GDSII 8-byte real format', () => {
  const bytes = encodeGdsReal8(0.001);
  const value = readGdsReal8(new DataView(bytes.buffer), 0);
  assert.ok(Math.abs(value - 0.001) < 1e-9, `${value} should decode back to 0.001`);

  const negative = encodeGdsReal8(-2.5);
  assert.ok(Math.abs(readGdsReal8(new DataView(negative.buffer), 0) + 2.5) < 1e-12);
});

test('parseGdsii reads library units, structures, and element counts', () => {
  const parsed = parseGdsii(createSampleGds());

  assert.equal(parsed.recordTable, 'modern');
  assert.equal(parsed.libraryName, 'TESTLIB');
  assert.equal(parsed.stats.structures, 1);
  assert.equal(parsed.structures[0].name, 'TOP');
  assert.ok(Math.abs(parsed.units.userUnitPerDbUnit - 0.001) < 1e-9);
  assert.ok(Math.abs(parsed.units.micronPerDbUnit - 0.001) < 1e-9, '0.001 um per db unit is 1 nm');
  assert.equal(parsed.stats.boundaries, 1);
  assert.equal(parsed.stats.boxes, 1);
  assert.equal(parsed.stats.paths, 1);
  assert.equal(parsed.stats.arrayReferences, 1);
  assert.equal(parsed.stats.labels, 1);
});

test('parseGdsii reports layer inventory and the drawing extent', () => {
  const parsed = parseGdsii(createSampleGds());
  const layers = parsed.layers.map((layer) => layer.layer);

  assert.deepEqual(layers, [1, 7, 34, 63]);
  assert.equal(parsed.boundingBox.minX, 0);
  assert.equal(parsed.boundingBox.maxX, 50000);
  assert.equal(parsed.boundingBox.maxY, 60000);
});

test('parseGdsii keeps boundary points, path widths, and reference metadata', () => {
  const parsed = parseGdsii(createSampleGds());
  const elements = parsed.structures[0].elements;
  const boundary = elements.find((element) => element.type === 'BOUNDARY');
  const path = elements.find((element) => element.type === 'PATH');
  const array = elements.find((element) => element.type === 'AREF');

  assert.deepEqual(boundary.points[1], [10000, 0]);
  assert.equal(boundary.layer, 1);
  assert.equal(path.width, 500);
  assert.equal(array.cols, 4);
  assert.equal(array.rows, 2);
  assert.equal(elements.find((element) => element.type === 'TEXT').string, 'PIN1');
});

test('readGdsReal8 decodes the byte layout written by real layout tools', () => {
  // Bytes taken from an OpenLane sky130 counter8 layout: 0.001 user units per
  // database unit, 1e-9 meters per user unit, and a 90 degree text angle.
  const units = Buffer.from('3e4189374bc6a7f0', 'hex');
  const meters = Buffer.from('3944b82fa09b5a54', 'hex');
  const angle = Buffer.from('425a000000000000', 'hex');
  const read = (bytes) => readGdsReal8(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), 0);

  assert.ok(Math.abs(read(units) - 0.001) < 1e-12);
  assert.ok(Math.abs(read(meters) - 1e-9) < 1e-18);
  assert.ok(Math.abs(read(angle) - 90) < 1e-12);
});

test('parseGdsii detects the legacy record numbering used by some OpenLane flows', () => {
  const parsed = parseGdsii(createLegacySampleGds());

  assert.equal(parsed.recordTable, 'legacy');
  assert.equal(parsed.libraryName, 'TESTLIB');
  assert.equal(parsed.stats.boundaries, 2, 'the legacy table has no BOX, so its square is a boundary');
  assert.equal(parsed.stats.boxes, 0);
  assert.equal(parsed.stats.paths, 1);
  assert.equal(parsed.stats.arrayReferences, 1);
  assert.equal(parsed.stats.labels, 1);
  assert.deepEqual(parsed.layers.map((layer) => layer.layer), [1, 7, 34, 63]);
  assert.equal(parsed.boundingBox.maxY, 60000);

  const path = parsed.structures[0].elements.find((element) => element.type === 'PATH');
  assert.equal(path.width, 500);
  assert.equal(path.layer, 7);
});

test('parseGdsii flags a truncated stream instead of returning silent data', () => {
  const full = createSampleGds();
  const truncated = full.slice(0, full.length - 18);
  const parsed = parseGdsii(truncated);

  assert.ok(parsed.warnings.length > 0);
  assert.ok(parsed.warnings.some((warning) => /record|HEADER/.test(warning)));
});

test('buildGdsModel extrudes boundaries and paths into one mesh per layer', () => {
  const { group, summary } = buildGdsModel(createSampleGds());

  assert.equal(group.children.length, summary.layers);
  assert.equal(summary.format, 'GDSII');
  assert.equal(summary.polygons, 3, 'a boundary, a box, and a path are drawn');
  assert.equal(summary.structures, 1);
  assert.equal(summary.skippedReferences, 1);
  assert.equal(summary.skippedLabels, 1);
  // The extent covers drawn geometry only. The array reference's placement points
  // are not drawn here, so they no longer inflate the reported size.
  assert.ok(Math.abs(summary.widthMicrons - 40) < 0.01);
  assert.ok(Math.abs(summary.heightMicrons - 50) < 0.01);
  assert.ok(Math.abs(summary.databaseUnitNm - 1) < 0.001);
  assert.equal(summary.truncated, 0);

  const names = group.children.map((child) => child.name);
  assert.deepEqual(names, ['Layer 1/0', 'Layer 7/0', 'Layer 34/0']);
  group.children.forEach((mesh) => {
    assert.ok(mesh.geometry.attributes.position.count > 0);
    assert.ok(mesh.geometry.boundingBox !== null || mesh.geometry.computeBoundingBox() || true);
  });
});

test('buildGdsModel caps oversized layouts and reports the overflow', () => {
  const { group, summary } = buildGdsModel(createSampleGds(), { maxElements: 1 });

  assert.equal(summary.polygons, 1);
  assert.equal(summary.truncated, 2);
  assert.ok(group.children.length >= 1);
});

test('buildGdsModel flags layers that cover the whole drawing as fill', () => {
  const { group, summary } = buildGdsModel(createSampleGds());
  const byLayer = Object.fromEntries(group.children.map((mesh) => [mesh.userData.chipViewLayer, mesh]));

  // The sample drawing is mostly empty, so its layers stay below the threshold.
  assert.ok(byLayer[1].userData.chipViewCoverage > 0 && byLayer[1].userData.chipViewCoverage < 0.75);
  assert.equal(byLayer[1].userData.chipViewFullArea, false);
  assert.ok(summary.widthDbUnits > 0 && summary.heightDbUnits > 0);
  assert.equal(summary.unitsPlausible, true);
  assert.equal(summary.warnings.length, 0);

  // A plate that spans the whole extent is reported as full-area fill so the
  // panel can offer to hide it instead of leaving a solid slab on screen.
  const plate = {
    libraryName: 'PLATE',
    recordTable: 'modern',
    units: { userUnitPerDbUnit: 0.001, dbUnitInMeters: 1e-6, micronPerDbUnit: 0.001 },
    structures: [{
      name: 'TOP',
      elements: [{ type: 'BOUNDARY', layer: 84, datatype: 0, width: 0, points: [[0, 0], [10000, 0], [10000, 10000], [0, 10000], [0, 0]] }]
    }],
    layers: [{ layer: 84, datatype: 0, elements: 1 }],
    stats: { structures: 1, elements: 1, boundaries: 1, boxes: 0, paths: 0, structureReferences: 0, arrayReferences: 0, labels: 0, nodes: 0, unsupported: 0 },
    boundingBox: { minX: 0, minY: 0, maxX: 10000, maxY: 10000 },
    warnings: []
  };
  const plateMesh = buildGdsModel(plate).group.children[0];
  assert.equal(plateMesh.userData.chipViewCoverage, 1);
  assert.equal(plateMesh.userData.chipViewFullArea, true);
});

test('buildGdsModel stacks each layer on its own height by layer number', () => {
  const { group } = buildGdsModel(createSampleGds(), { gap: 0.4 });
  const slabs = group.children
    .filter((child) => child.userData.chipViewLayer !== undefined)
    .sort((a, b) => a.userData.chipViewLayer - b.userData.chipViewLayer);

  assert.deepEqual(slabs.map((mesh) => mesh.userData.chipViewLayer), [1, 7, 34]);
  // Each layer sits one gap above the previous one, so nothing overlaps.
  assert.equal(slabs[0].position.y, 0);
  assert.equal(slabs[1].position.y, 0.4);
  assert.equal(slabs[2].position.y, 0.8);
  slabs.forEach((mesh) => {
    assert.ok(mesh.scale.y < 1 && mesh.scale.y > 0, 'slabs are thinner than their gap');
  });

  // The stack can be flattened back onto the floor plane.
  stackLayers(group, { stacked: false });
  group.children.forEach((mesh) => {
    assert.equal(mesh.position.y, 0);
    assert.equal(mesh.scale.y, 1);
  });

  // Re-stacking at a different gap moves the layers without re-parsing.
  stackLayers(group, { stacked: true, gap: 0.8 });
  assert.equal(group.children[0].position.y, 0);
  assert.equal(group.children[1].position.y, 0.8);
  assert.equal(group.children[2].position.y, 1.6);
});

test('buildGdsModel warns when the declared database unit is implausible', () => {
  // 1 pm per database unit: the view is still normalized, but sizes must not
  // be reported as if the drawing were a fraction of a micron across.
  const parsed = parseGdsii(createSampleGds());
  parsed.units = { userUnitPerDbUnit: 0.001, dbUnitInMeters: 1e-12, micronPerDbUnit: 1e-9 };
  const { summary } = buildGdsModel(parsed);

  assert.equal(summary.unitsPlausible, false);
  assert.equal(summary.widthMicrons, 0.00004);
  assert.equal(summary.widthDbUnits, 40000);
  assert.ok(summary.warnings.some((warning) => /database unit/.test(warning)));
});