// Builds a small but valid GDSII byte stream used by the parser and browser
// tests. It contains two boundaries on different layers, a path, an array
// reference, and a label.

const NO_DATA = 0;
const INT_2 = 2;
const INT_4 = 3;
const REAL_8 = 5;
const ASCII = 6;

function record(type, dataType, payload = new Uint8Array()) {
  const length = payload.length + 4;
  const out = new Uint8Array(length);
  const view = new DataView(out.buffer);
  view.setUint16(0, length, false);
  out[2] = type;
  out[3] = dataType;
  out.set(payload, 4);
  return out;
}

function int2(value) {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, false);
  return out;
}

function int4(value) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setInt32(0, value, false);
  return out;
}

function ascii(text) {
  return new TextEncoder().encode(text);
}

// GDSII real8: bit 7 is the sign, bits 0-6 are a base-16 exponent biased by
// 64, and bytes 1-7 hold a 56-bit fraction.
export function encodeGdsReal8(value) {
  if (value === 0) return new Uint8Array(8);
  const sign = value < 0 ? 0x80 : 0;
  const magnitude = Math.abs(value);
  let exponent = Math.ceil(Math.log(magnitude) / Math.log(16));
  let mantissa = Math.round((magnitude / 16 ** exponent) * 2 ** 56);
  if (mantissa >= 2 ** 56) {
    mantissa = Math.floor(mantissa / 16);
    exponent += 1;
  }
  const out = new Uint8Array(8);
  out[0] = sign | ((exponent + 64) & 0x7f);
  for (let index = 0; index < 7; index += 1) {
    out[1 + index] = Math.floor(mantissa / 2 ** (48 - index * 8)) & 0xff;
  }
  return out;
}

function xy(pairs) {
  const out = new Uint8Array(pairs.length * 8);
  const view = new DataView(out.buffer);
  pairs.forEach(([x, y], index) => {
    view.setInt32(index * 8, x, false);
    view.setInt32(index * 8 + 4, y, false);
  });
  return out;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function timestamp() {
  return new Uint8Array(24);
}

// The same layout written with the older GDSII record numbering still emitted
// by some OpenLane/KLayout flows: element codes above ENDSTR are shifted by
// 0x1d and BOX does not exist (its square is written as a boundary).
const MODERN_CODES = {
  BOUNDARY: 0x25, PATH: 0x26, SREF: 0x27, AREF: 0x28, TEXT: 0x29,
  LAYER: 0x2a, DATATYPE: 0x2b, WIDTH: 0x2c, XY: 0x2d, ENDEL: 0x2e,
  COLROW: 0x30, STRING: 0x36, BOX: 0x24
};

const LEGACY_CODES = {
  BOUNDARY: 0x08, PATH: 0x09, SREF: 0x0a, AREF: 0x0b, TEXT: 0x0c,
  LAYER: 0x0d, DATATYPE: 0x0e, WIDTH: 0x0f, XY: 0x10, ENDEL: 0x11,
  COLROW: 0x13, STRING: 0x19, BOX: null
};

export function createSampleGds(options = {}) {
  const codes = options.legacy ? LEGACY_CODES : MODERN_CODES;
  const records = [
    record(0x00, INT_2, int2(600)),
    record(0x01, INT_2, timestamp()),
    record(0x02, ASCII, ascii('TESTLIB\0')),
    record(0x03, REAL_8, concat([encodeGdsReal8(0.001), encodeGdsReal8(1e-6)])),
    record(0x05, INT_2, timestamp()),
    record(0x06, ASCII, ascii('TOP\0')),
    // Boundary on layer 1: a 10 um square.
    record(codes.BOUNDARY, NO_DATA),
    record(codes.LAYER, INT_2, int2(1)),
    record(codes.DATATYPE, INT_2, int2(0)),
    record(codes.XY, INT_4, xy([[0, 0], [10000, 0], [10000, 10000], [0, 10000], [0, 0]])),
    record(codes.ENDEL, NO_DATA)
  ];

  if (codes.BOX !== null) {
    // Box on layer 34: a second square 20 um away.
    records.push(
      record(codes.BOX, NO_DATA),
      record(codes.LAYER, INT_2, int2(34)),
      record(codes.DATATYPE, INT_2, int2(0)),
      record(codes.XY, INT_4, xy([[20000, 20000], [40000, 20000], [40000, 40000], [20000, 40000], [20000, 20000]])),
      record(codes.ENDEL, NO_DATA)
    );
  } else {
    records.push(
      record(codes.BOUNDARY, NO_DATA),
      record(codes.LAYER, INT_2, int2(34)),
      record(codes.DATATYPE, INT_2, int2(0)),
      record(codes.XY, INT_4, xy([[20000, 20000], [40000, 20000], [40000, 40000], [20000, 40000], [20000, 20000]])),
      record(codes.ENDEL, NO_DATA)
    );
  }

  records.push(
    // Path on layer 7 with a 0.5 um width.
    record(codes.PATH, NO_DATA),
    record(codes.LAYER, INT_2, int2(7)),
    record(codes.WIDTH, INT_4, int4(500)),
    record(codes.XY, INT_4, xy([[0, 50000], [40000, 50000]])),
    record(codes.ENDEL, NO_DATA),
    // Array reference on layer 34 (counts only; Chip View does not flatten it).
    record(codes.AREF, NO_DATA),
    record(codes.LAYER, INT_2, int2(34)),
    record(codes.COLROW, INT_2, concat([int2(4), int2(2)])),
    record(codes.XY, INT_4, xy([[0, 0], [50000, 0], [0, 60000]])),
    record(codes.ENDEL, NO_DATA),
    // Label on layer 63.
    record(codes.TEXT, NO_DATA),
    record(codes.LAYER, INT_2, int2(63)),
    record(codes.XY, INT_4, xy([[5000, 5000]])),
    record(codes.STRING, ASCII, ascii('PIN1\0')),
    record(codes.ENDEL, NO_DATA),
    record(0x07, NO_DATA),
    record(0x04, NO_DATA)
  );

  return concat(records);
}

export function createLegacySampleGds() {
  return createSampleGds({ legacy: true });
}