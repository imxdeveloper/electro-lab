import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGdsii, flattenStructure, findTopStructure, structureBounds, applyTransform } from '../src/utils/GdsParser.js';
import { extractTransistors, detectDeviceLayers } from '../src/utils/GdsTransistors.js';
import { describeLayer, detectPdk } from '../src/data/PdkLayerMaps.js';
import { buildGdsModel, nameLayoutLayer } from '../src/utils/GdsSceneBuilder.js';

// A two-cell library: TOP places one CELL twice, once mirrored. CELL holds one
// poly finger crossing an n-diff and a p-diff, so it has two transistors.
const NO_DATA = 0;
const INT_2 = 2;
const INT_4 = 3;
const REAL_8 = 5;
const ASCII = 6;
const BIT_ARRAY = 1;

function record(type, dataType, payload = new Uint8Array()) {
  const out = new Uint8Array(payload.length + 4);
  const view = new DataView(out.buffer);
  view.setUint16(0, out.length, false);
  out[2] = type;
  out[3] = dataType;
  out.set(payload, 4);
  return out;
}
const int2 = (value) => { const out = new Uint8Array(2); new DataView(out.buffer).setUint16(0, value, false); return out; };
const int4 = (value) => { const out = new Uint8Array(4); new DataView(out.buffer).setInt32(0, value, false); return out; };
const ascii = (text) => new TextEncoder().encode(text);
const xy = (pairs) => {
  const out = new Uint8Array(pairs.length * 8);
  const view = new DataView(out.buffer);
  pairs.forEach(([x, y], index) => { view.setInt32(index * 8, x, false); view.setInt32(index * 8 + 4, y, false); });
  return out;
};
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
const real8 = (value) => {
  if (value === 0) return new Uint8Array(8);
  let exponent = Math.ceil(Math.log(Math.abs(value)) / Math.log(16));
  let mantissa = Math.round((Math.abs(value) / 16 ** exponent) * 2 ** 56);
  if (mantissa >= 2 ** 56) { mantissa = Math.floor(mantissa / 16); exponent += 1; }
  const out = new Uint8Array(8);
  out[0] = (exponent + 64) & 0x7f;
  for (let index = 0; index < 7; index += 1) out[1 + index] = Math.floor(mantissa / 2 ** (48 - index * 8)) & 0xff;
  return out;
};
const timestamp = () => new Uint8Array(24);

const boundary = (layer, datatype, pairs) => concat([
  record(0x25, NO_DATA),
  record(0x2a, INT_2, int2(layer)),
  record(0x2b, INT_2, int2(datatype)),
  record(0x2d, INT_4, xy(pairs)),
  record(0x08, NO_DATA)
]);

// sky130 numbering: 65/20 diff, 66/20 poly, 93/44 nsdm (the n-diffusion
// marker, so devices inside it are n-channel; everything else is p-channel).
const DIFF = 65;
const POLY = 66;
const NSWDM = 93;
const DIFF_DT = 20;
const NSWDM_DT = 44;

function createTwoCellGds() {
  const boundary = (layer, datatype, pairs) => concat([
    record(0x25, NO_DATA),
    record(0x2a, INT_2, int2(layer)),
    record(0x2b, INT_2, int2(datatype)),
    record(0x2d, INT_4, xy(pairs)),
    record(0x08, NO_DATA)
  ]);
  return concat([
    record(0x00, INT_2, int2(600)),
    record(0x01, INT_2, timestamp()),
    record(0x02, ASCII, ascii('TWO\0')),
    record(0x03, REAL_8, concat([real8(0.001), real8(1e-6)])),
    // CELL: one poly finger crossing a p-diff and an n-diff -> two devices.
    record(0x05, INT_2, timestamp()),
    record(0x06, ASCII, ascii('CELL\0')),
    // n-diffusion marker over the lower half, so the device there is n-channel.
    boundary(NSWDM, NSWDM_DT, [[0, 0], [4000, 0], [4000, 3000], [0, 3000], [0, 0]]),
    boundary(DIFF, DIFF_DT, [[200, 200], [1000, 200], [1000, 1200], [200, 1200], [200, 200]]),
    // The upper diffusion sits outside the marker, so it is p-channel.
    boundary(DIFF, DIFF_DT, [[200, 4000], [1000, 4000], [1000, 5000], [200, 5000], [200, 4000]]),
    boundary(POLY, DIFF_DT, [[500, 0], [700, 0], [700, 5400], [500, 5400], [500, 0]]),
    record(0x07, NO_DATA),
    // TOP places CELL twice, the second mirrored.
    record(0x05, INT_2, timestamp()),
    record(0x06, ASCII, ascii('TOP\0')),
    record(0x27, NO_DATA),
    record(0x2d, INT_4, xy([[0, 0]])),
    record(0x2f, ASCII, ascii('CELL\0')),
    record(0x37, BIT_ARRAY, concat([int2(0x8000)])),
    record(0x08, NO_DATA),
    record(0x27, NO_DATA),
    record(0x2d, INT_4, xy([[10000, 0]])),
    record(0x2f, ASCII, ascii('CELL\0')),
    record(0x08, NO_DATA),
    record(0x07, NO_DATA),
    record(0x04, NO_DATA)
  ]);
}

test('layer names come from the PDK map with an honest fallback', () => {
  assert.equal(describeLayer(66, 20).name, 'poly.drawing');
  assert.equal(describeLayer(65, 20).name, 'diff.drawing');
  assert.equal(describeLayer(68, 20).name, 'met1.drawing');
  assert.equal(describeLayer(235, 4).name, 'prBoundary.boundary');
  assert.equal(describeLayer(34, 0, 'gf180').name, 'Metal1', 'GF180 metals resolve for a GF180 layout');
  assert.equal(describeLayer(999, 7).known, false);
  assert.equal(describeLayer(999, 7).name, 'Layer 999/7');
});

test('an unidentified PDK keeps numbered names instead of borrowing another one', () => {
  // Layer numbers collide between technologies, so an unknown PDK must not be
  // given the names of whichever map happens to share the most numbers.
  const nangateLike = [
    { layer: 1, datatype: 0 }, { layer: 2, datatype: 0 }, { layer: 3, datatype: 0 },
    { layer: 4, datatype: 0 }, { layer: 9, datatype: 0 }, { layer: 10, datatype: 0 },
    { layer: 13, datatype: 0 }, { layer: 15, datatype: 0 }, { layer: 17, datatype: 0 },
    { layer: 19, datatype: 0 }, { layer: 21, datatype: 0 }, { layer: 22, datatype: 0 }
  ];
  assert.equal(detectPdk(nangateLike), null);
  assert.equal(describeLayer(21, 0, 'unknown').known, false);
  assert.equal(describeLayer(21, 0, 'unknown').name, 'Layer 21/0');

  // A real sky130 layer set is identified.
  const skyLike = [
    { layer: 65, datatype: 20 }, { layer: 66, datatype: 20 }, { layer: 67, datatype: 20 },
    { layer: 68, datatype: 20 }, { layer: 69, datatype: 20 }, { layer: 70, datatype: 20 },
    { layer: 93, datatype: 44 }, { layer: 94, datatype: 20 }
  ];
  assert.equal(detectPdk(skyLike), 'sky130');
});

test('layers the PDK never documents are named from what they contain', () => {
  const structureNames = ['sky130_fd_sc_hd__buf_1', 'sky130_fd_sc_hd__nor2_1'];

  const labelLayer = nameLayoutLayer(68, 0, {
    pdk: 'sky130',
    parentNames: { 68: 'met1' },
    texts: ['TEXT'],
    strings: ['VPWR', 'VGND'],
    structureNames
  });
  assert.equal(labelLayer.name, 'met1 label');
  assert.equal(labelLayer.role, 'label');

  const cellLabel = nameLayoutLayer(83, 0, {
    pdk: 'sky130',
    parentNames: {},
    texts: ['TEXT'],
    strings: ['sky130_fd_sc_hd__buf_1'],
    structureNames
  });
  assert.equal(cellLabel.name, 'cell name label');

  const references = nameLayoutLayer(0, 0, { pdk: 'sky130', texts: ['SREF', 'AREF'], structureNames });
  assert.equal(references.name, 'cell reference');

  const unknown = nameLayoutLayer(999, 7, { pdk: 'sky130', texts: ['BOUNDARY'], structureNames });
  assert.equal(unknown.known, false);
  assert.equal(unknown.name, 'Layer 999/7');
});

test('cell metadata marker layers are not drawn but are reported', () => {
  // GF180-style layout: two cells, each carrying one marker rectangle on the
  // V5_XTOR / Dualgate / LVPWELL layers plus a real metal shape.
  const marker = (layer, datatype) => boundary(layer, datatype, [[0, 0], [100, 0], [100, 100], [0, 0]]);
  const stream = concat([
    record(0x00, INT_2, int2(600)),
    record(0x02, ASCII, ascii('MK\0')),
    record(0x03, REAL_8, concat([real8(0.001), real8(1e-6)])),
    record(0x05, INT_2, timestamp()),
    record(0x06, ASCII, ascii('CELL\0')),
    boundary(34, 0, [[0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]]),
    marker(112, 1),
    marker(55, 0),
    marker(204, 0),
    record(0x07, NO_DATA),
    record(0x05, INT_2, timestamp()),
    record(0x06, ASCII, ascii('TOP\0')),
    record(0x27, NO_DATA), record(0x2d, INT_4, xy([[0, 0]])), record(0x2f, ASCII, ascii('CELL\0')), record(0x08, NO_DATA),
    record(0x07, NO_DATA), record(0x04, NO_DATA)
  ]);

  const withoutMarkers = buildGdsModel(stream);
  assert.equal(withoutMarkers.summary.layers, 1, 'only the metal layer is drawn');
  assert.equal(withoutMarkers.summary.skippedMarkerLayers.length, 3);
  assert.deepEqual(
    withoutMarkers.summary.skippedMarkerLayers.map((entry) => entry.layer.split(' ')[0]).sort(),
    ['Dualgate', 'LVPWELL', 'V5_XTOR']
  );
  assert.equal(withoutMarkers.summary.skippedMarkerLayers[0].shapes, 1, 'one marker per placed cell');
  assert.ok(withoutMarkers.summary.skippedMarkerLayers.every((entry) => entry.reason === 'cell marker'));

  const withMarkers = buildGdsModel(stream, { drawMarkerLayers: true });
  assert.equal(withMarkers.summary.layers, 4, 'asking for them brings them back');
  assert.equal(withMarkers.summary.skippedMarkerLayers.length, 0);
});

test('label artwork is suppressed by role, not by name', () => {
  // GF180 writes label markers as polygons on datatype 10 rather than text.
  const stream = concat([
    record(0x00, INT_2, int2(600)),
    record(0x02, ASCII, ascii('LB\0')),
    record(0x03, REAL_8, concat([real8(0.001), real8(1e-6)])),
    record(0x05, INT_2, timestamp()),
    record(0x06, ASCII, ascii('TOP\0')),
    boundary(36, 0, [[0, 0], [4000, 0], [4000, 4000], [0, 4000], [0, 0]]),
    boundary(36, 10, [[0, 0], [560, 0], [560, 4000], [0, 4000], [0, 0]]),
    boundary(46, 10, [[0, 0], [1600, 0], [1600, 20000], [0, 20000], [0, 0]]),
    record(0x07, NO_DATA),
    record(0x04, NO_DATA)
  ]);

  // Three layers is too few to auto-identify a PDK, so the caller states it.
  const view = buildGdsModel(stream, { pdk: 'gf180' });
  assert.equal(view.summary.layers, 1, 'only Metal2 itself is drawn');
  const skipped = view.summary.skippedMarkerLayers;
  assert.deepEqual(skipped.map((entry) => entry.layer.split(' ')[0]).sort(), ['Metal2_Label', 'Metal4_Label']);
  assert.ok(skipped.every((entry) => entry.reason === 'label artwork'));

  assert.equal(buildGdsModel(stream, { pdk: 'gf180', drawMarkerLayers: true }).summary.layers, 3);
});

test('the top structure is the one nothing else references', () => {
  const parsed = parseGdsii(createTwoCellGds());
  assert.equal(findTopStructure(parsed).name, 'TOP');
  assert.ok(Number.isFinite(structureBounds(parsed.structures[0]).maxX));
});

test('flattening places referenced cells instead of stacking them at the origin', () => {
  const parsed = parseGdsii(createTwoCellGds());
  const flat = flattenStructure(parsed);

  assert.equal(flat.topName, 'TOP');
  assert.equal(flat.instances.length, 2);
  // Two CELL copies means the cell's shapes appear twice, at different places.
  assert.equal(flat.elements.length, 8);
  const xs = flat.elements.map((element) => element.points[0][0]);
  assert.ok(Math.max(...xs) > 5000, 'the second copy is placed, not left at the origin');
});

test('flattening keeps top geometry and prioritizes functional cells over filler references', () => {
  const box = (x) => ({ type: 'BOUNDARY', layer: 68, datatype: 20, points: [[x, 0], [x + 10, 0], [x + 10, 10], [x, 0]] });
  const ref = (sname, x) => ({ type: 'SREF', sname, points: [[x, 0]] });
  const parsed = { structures: [
    { name: 'TOP', elements: [ref('sky130_fd_sc_hd__fill_1', 100), box(0), ref('sky130_fd_sc_hd__and2_1', 200)] },
    { name: 'sky130_fd_sc_hd__fill_1', elements: [box(1)] },
    { name: 'sky130_fd_sc_hd__and2_1', elements: [box(2)] }
  ] };

  const flat = flattenStructure(parsed, 'TOP', { maxInstances: 1 });
  assert.equal(flat.truncatedAt, 1);
  assert.equal(flat.instances[0].name, 'sky130_fd_sc_hd__and2_1');
  assert.ok(flat.elements.some((element) => element.structure === 'TOP'), 'root geometry survives reference truncation');
  assert.ok(flat.elements.some((element) => element.structure === 'sky130_fd_sc_hd__and2_1'), 'functional cell geometry is expanded');
  assert.ok(!flat.elements.some((element) => element.structure === 'sky130_fd_sc_hd__fill_1'));
});

test('mirrored references flip the cell about its placement point', () => {
  const parsed = parseGdsii(createTwoCellGds());
  const flat = flattenStructure(parsed);
  const mirrored = flat.instances.find((instance) => instance.mirrored);
  const plain = flat.instances.find((instance) => !instance.mirrored);

  assert.ok(mirrored, 'one instance carries the STRANS mirror bit');
  const mirroredPoly = flat.elements
    .filter((element) => element.instanceId === mirrored.id && element.layer === 66)
    .map((element) => element.points[0][0]);
  const plainPoly = flat.elements
    .filter((element) => element.instanceId === plain.id && element.layer === 66)
    .map((element) => element.points[0][0]);
  assert.ok(mirroredPoly[0] < plainPoly[0], 'mirroring moves the geometry to the other side of the placement point');
});

test('applyTransform maps points through a 2x3 affine matrix', () => {
  assert.deepEqual(applyTransform([1, 0, 0, 1, 5, 7], 2, 3), [7, 10]);
  const rotate = [0, 1, -1, 0, 0, 0];
  assert.deepEqual(applyTransform(rotate, 1, 0), [0, 1]);
});

test('transistors are extracted per cell with the channel typed from n-well', () => {
  const parsed = parseGdsii(createTwoCellGds());
  const flat = flattenStructure(parsed);
  const { summary, gates } = extractTransistors(flat, parsed.layers, { resolution: 10 });

  assert.equal(summary.supported, true);
  assert.deepEqual(summary.diffLayers, ['65/20']);
  assert.deepEqual(summary.polyLayers, ['66/20']);
  assert.equal(gates.length, 4, 'two devices in each of the two placed cells');
  assert.equal(summary.nChannel, 2, 'the device inside the nsdm marker is n-channel');
  assert.equal(summary.pChannel, 2, 'the device outside it is p-channel');
  summary.byStructure.forEach((row) => {
    assert.equal(row.structure, 'CELL');
    assert.equal(row.gatesPerInstance, 2);
    assert.equal(row.instances, 2);
  });
});

test('layouts without device layers report why instead of inventing devices', () => {
  const routingOnly = {
    structures: [{ name: 'TOP', elements: [{ type: 'BOUNDARY', layer: 68, datatype: 20, points: [[0, 0], [10, 0], [10, 10], [0, 0]] }] }],
    layers: [{ layer: 68, datatype: 20, elements: 1 }]
  };
  const { summary, gates } = extractTransistors({ elements: routingOnly.structures[0].elements, instances: [] }, routingOnly.layers);

  assert.equal(summary.supported, false);
  assert.equal(gates.length, 0);
  assert.match(summary.reason, /pins and routing only/);
});

test('device detection is driven by the PDK layer map, not hard-coded numbers', () => {
  const detected = detectDeviceLayers({
    layers: [
      { layer: 65, datatype: 20, elements: 3 },
      { layer: 66, datatype: 20, elements: 4 },
      { layer: 93, datatype: 44, elements: 1 },
      { layer: 68, datatype: 20, elements: 9 }
    ]
  });
  assert.deepEqual(detected.diff.map((entry) => entry.id), ['65/20']);
  assert.deepEqual(detected.poly.map((entry) => entry.id), ['66/20']);
  assert.deepEqual(detected.nWell.map((entry) => entry.id), ['93/44']);
});
