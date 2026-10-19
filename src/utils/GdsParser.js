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
    STRANS: 0x37,
    MAG: 0x38,
    ANGLE: 0x39,
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
    STRANS: 0x1a,
    MAG: 0x1b,
    ANGLE: 0x1c,
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
      if (currentStructure) {
        currentElement = {
          type, layer: 0, datatype: 0, points: [], width: 0,
          // Reference placement: bit 15 of STRANS mirrors about the Y axis.
          strans: 0, mag: 1, angle: 0, referencePoint: null
        };
      }
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
    } else if (currentElement && recordType === table.STRANS && dataType === DATA_TYPES.BIT_ARRAY && dataLength >= 2) {
      currentElement.strans = view.getUint16(dataStart, false);
    } else if (currentElement && recordType === table.MAG && dataType === DATA_TYPES.REAL_8) {
      currentElement.mag = readGdsReal8(view, dataStart);
    } else if (currentElement && recordType === table.ANGLE && dataType === DATA_TYPES.REAL_8) {
      currentElement.angle = readGdsReal8(view, dataStart);
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

// 2x3 affine transform, [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f
export const IDENTITY_TRANSFORM = [1, 0, 0, 1, 0, 0];

export function multiplyTransforms(parent, child) {
  return [
    parent[0] * child[0] + parent[2] * child[1],
    parent[1] * child[0] + parent[3] * child[1],
    parent[0] * child[2] + parent[2] * child[3],
    parent[1] * child[2] + parent[3] * child[3],
    parent[0] * child[4] + parent[2] * child[5] + parent[4],
    parent[1] * child[4] + parent[3] * child[5] + parent[5]
  ];
}

export function applyTransform(transform, x, y) {
  return [
    transform[0] * x + transform[2] * y + transform[4],
    transform[1] * x + transform[3] * y + transform[5]
  ];
}

function referenceTransform(element, originX = 0, originY = 0, arrayOffsetX = 0, arrayOffsetY = 0) {
  const mag = Number.isFinite(element.mag) && element.mag > 0 ? element.mag : 1;
  const angle = ((Number.isFinite(element.angle) ? element.angle : 0) % 360) * Math.PI / 180;
  const mirrored = ((element.strans ?? 0) & 0x8000) !== 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // GDS placement order: magnify, mirror about the Y axis, rotate, translate.
  const scaleX = mirrored ? -mag : mag;
  return multiplyTransforms([1, 0, 0, 1, originX + arrayOffsetX, originY + arrayOffsetY], [
    cos * scaleX, sin * scaleX, -sin * mag, cos * mag, 0, 0
  ]);
}

/** Axis-aligned extent of a structure's own geometry. */
export function structureBounds(structure) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const element of structure.elements) {
    for (const [x, y] of element.points) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      box.minX = Math.min(box.minX, x);
      box.minY = Math.min(box.minY, y);
      box.maxX = Math.max(box.maxX, x);
      box.maxY = Math.max(box.maxY, y);
    }
  }
  return box;
}

/**
 * Pick the layout's top structure: the one nothing else references, falling
 * back to the largest structure in the library.
 */
export function findTopStructure(parsed) {
  const referenced = new Set();
  for (const structure of parsed.structures) {
    for (const element of structure.elements) {
      if ((element.type === 'SREF' || element.type === 'AREF') && element.sname) referenced.add(element.sname);
    }
  }
  const roots = parsed.structures.filter((structure) => !referenced.has(structure.name));
  const pool = roots.length ? roots : parsed.structures;
  return pool.reduce((best, structure) => (
    structure.elements.length > (best?.elements.length ?? -1) ? structure : best
  ), null);
}

/**
 * Expand the cell hierarchy into one flat element list in top-cell coordinates,
 * following SREF and AREF placement. Without this, every sub-cell would be
 * drawn at its own local origin and the layout would look like one stacked blob.
 *
 * @returns {{ elements: object[], instances: object[], texts: object[], truncatedAt: number|null }}
 */
export function flattenStructure(parsed, topName = null, options = {}) {
  const maxInstances = options.maxInstances ?? 20000;
  const byName = new Map(parsed.structures.map((structure) => [structure.name, structure]));
  const top = topName ? byName.get(topName) : findTopStructure(parsed);
  if (!top) return { elements: [], instances: [], texts: [], topName: null, truncatedAt: null };

  const elements = [];
  const instances = [];
  const texts = [];
  const queue = [{ structure: top, transform: IDENTITY_TRANSFORM, path: top.name, instanceId: null, chain: [top.name] }];
  const boundsCache = new Map();
  let truncatedAt = null;

  const pushElement = (element, transform, path, instanceId) => {
    const moved = {
      ...element,
      points: element.points.map(([x, y]) => applyTransform(transform, x, y)),
      structure: path,
      instanceId
    };
    if (element.type === 'TEXT') texts.push(moved);
    else elements.push(moved);
  };

  while (queue.length) {
    const { structure, transform, path, instanceId, chain } = queue.shift();

    for (const element of structure.elements) {
      if (element.type === 'SREF' || element.type === 'AREF') {
        const child = byName.get(element.sname);
        // Skip only genuine cycles; the same cell placed many times is normal.
        if (!child || chain.includes(child.name)) continue;
        const origin = element.points[0] ?? [0, 0];
        const placements = element.type === 'AREF' ? arrayPlacements(element) : [[0, 0]];
        for (const [offsetX, offsetY] of placements) {
          if (instances.length >= maxInstances) {
            truncatedAt = instances.length;
            break;
          }
          const childTransform = referenceTransform(element, origin[0], origin[1], offsetX, offsetY);
          const centre = applyTransform(childTransform, 0, 0);
          const localBounds = boundsCache.get(child.name) ?? structureBounds(child);
          boundsCache.set(child.name, localBounds);
          const corners = [
            applyTransform(childTransform, localBounds.minX, localBounds.minY),
            applyTransform(childTransform, localBounds.maxX, localBounds.minY),
            applyTransform(childTransform, localBounds.maxX, localBounds.maxY),
            applyTransform(childTransform, localBounds.minX, localBounds.maxY)
          ].filter(([, y]) => Number.isFinite(y));
          const id = instances.length;
          instances.push({
            id,
            name: child.name,
            parent: path,
            mirrored: ((element.strans ?? 0) & 0x8000) !== 0,
            angle: element.angle ?? 0,
            mag: element.mag ?? 1,
            x: centre[0],
            y: centre[1],
            box: corners.length ? {
              minX: Math.min(...corners.map((point) => point[0])),
              maxX: Math.max(...corners.map((point) => point[0])),
              minY: Math.min(...corners.map((point) => point[1])),
              maxY: Math.max(...corners.map((point) => point[1]))
            } : null,
            transform: childTransform
          });
          queue.push({ structure: child, transform: childTransform, path: child.name, instanceId: id, chain: [...chain, child.name] });
        }
        if (truncatedAt !== null) break;
      } else if (element.points.length) {
        pushElement(element, transform, path, instanceId);
      }
    }
    if (truncatedAt !== null) break;
  }

  return { elements, instances, texts, topName: top.name, truncatedAt };
}

function arrayPlacements(element) {
  const [origin, columnVector, rowVector] = element.points;
  if (!columnVector || !rowVector) return [[0, 0]];
  const cols = Math.max(1, element.cols ?? 1);
  const rows = Math.max(1, element.rows ?? 1);
  const placements = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < cols; column += 1) {
      placements.push([
        (origin?.[0] ?? 0) + columnVector[0] * column + rowVector[0] * row,
        (origin?.[1] ?? 0) + columnVector[1] * column + rowVector[1] * row
      ]);
    }
  }
  return placements;
}