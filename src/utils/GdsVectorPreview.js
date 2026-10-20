import { describeLayer, detectPdk } from '../data/PdkLayerMaps.js';
import { flattenStructure, parseGdsii } from './GdsParser.js';

const MAX_SHAPES = 20000;

function number(value) {
  return Number.isFinite(value) ? Number(value.toPrecision(12)).toString() : '0';
}

function pathFor(element) {
  const points = element.points || [];
  if (points.length < (element.type === 'PATH' ? 2 : 3)) return '';
  const [first, ...rest] = points;
  return `M${number(first[0])} ${number(first[1])}${rest.map(([x, y]) => `L${number(x)} ${number(y)}`).join('')}${element.type === 'PATH' ? '' : 'Z'}`;
}

function colorFor(layer) {
  const hue = (layer * 47 + 205) % 360;
  return `hsl(${hue} 72% 62%)`;
}

/** Prepare bounded, scalable GDS geometry for the Mask Lab vector viewer. */
export function buildGdsVectorPreview(input, options = {}) {
  const parsed = parseGdsii(input);
  const pdk = detectPdk(parsed.layers);
  const flat = flattenStructure(parsed, null, { maxInstances: options.maxInstances ?? 20000 });
  const drawable = flat.elements.filter((element) => ['BOUNDARY', 'BOX', 'PATH'].includes(element.type));
  const selected = drawable.slice(0, options.maxShapes ?? MAX_SHAPES);
  const layerMap = new Map();
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  for (const element of selected) {
    const key = `${element.layer}/${element.datatype}`;
    let layer = layerMap.get(key);
    if (!layer) {
      const info = describeLayer(element.layer, element.datatype, pdk);
      layer = {
        id: key,
        layer: element.layer,
        datatype: element.datatype,
        name: info.name,
        role: info.role,
        color: colorFor(element.layer),
        polygons: '',
        strokes: new Map(),
        shapes: 0
      };
      layerMap.set(key, layer);
    }
    const path = pathFor(element);
    if (!path) continue;
    if (element.type === 'PATH') {
      const width = Math.max(1, Math.abs(element.width || 1));
      layer.strokes.set(width, `${layer.strokes.get(width) || ''}${path}`);
    } else {
      layer.polygons += path;
    }
    layer.shapes += 1;
    for (const [x, y] of element.points) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }

  const layers = [...layerMap.values()].map((layer) => ({
    ...layer,
    strokes: [...layer.strokes].map(([width, d]) => ({ width, d }))
  }));
  const hasBounds = Number.isFinite(bounds.minX);
  const width = hasBounds ? bounds.maxX - bounds.minX : 0;
  const height = hasBounds ? bounds.maxY - bounds.minY : 0;
  const units = parsed.units || {};
  const dbuNm = Number.isFinite(units.dbUnitInMeters) ? units.dbUnitInMeters * 1e9 : null;

  return {
    pdk: pdk || 'unknown',
    layers,
    bounds: hasBounds ? bounds : null,
    width,
    height,
    dbuNm,
    renderedShapes: selected.length,
    drawableShapes: drawable.length,
    instanceCount: flat.instances.length,
    instanceLimitReached: flat.truncatedAt !== null,
    shapesTruncated: drawable.length > selected.length,
    warnings: [
      ...(flat.truncatedAt !== null ? [`Hierarchy expansion stopped at ${flat.truncatedAt.toLocaleString()} placed instances.`] : []),
      ...(drawable.length > selected.length ? [`Showing ${selected.length.toLocaleString()} of ${drawable.length.toLocaleString()} flattened shapes.`] : [])
    ]
  };
}
