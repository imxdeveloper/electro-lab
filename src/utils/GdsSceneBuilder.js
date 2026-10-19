import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { parseGdsii } from './GdsParser.js';

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
  for (const structure of parsed.structures) {
    for (const element of structure.elements) {
      if (element.type !== 'BOUNDARY' && element.type !== 'BOX' && element.type !== 'PATH') continue;
      if (element.points.length < (element.type === 'PATH' ? 2 : 3)) continue;
      drawable.push(element);
    }
  }

  const rendered = drawable.slice(0, maxElements);
  const truncated = drawable.length - rendered.length;

  const box = parsed.boundingBox ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
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
    mesh.userData.chipViewLayer = bucket.layer;
    mesh.userData.chipViewDatatype = bucket.datatype;
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
    recordTable: parsed.recordTable,
    structures: parsed.stats.structures,
    layers: group.children.length,
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
    warnings
  };

  return { group, summary };
}