import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flattenStructure, parseGdsii } from './GdsParser.js';
import { describeLayer, detectPdk } from '../data/PdkLayerMaps.js';
import { createLabel } from './LabelSprites.js';
import { extractTransistors } from './GdsTransistors.js';

// GDSII is a 2D database format. Chip View extrudes the polygons it can read so
// a layout can be inspected in 3D; it is a preview, not a physical model.

const TARGET_SPAN = 12; // world units covered by the widest drawing dimension
const MAX_ELEMENTS = 20000;
const DEFAULT_THICKNESS = 0.25;
// Layers are stacked in ascending layer-number order, which is how mask layers
// are numbered (diffusion and implant low, metals and top layers high). It is
// an approximation, not a PDK layer map.
export const DEFAULT_STACK_GAP = 0.3;

// Stable, readable layer colors: hue from the layer number, fixed saturation.
export function layerColor(layer) {
  const color = new THREE.Color();
  color.setHSL(((layer * 47) % 360) / 360, 0.55, 0.55);
  return color;
}

function toWorldPoints(points, transform) {
  return points.map(([x, y]) => new THREE.Vector2((x - transform.cx) * transform.scale, -(y - transform.cy) * transform.scale));
}

function extrudeShape(points, thickness) {
  if (points.length < 3) return null;
  const shape = new THREE.Shape(points);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// A GDS path is a centre line plus a width. Build a solid trace so it stacks
// like every other layer instead of reading as a hairline.
function extrudePath(points, width, thickness) {
  if (points.length < 2) return null;
  const geometries = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[index + 1];
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 1e-9) continue;
    const segment = new THREE.BoxGeometry(length, thickness, width).toNonIndexed();
    segment.rotateY(-Math.atan2(y2 - y1, x2 - x1));
    segment.translate((x1 + x2) / 2, thickness / 2, -(y1 + y2) / 2);
    geometries.push(segment);
  }
  if (!geometries.length) return null;
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}

/**
 * Place every layer slab on its own Z. Layers are ordered by layer number, and
 * each slab sits in the gap above the previous one. Pass stacked: false to put
 * everything flat on the floor plane instead.
 */
export function stackLayers(group, options = {}) {
  const stacked = options.stacked ?? true;
  const gap = Math.max(options.gap ?? DEFAULT_STACK_GAP, 0.02);
  const meshes = group.children
    .filter((child) => child.userData.chipViewLayer !== undefined)
    .sort((a, b) => (a.userData.chipViewStackIndex ?? 0) - (b.userData.chipViewStackIndex ?? 0));

  meshes.forEach((mesh, index) => {
    const base = mesh.userData.chipViewBaseThickness || 0.25;
    mesh.position.y = stacked ? index * gap : 0;
    // Slabs are thinner than their gap so neighbouring layers stay readable.
    mesh.scale.y = stacked ? Math.min((gap * 0.6) / base, 1) : 1;
  });
  group.userData.chipViewStacked = stacked;
  group.userData.chipViewStackGap = gap;
  return group;
}

function boundsOfElements(elements) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const element of elements) {
    for (const [x, y] of element.points) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      box.minX = Math.min(box.minX, x);
      box.minY = Math.min(box.minY, y);
      box.maxX = Math.max(box.maxX, x);
      box.maxY = Math.max(box.maxY, y);
    }
  }
  return Number.isFinite(box.minX) ? box : null;
}

/**
 * Layers that carry no drawn artwork.
 *
 * GF180MCU streams one marker rectangle per placed cell on these layers: a 5 V
 * transistor flag, a dual-gate flag, and the low-voltage P-well flag. They are
 * placed correctly - verified to sit exactly on their cell - but they are cell
 * metadata rather than geometry, so Chip View does not extrude them by default.
 * Pass drawMarkerLayers: true to bring them back.
 */
export const MARKER_LAYERS = new Set(['V5_XTOR', 'Dualgate', 'LVPWELL']);

/**
 * Name a layer for display.
 *
 * The PDK maps cover the stream-out layers. Some flows also emit layers the tech
 * file never documents - KLayout label datatypes, areaid fill markers, and the
 * cell-name labels - so those are named from what they demonstrably contain
 * instead of being left as bare numbers.
 */
export function nameLayoutLayer(layer, datatype, context = {}) {
  const { pdk = null, parentNames = {}, texts = [], structureNames = [] } = context;
  const info = describeLayer(layer, datatype, pdk);
  if (info.known) return info;

  // Layer 0 carries the cell references themselves: no geometry, no artwork.
  if (layer === 0 && datatype === 0 && texts.length) {
    const onlyReferences = texts.every((type) => type === 'SREF' || type === 'AREF');
    if (onlyReferences) return { name: 'cell reference', role: 'other', known: true, pdk };
  }

  if (texts.length && texts.every((type) => type === 'TEXT')) {
    // A label layer whose text is made of cell names labels the instances.
    const strings = (context.strings ?? []).filter(Boolean);
    const looksLikeCellNames = strings.length > 0 && strings.every((text) => structureNames.includes(text));
    if (looksLikeCellNames) return { name: 'cell name label', role: 'label', known: true, pdk };
    const parent = parentNames[layer];
    return {
      name: parent ? `${parent} label` : `label on layer ${layer}`,
      role: 'label',
      known: true,
      pdk
    };
  }

  return info;
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

/**
 * Turn a GDSII buffer into a displayable THREE.Group.
 * @returns {{ group: THREE.Group, summary: object }}
 */
export function buildGdsModel(buffer, options = {}) {
  const parsed = buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer)
    ? parseGdsii(buffer)
    : buffer;
  const targetSpan = options.targetSpan ?? TARGET_SPAN;
  const thickness = options.thickness ?? DEFAULT_THICKNESS;
  const maxElements = options.maxElements ?? MAX_ELEMENTS;

  const drawable = [];
  // Cell geometry lives in sub-structures that the top cell places with SREFs and
  // AREFs. Drawing each structure where it was authored would stack every
  // standard cell on the origin, so the hierarchy is expanded first.
  const flat = flattenStructure(parsed, options.topStructure ?? null, {
    maxInstances: options.maxInstances ?? MAX_ELEMENTS
  });
  const structureNamesForLabels = new Set(parsed.structures.map((structure) => structure.name));
  const parentNamesForLabels = {};
  for (const layer of parsed.layers) {
    const info = describeLayer(layer.layer, layer.datatype);
    if (info.known) parentNamesForLabels[layer.layer] ??= info.name.replace(/\.\w+$/, '').toLowerCase();
  }
  const markerSkipped = new Map();
  const layoutPdk = options.pdk ?? detectPdk(parsed.layers);
  const layerRoles = new Map();
  for (const element of flat.elements) {
    if (element.type !== 'BOUNDARY' && element.type !== 'BOX' && element.type !== 'PATH') continue;
    if (element.points.length < (element.type === 'PATH' ? 2 : 3)) continue;

    // Two kinds of layer hold no real artwork: per-cell technology markers, and
    // label artwork (GF180 writes label markers as polygons, not text). Both
    // are placed correctly, so they are dropped rather than extruded over the
    // metal they annotate.
    if (options.drawMarkerLayers !== true) {
      const key = `${element.layer}/${element.datatype}`;
      let info = layerRoles.get(key);
      if (!info) {
        info = describeLayer(element.layer, element.datatype, layoutPdk);
        layerRoles.set(key, info);
      }
      const isMarker = MARKER_LAYERS.has(info.name);
      const isLabelArtwork = info.role === 'label';
      if (isMarker || isLabelArtwork) {
        const reason = isMarker ? 'cell marker' : 'label artwork';
        const label = `${info.name} ${key} ${reason}`;
        const entry = markerSkipped.get(label) ?? { layer: `${info.name} ${key}`, shapes: 0, reason };
        entry.shapes += 1;
        markerSkipped.set(label, entry);
        continue;
      }
    }
    drawable.push(element);
  }

  const rendered = drawable.slice(0, maxElements);
  const truncated = drawable.length - rendered.length;

  const box = boundsOfElements(rendered) ?? parsed.boundingBox ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const width = Math.max(box.maxX - box.minX, 1);
  const height = Math.max(box.maxY - box.minY, 1);
  const scale = targetSpan / Math.max(width, height);
  const transform = {
    cx: (box.minX + box.maxX) / 2,
    cy: (box.minY + box.maxY) / 2,
    scale
  };

  const byLayer = new Map();
  for (const element of rendered) {
    const key = `${element.layer}/${element.datatype}`;
    const bucket = byLayer.get(key) ?? { layer: element.layer, datatype: element.datatype, geometries: [], area: 0, elements: 0 };
    const worldPoints = toWorldPoints(element.points, transform);
    const geometry = element.type === 'PATH'
      ? extrudePath(worldPoints, Math.max(element.width || 0, 1) * scale, thickness)
      : extrudeShape(worldPoints, thickness);
    if (geometry) bucket.geometries.push(geometry);
    bucket.elements += 1;
    bucket.area += polygonArea(worldPoints);
    byLayer.set(key, bucket);
  }

  // Layer names: the PDK map first, then what the layer demonstrably holds.
  // An unidentified PDK must not borrow another one's names: small layer numbers
  // collide across technologies, so 'unknown' keeps the numbered fallback.
  const pdk = options.pdk ?? detectPdk(parsed.layers) ?? 'unknown';
  const structureNames = new Set(parsed.structures.map((structure) => structure.name));
  const parentNames = {};
  for (const layer of parsed.layers) {
    const info = describeLayer(layer.layer, layer.datatype, pdk);
    if (info.known) parentNames[layer.layer] ??= info.name.replace(/\.\w+$/, '').toLowerCase();
  }
  const layerContexts = new Map();
  for (const structure of parsed.structures) {
    for (const element of structure.elements) {
      const key = `${element.layer}/${element.datatype}`;
      const entry = layerContexts.get(key) ?? { types: new Set(), strings: [] };
      entry.types.add(element.type);
      if (element.string && entry.strings.length < 8) entry.strings.push(element.string);
      layerContexts.set(key, entry);
    }
  }

  const group = new THREE.Group();
  group.name = parsed.libraryName || 'GDS Layout';

  const drawArea = Math.max(width * scale * height * scale, 1e-9);
  const layerBuckets = [...byLayer.values()].sort((a, b) => a.layer - b.layer || a.datatype - b.datatype);
  let layerIndex = 0;
  for (const bucket of layerBuckets) {
    if (!bucket.geometries.length) continue;
    const geometry = bucket.geometries.length === 1 ? bucket.geometries[0] : mergeGeometries(bucket.geometries, false);
    bucket.geometries.forEach((source) => {
      if (source !== geometry) source.dispose();
    });
    if (!geometry) continue;
    geometry.computeVertexNormals();
    const color = layerColor(bucket.layer);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.42,
        metalness: 0.35,
        emissive: color.clone().multiplyScalar(0.12)
      })
    );
    mesh.name = `Layer ${bucket.layer}/${bucket.datatype}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const context = layerContexts.get(`${bucket.layer}/${bucket.datatype}`) ?? { types: new Set(), strings: [] };
    const layerInfo = nameLayoutLayer(bucket.layer, bucket.datatype, {
      pdk,
      parentNames,
      texts: [...context.types],
      strings: context.strings,
      structureNames: [...structureNames]
    });
    mesh.userData.chipViewLayer = bucket.layer;
    mesh.userData.chipViewDatatype = bucket.datatype;
    mesh.userData.chipViewLayerName = layerInfo.name;
    mesh.userData.chipViewLayerRole = layerInfo.role;
    mesh.userData.chipViewLayerKnown = layerInfo.known;
    mesh.userData.chipViewElements = bucket.elements;
    mesh.userData.chipViewStackIndex = layerIndex;
    mesh.userData.chipViewBaseThickness = thickness;
    // A layer that covers nearly the whole drawing is fill artwork and hides
    // everything underneath it, so Chip View labels it for quick hiding.
    mesh.userData.chipViewCoverage = bucket.area / drawArea;
    mesh.userData.chipViewFullArea = mesh.userData.chipViewCoverage > 0.75;
    group.add(mesh);
    layerIndex += 1;
  }

  // Keep the whole stack shorter than the drawing so it stays readable; the
  // panel lets the user spread the layers out further.
  const stackGap = options.gap ?? Math.min(DEFAULT_STACK_GAP, (targetSpan * 0.4) / Math.max(layerIndex - 1, 1));
  stackLayers(group, { stacked: options.stacked ?? true, gap: stackGap });

  // Transistor markers: one small slab per extracted gate, coloured by channel,
  // lifted just above the device layers so they read as "here is a transistor".
  const devices = options.extractDevices === false ? null : extractTransistors(flat, parsed.layers, {
    resolution: options.deviceResolution ?? 20
  });
  let gateGroup = null;
  if (devices?.gates.length) {
    gateGroup = new THREE.Group();
    gateGroup.name = 'Transistors';
    const gateWidth = Math.max(width * scale, 1) * 0.012;
    const materials = {
      n: new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.85 }),
      p: new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.85 })
    };
    for (const gate of devices.gates) {
      const worldX = (gate.x - transform.cx) * scale;
      const worldZ = -(gate.y - transform.cy) * scale;
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.max(gate.width * scale, gateWidth),
          thickness * 0.25,
          Math.max(gate.height * scale, gateWidth)
        ),
        materials[gate.channel]
      );
      marker.name = `Gate ${gate.structure ?? ''} ${gate.channel}-ch`.trim();
      marker.position.set(worldX, layerIndex * stackGap + thickness * 0.6, worldZ);
      marker.userData.chipViewGate = true;
      marker.userData.chipViewChannel = gate.channel;
      marker.userData.chipViewStructure = gate.structure ?? null;
      gateGroup.add(marker);
    }
    group.add(gateGroup);
  }

  // Cell instance labels and per-layer name labels, both toggleable. Text labels
  // need a 2D canvas, so they are skipped in headless runs (unit tests).
  const labelGroup = new THREE.Group();
  const canLabel = typeof document !== 'undefined';
  labelGroup.name = 'Chip View labels';
  for (const mesh of group.children) {
    if (!canLabel || mesh.userData.chipViewLayer === undefined) continue;
    const label = createLabel(`${mesh.userData.chipViewLayerName}`, {
      color: `#${mesh.material.color.getHexString()}`,
      width: 1.35
    });
    label.position.set(
      -(box.maxX + box.minX) / 2 * scale,
      mesh.position.y + thickness + 0.2,
      -(box.minY) * scale - 0.4
    );
    label.userData.chipViewLabel = 'layer';
    label.visible = options.layerLabels ?? false;
    labelGroup.add(label);
    mesh.userData.chipViewLabel = label;
  }

  // One label per cell type, not per placed instance: a design with 138 cells
  // would otherwise cover itself in text. The count travels with the label.
  const cellLabelLimit = !canLabel || options.cellLabels === false ? 0 : (options.maxCellLabels ?? 120);
  const labelHeight = layerIndex * stackGap + thickness + 0.6;
  const byType = new Map();
  flat.instances.forEach((instance) => {
    const count = (byType.get(instance.name) ?? 0) + 1;
    byType.set(instance.name, count);
  });
  let labelled = 0;
  for (const [name, count] of byType) {
    if (labelled >= cellLabelLimit) break;
    const instance = flat.instances.find((entry) => entry.name === name);
    if (!instance) continue;
    const short = name.replace(/^sky130_(fd|ef)_sc_hd__/, '');
    const label = createLabel(count > 1 ? `${short} x${count}` : short, { width: 1.1, color: '#cfe6ff' });
    label.position.set((instance.x - transform.cx) * scale, labelHeight, -(instance.y - transform.cy) * scale);
    label.userData.chipViewLabel = 'cell';
    label.userData.chipViewStructure = name;
    label.visible = false;
    labelGroup.add(label);
    labelled += 1;
  }
  if (labelGroup.children.length) group.add(labelGroup);

  const micronPerDbUnit = parsed.units.micronPerDbUnit;
  const databaseUnitNm = parsed.units.micronPerDbUnit * 1000;
  const warnings = [...parsed.warnings];
  // OpenLane-era layouts sometimes carry a UNITS record whose database unit is
  // far too small for silicon artwork. The 3D view is normalized, so it is not
  // affected, but the physical readout has to say so rather than print 0.0 um.
  if (databaseUnitNm < 0.1 || databaseUnitNm > 10) {
    warnings.push(
      `The UNITS record declares ${databaseUnitNm.toPrecision(3)} nm per database unit, which is unusual for chip artwork. ` +
      'Sizes below are given in database units; the 3D view is normalized to the drawing, so it is unaffected.'
    );
  }
  const summary = {
    format: 'GDSII',
    library: parsed.libraryName,
    pdk,
    layers: group.children.filter((child) => child.userData.chipViewLayer !== undefined).length,
    layerNames: group.children
      .filter((child) => child.userData.chipViewLayer !== undefined)
      .map((child) => `${child.userData.chipViewLayerName} (${child.userData.chipViewLayer}/${child.userData.chipViewDatatype})`),
    recordTable: parsed.recordTable,
    structures: parsed.stats.structures,
    skippedMarkerLayers: [...markerSkipped.values()],
    declaredLayers: parsed.layers.length,
    polygons: rendered.length,
    drawablePolygons: drawable.length,
    truncated,
    widthDbUnits: Math.round(width),
    heightDbUnits: Math.round(height),
    widthMicrons: width * micronPerDbUnit,
    heightMicrons: height * micronPerDbUnit,
    databaseUnitNm,
    unitsPlausible: databaseUnitNm >= 0.1 && databaseUnitNm <= 10,
    skippedReferences: parsed.stats.structureReferences + parsed.stats.arrayReferences,
    skippedLabels: parsed.stats.labels + parsed.stats.nodes,
    thickness,
    stackGap,
    stacked: options.stacked ?? true,
    topStructure: flat.topName,
    cellInstances: flat.instances.length,
    instanceTruncatedAt: flat.truncatedAt,
    transistors: devices ? {
      supported: devices.summary.supported,
      reason: devices.summary.reason ?? null,
      namedLayers: devices.summary.namedLayers,
      deviceFamilyKnown: devices.summary.deviceFamilyKnown,
      total: devices.summary.total,
      nChannel: devices.summary.nChannel,
      pChannel: devices.summary.pChannel,
      byStructure: devices.summary.byStructure
    } : null,
    warnings
  };

  return { group, summary };
}