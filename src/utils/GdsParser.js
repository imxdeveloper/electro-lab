// Minimal GDSII stream reader used by the Chip View workspace.
//
// It reads the record stream into library/structure/element data so the viewer
// can rasterize boundaries, boxes, and paths for viewing. Structure references
// (SREF/AREF), labels (TEXT), and nodes are reported as counts instead of being
// flattened, because Chip View is a viewer and not a layout engine.
//
// Real layout files come in two record numberings: the current GDSII table and
// the older "unified" table still emitted by some OpenLane/KLayout flows. The
// header codes (HEADER through ENDSTR) are shared; everything above them is
// shifted by 0x1d, so the table is detected from the first polygon record.

export const GDSRecordTables = {
  modern: {
    BOX: 0x24,
    BOUNDARY: 0x25,
    PATH: 0x26,
    SREF: 0x27,
    AREF: 0x28,
    TEXT: 0x29,
    LAYER: 0x2a,
    DATATYPE: 0x2b,
    WIDTH: 0x2c,
    XY: 0x2d,
    ENDEL: 0x2e,
    SNAME: 0x2f,
    COLROW: 0x30,
    TEXTNODE: 0x31,
    NODE: 0x32,
    STRING: 0x36
  },
  legacy: {
    BOX: null,
    BOUNDARY: 0x08,
    PATH: 0x09,
    SREF: 0x0a,
    AREF: 0x0b,
    TEXT: 0x0c,
    LAYER: 0x0d,
    DATATYPE: 0x0e,
    WIDTH: 0x0f,
    XY: 0x10,
    ENDEL: 0x11,
    SNAME: 0x12,
    COLROW: 0x13,
    TEXTNODE: 0x14,
    NODE: 0x15,
    STRING: 0x19
  }
};

const HEADER_RECORDS = {
  HEADER: 0x00,
  BGNLIB: 0x01,
  LIBNAME: 0x02,
  UNITS: 0x03,
  ENDLIB: 0x04,
  BGNSTR: 0x05,
  STRNAME: 0x06,
  ENDSTR: 0x07
};

const DATA_TYPES = {
  NO_DATA: 0,
  BIT_ARRAY: 1,
  INT_2: 2,
  INT_4: 3,
  REAL_4: 4,
  REAL_8: 5,
  ASCII: 6
};

// GDSII 8-byte real: bit 7 of the first byte is the sign, the remaining 7 bits
// are a base-16 exponent biased by 64, and bytes 1-7 hold a 56-bit fraction.
export function readGdsReal8(view, offset) {
  const sign = view.getUint8(offset) & 0x80 ? -1 : 1;
  const exponent = (view.getUint8(offset) & 0x7f) - 64;
  let mantissa = 0;
  for (let index = 1; index < 8; index += 1) mantissa = mantissa * 256 + view.getUint8(offset + index);
  return sign * (mantissa / 2 ** 56) * 16 ** exponent;
}

function readInt2(view, offset) {
  return view.getUint16(offset, false);
}

function readInt4(view, offset) {
  return view.getInt32(offset, false);
}

function readAscii(view, start, length) {
  let text = '';
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(view.getUint8(start + index));
  return text.replace(/\0+$/, '').trim();
}

export function getFileExtension(name = '') {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

export function isGdsFileName(name = '') {
  const extension = getFileExtension(name);
  return extension === 'gds' || extension === 'gdsii' || extension === 'gds2';
}

export function isGltfFileName(name = '') {
  const extension = getFileExtension(name);
  return extension === 'gltf' || extension === 'glb';
}

function toView(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return { bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
}

/**
 * Decide which record numbering a stream uses. The first multi-point XY record
 * is decisive: 0x2d in the modern table, 0x10 in the legacy one.
 */
export function detectRecordTable(buffer) {
  const { bytes, view } = toView(buffer);
  let offset = 0;
  let scanned = 0;
  while (offset + 4 <= bytes.byteLength && scanned < 4000) {
    const length = view.getUint16(offset, false);
    if (length < 4 || offset + length > bytes.byteLength) break;
    const type = view.getUint8(offset + 2);
    const dataType = view.getUint8(offset + 3);
    const dataLength = length - 4;
    if (dataType === DATA_TYPES.INT_4 && dataLength >= 24 && dataLength % 8 === 0) {
      if (type === GDSRecordTables.modern.XY) return 'modern';
      if (type === GDSRecordTables.legacy.XY) return 'legacy';
    }
    if (dataType === DATA_TYPES.NO_DATA) {
      if (type === GDSRecordTables.modern.ENDEL) return 'modern';
      if (type === GDSRecordTables.legacy.ENDEL) return 'legacy';
    }
    offset += length;
    scanned += 1;
  }
  return 'modern';
}

/**
 * Parse a GDSII byte stream into plain data.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {object} library description
 */
export function parseGdsii(input) {
  const { bytes, view } = toView(input);
  const tableName = detectRecordTable(bytes);
  const table = GDSRecordTables[tableName];
  const warnings = [];

  const result = {
    libraryName: '',
    recordTable: tableName,
    units: { userUnitPerDbUnit: 0.001, dbUnitInMeters: 1e-6, micronPerDbUnit: 1 },
    structures: [],
    layers: [],
    stats: {
      structures: 0,
      elements: 0,
      boundaries: 0,
      boxes: 0,
      paths: 0,
      structureReferences: 0,
      arrayReferences: 0,
      labels: 0,
      nodes: 0,
      unsupported: 0,
      renderedElements: 0
    },
    boundingBox: null,
    warnings
  };

  const elementTypes = new Map([
    [table.BOUNDARY, 'BOUNDARY'],
    [table.PATH, 'PATH'],
    [table.SREF, 'SREF'],
    [table.AREF, 'AREF'],
    [table.TEXT, 'TEXT']
  ]);
  if (table.BOX !== null) elementTypes.set(table.BOX, 'BOX');

  let offset = 0;
  let sawHeader = false;
  let currentStructure = null;
  let currentElement = null;

  const finishElement = () => {
    if (!currentElement) return;
    result.stats.elements += 1;
    if (currentElement.type === 'BOUNDARY') result.stats.boundaries += 1;
    else if (currentElement.type === 'BOX') result.stats.boxes += 1;
    else if (currentElement.type === 'PATH') result.stats.paths += 1;
    else if (currentElement.type === 'SREF') result.stats.structureReferences += 1;
    else if (currentElement.type === 'AREF') result.stats.arrayReferences += 1;
    else if (currentElement.type === 'TEXT') result.stats.labels += 1;
    else if (currentElement.type === 'NODE' || currentElement.type === 'TEXTNODE') result.stats.nodes += 1;
    currentStructure?.elements.push(currentElement);
    currentElement = null;
  };

  const startElement = (type) => {
    finishElement();
    if (currentStructure) currentElement = { type, layer: 0, datatype: 0, points: [], width: 0 };
  };

  while (offset + 4 <= bytes.byteLength) {
    const length = view.getUint16(offset, false);
    if (length < 4 || offset + length > bytes.byteLength) {
      warnings.push('The GDS stream ended in the middle of a record.');
      break;
    }
    const recordType = view.getUint8(offset + 2);
    const dataType = view.getUint8(offset + 3);
    const dataStart = offset + 4;
    const dataLength = length - 4;

    if (elementTypes.has(recordType)) {
      startElement(elementTypes.get(recordType));
    } else if (recordType === table.ENDEL) {
      finishElement();
    } else if (recordType === HEADER_RECORDS.HEADER) {
      sawHeader = true;
    } else if (recordType === HEADER_RECORDS.LIBNAME) {
      result.libraryName = readAscii(view, dataStart, dataLength);
    } else if (recordType === HEADER_RECORDS.UNITS) {
      if (dataType === DATA_TYPES.REAL_8 && dataLength >= 16) {
        const userUnitPerDbUnit = readGdsReal8(view, dataStart);
        const dbUnitInMeters = readGdsReal8(view, dataStart + 8);
        if (Number.isFinite(userUnitPerDbUnit) && Number.isFinite(dbUnitInMeters) && userUnitPerDbUnit > 0 && dbUnitInMeters > 0) {
          result.units = {
            userUnitPerDbUnit,
            dbUnitInMeters,
            micronPerDbUnit: userUnitPerDbUnit * (1e6 * dbUnitInMeters)
          };
        } else {
          warnings.push('The UNITS record was unreadable; a 1 nm database unit is assumed.');
          result.units.micronPerDbUnit = 1;
        }
      }
    } else if (recordType === HEADER_RECORDS.BGNSTR) {
      currentStructure = { name: '', elements: [] };
      result.structures.push(currentStructure);
      result.stats.structures += 1;
    } else if (recordType === HEADER_RECORDS.STRNAME) {
      if (currentStructure) currentStructure.name = readAscii(view, dataStart, dataLength) || 'UNNAMED';
    } else if (recordType === HEADER_RECORDS.ENDSTR) {
      finishElement();
      currentStructure = null;
    } else if ((recordType === table.NODE || recordType === table.TEXTNODE) && !elementTypes.has(recordType)) {
      startElement(recordType === table.NODE ? 'NODE' : 'TEXTNODE');
    } else if (currentElement && recordType === table.LAYER && dataType === DATA_TYPES.INT_2) {
      currentElement.layer = readInt2(view, dataStart);
    } else if (currentElement && recordType === table.DATATYPE && dataType === DATA_TYPES.INT_2) {
      currentElement.datatype = readInt2(view, dataStart);
    } else if (currentElement && recordType === table.WIDTH && dataType === DATA_TYPES.INT_4) {
      currentElement.width = readInt4(view, dataStart);
    } else if (currentElement && recordType === table.XY && dataType === DATA_TYPES.INT_4) {
      for (let index = 0; index + 8 <= dataLength; index += 8) {
        currentElement.points.push([readInt4(view, dataStart + index), readInt4(view, dataStart + index + 4)]);
      }
    } else if (currentElement && recordType === table.SNAME && dataType === DATA_TYPES.ASCII) {
      currentElement.sname = readAscii(view, dataStart, dataLength);
    } else if (currentElement && recordType === table.STRING && dataType === DATA_TYPES.ASCII) {
      currentElement.string = readAscii(view, dataStart, dataLength);
    } else if (currentElement && recordType === table.COLROW && dataType === DATA_TYPES.INT_2 && dataLength >= 4) {
      currentElement.cols = readInt2(view, dataStart);
      currentElement.rows = readInt2(view, dataStart + 2);
    }

    offset += length;
  }

  finishElement();

  if (offset < bytes.byteLength) {
    warnings.push(`${bytes.byteLength - offset} trailing byte(s) could not be read as a GDSII record.`);
  }
  if (!sawHeader) warnings.push('No GDSII HEADER record was found; this may not be a GDSII stream.');
  if (!result.structures.length) warnings.push('The library contains no structures.');

  // Layer inventory plus the overall drawing extent.
  const layerMap = new Map();
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const structure of result.structures) {
    for (const element of structure.elements) {
      const key = `${element.layer}/${element.datatype}`;
      const entry = layerMap.get(key) ?? { layer: element.layer, datatype: element.datatype, elements: 0 };
      entry.elements += 1;
      layerMap.set(key, entry);
      for (const [x, y] of element.points) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        box.minX = Math.min(box.minX, x);
        box.minY = Math.min(box.minY, y);
        box.maxX = Math.max(box.maxX, x);
        box.maxY = Math.max(box.maxY, y);
      }
    }
  }
  result.layers = [...layerMap.values()].sort((a, b) => a.layer - b.layer || a.datatype - b.datatype);
  result.boundingBox = Number.isFinite(box.minX) ? box : null;

  return result;
}