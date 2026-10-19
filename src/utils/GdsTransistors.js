import { describeLayer } from '../data/PdkLayerMaps.js';

// Transistor extraction for Chip View.
//
// A MOSFET in a mask layout is where a polysilicon shape crosses an active
// (diffusion) shape, so gates are found by intersecting those two layers and
// counting the connected regions. Diffusion is split by the n-well / p-well
// masks, which is what tells an n-channel device from a p-channel one.
//
// This works on any layout whose device layers are present. Layouts that stream
// out only pins and routing report zero devices, which is a real answer rather
// than a guess.

const DEFAULT_RESOLUTION = 40; // database units per raster pixel (0.04 um at 1 nm dbu)

function layerKey(layer, datatype) {
  return `${layer}/${datatype}`;
}

/** Work out which layer/datatype pairs carry devices, from the PDK layer map. */
export function detectDeviceLayers(parsed) {
  const found = { diff: [], poly: [], nWell: [], tap: [], named: 0 };
  for (const entry of parsed.layers) {
    const info = describeLayer(entry.layer, entry.datatype);
    if (!info.known) continue;
    found.named += 1;
    const base = info.name.split('.')[0];
    const id = layerKey(entry.layer, entry.datatype);
    if (base === 'diff') found.diff.push({ id, ...entry });
    else if (base === 'poly') found.poly.push({ id, ...entry });
    else if (base === 'nsdm' || base === 'cnsdm') found.nWell.push({ id, ...entry });
    else if (base === 'tap') found.tap.push({ id, ...entry });
  }
  return found;
}

function boundsOf(elements, ids) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const element of elements) {
    if (!ids.includes(`${element.layer}/${element.datatype}`)) continue;
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

// Even-odd scanline fill of one polygon set into a byte grid.
function rasterize(elements, ids, bounds, resolution) {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / resolution));
  const rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / resolution));
  const grid = new Uint8Array(cols * rows);
  for (const element of elements) {
    if (!ids.includes(`${element.layer}/${element.datatype}`)) continue;
    if (element.points.length < 3) continue;
    const points = element.points;
    const minRow = Math.max(0, Math.floor((Math.min(...points.map((point) => point[1])) - bounds.minY) / resolution));
    const maxRow = Math.min(rows - 1, Math.ceil((Math.max(...points.map((point) => point[1])) - bounds.minY) / resolution));
    for (let row = minRow; row <= maxRow; row += 1) {
      const scanY = bounds.minY + (row + 0.5) * resolution;
      const crossings = [];
      for (let index = 0; index < points.length; index += 1) {
        const [x1, y1] = points[index];
        const [x2, y2] = points[(index + 1) % points.length];
        if ((y1 <= scanY && y2 > scanY) || (y2 <= scanY && y1 > scanY)) {
          crossings.push(x1 + ((scanY - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let index = 0; index + 1 < crossings.length; index += 2) {
        const startColumn = Math.max(0, Math.floor((crossings[index] - bounds.minX) / resolution));
        const endColumn = Math.min(cols - 1, Math.ceil((crossings[index + 1] - bounds.minX) / resolution));
        for (let column = startColumn; column <= endColumn; column += 1) grid[row * cols + column] = 1;
      }
    }
  }
  return { grid, cols, rows };
}

// Four-connected component labelling over a boolean grid.
function components(grid, cols, rows, minimumArea) {
  const labels = new Int32Array(cols * rows).fill(-1);
  const found = [];
  const stack = [];
  for (let index = 0; index < grid.length; index += 1) {
    if (!grid[index] || labels[index] !== -1) continue;
    const label = found.length;
    let minColumn = cols;
    let maxColumn = 0;
    let minRow = rows;
    let maxRow = 0;
    let area = 0;
    stack.length = 0;
    stack.push(index);
    labels[index] = label;
    while (stack.length) {
      const current = stack.pop();
      const column = current % cols;
      const row = (current - column) / cols;
      area += 1;
      if (column < minColumn) minColumn = column;
      if (column > maxColumn) maxColumn = column;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      const neighbours = [current - 1, current + 1, current - cols, current + cols];
      const valid = [column > 0, column < cols - 1, row > 0, row < rows - 1];
      for (let offset = 0; offset < 4; offset += 1) {
        if (!valid[offset]) continue;
        const neighbour = neighbours[offset];
        if (grid[neighbour] && labels[neighbour] === -1) {
          labels[neighbour] = label;
          stack.push(neighbour);
        }
      }
    }
    if (area >= minimumArea) found.push({ label, area, minColumn, maxColumn, minRow, maxRow });
  }
  return { labels, regions: found };
}

/**
 * Find every transistor in a flattened layout.
 *
 * Each cell instance is rasterised on its own, so a device is always attributed
 * to the cell it belongs to instead of to whichever cell happens to overlap it.
 * That per-cell count is what makes the result checkable against the standard
 * cell library (a NOR2 reports a handful of devices, not dozens).
 *
 * @param {object} flat result of flattenStructure()
 * @param {object[]} layers every layer/datatype present (for device detection)
 * @param {object} options resolution and minimum gate size in database units
 */
export function extractTransistors(flat, layers, options = {}) {
  const elements = flat.elements ?? flat;
  const instances = flat.instances ?? [];
  const deviceLayers = detectDeviceLayers({ layers });
  const diffIds = deviceLayers.diff.map((entry) => entry.id);
  const polyIds = deviceLayers.poly.map((entry) => entry.id);
  const nWellIds = deviceLayers.nWell.map((entry) => entry.id);
  const tapIds = deviceLayers.tap.map((entry) => entry.id);
  const deviceIds = [...diffIds, ...polyIds, ...nWellIds];

  const summary = {
    supported: diffIds.length > 0 && polyIds.length > 0,
    diffLayers: diffIds,
    polyLayers: polyIds,
    nWellLayers: nWellIds,
    namedLayers: deviceLayers.named,
    // True when the PDK's device layer family (diff/poly/well/tap) is present at
    // all, which is what makes a missing-device result worth reporting.
    deviceFamilyKnown: diffIds.length + polyIds.length + nWellIds.length + tapIds.length > 0,
    total: 0,
    nChannel: 0,
    pChannel: 0,
    skippedTapShapes: 0,
    instances: instances.length,
    byStructure: []
  };

  if (!summary.supported) {
    summary.reason = diffIds.length === 0 && polyIds.length === 0
      ? 'No diffusion or polysilicon layers were found, so this layout streams out pins and routing only. Transistor geometry is not in this file.'
      : `Only one of diffusion (${diffIds.join(', ') || 'none'}) and polysilicon (${polyIds.join(', ') || 'none'}) is present.`;
    return { summary, gates: [] };
  }

  summary.skippedTapShapes = elements.filter((element) => tapIds.includes(`${element.layer}/${element.datatype}`)).length;
  const resolution = options.resolution ?? DEFAULT_RESOLUTION;
  const minimumArea = options.minimumGatePixels ?? 2;

  const deviceElements = elements.filter((element) => deviceIds.includes(`${element.layer}/${element.datatype}`));
  const byInstance = new Map();
  for (const element of deviceElements) {
    const key = element.instanceId ?? 'top';
    const list = byInstance.get(key) ?? [];
    list.push(element);
    byInstance.set(key, list);
  }

  const gates = [];
  const perInstance = [];
  const groups = instances.length
    ? instances.map((instance) => [instance.id, instance]).filter(([id]) => byInstance.has(id))
    : [['top', null]];
  // Geometry that is not inside any placed cell (top-level routing).
  if (byInstance.has('top')) groups.push(['top', null]);

  for (const [id, instance] of groups) {
    const groupElements = byInstance.get(id);
    if (!groupElements?.length) continue;
    const bounds = boundsOf(groupElements, deviceIds);
    if (!Number.isFinite(bounds.minX)) continue;

    const diff = rasterize(groupElements, diffIds, bounds, resolution);
    const poly = rasterize(groupElements, polyIds, bounds, resolution);
    const nWell = rasterize(groupElements, nWellIds, bounds, resolution);
    if (options.debug) {
      const sum = (grid) => grid.reduce((total, value) => total + value, 0);
      console.log('debug', JSON.stringify({
        id,
        structure: instance?.name,
        elements: groupElements.map((element) => `${element.layer}/${element.datatype}`),
        bounds,
        cols: diff.cols,
        rows: diff.rows,
        diff: sum(diff.grid),
        poly: sum(poly.grid),
        nWell: sum(nWell.grid)
      }));
    }
    const overlap = new Uint8Array(diff.grid.length);
    for (let index = 0; index < overlap.length; index += 1) {
      overlap[index] = diff.grid[index] && poly.grid[index] ? 1 : 0;
    }
    const { labels, regions } = components(overlap, diff.cols, diff.rows, minimumArea);

    const found = regions.map((region) => {
      let nChannelPixels = 0;
      let total = 0;
      for (let row = region.minRow; row <= region.maxRow; row += 1) {
        for (let column = region.minColumn; column <= region.maxColumn; column += 1) {
          const cellIndex = row * diff.cols + column;
          if (labels[cellIndex] !== region.label) continue;
          total += 1;
          if (nWell.grid[cellIndex]) nChannelPixels += 1;
        }
      }
      const minX = bounds.minX + region.minColumn * resolution;
      const maxX = bounds.minX + (region.maxColumn + 1) * resolution;
      const minY = bounds.minY + region.minRow * resolution;
      const maxY = bounds.minY + (region.maxRow + 1) * resolution;
      return {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        width: maxX - minX,
        height: maxY - minY,
        areaPixels: region.area,
        // Inside n-well the channel is p-type; outside it the channel is n-type.
        channel: total > 0 && nChannelPixels / total > 0.5 ? 'n' : 'p'
      };
    });

    found.forEach((gate) => {
      gate.structure = instance?.name ?? 'top-level routing';
      gate.instanceId = instance?.id ?? null;
      gates.push(gate);
    });
    if (instance) {
      perInstance.push({
        instanceId: instance.id,
        structure: instance.name,
        gates: found.length,
        nChannel: found.filter((gate) => gate.channel === 'n').length,
        pChannel: found.filter((gate) => gate.channel === 'p').length
      });
    }
  }

  summary.total = gates.length;
  summary.nChannel = gates.filter((gate) => gate.channel === 'n').length;
  summary.pChannel = gates.filter((gate) => gate.channel === 'p').length;

  // Per-cell-type roll-up: total devices and how many each placed copy has.
  const byStructure = new Map();
  for (const entry of perInstance) {
    const row = byStructure.get(entry.structure) ?? {
      structure: entry.structure,
      instances: 0,
      gatesPerInstance: entry.gates,
      total: 0,
      nChannel: 0,
      pChannel: 0
    };
    row.instances += 1;
    row.gatesPerInstance = Math.max(row.gatesPerInstance, entry.gates);
    row.total += entry.gates;
    row.nChannel += entry.nChannel;
    row.pChannel += entry.pChannel;
    byStructure.set(entry.structure, row);
  }
  summary.byStructure = [...byStructure.values()].sort((a, b) => b.total - a.total);
  summary.perInstance = perInstance;

  return { summary, gates };
}

/**
 * Attach each gate to the cell it sits in. Cells are nested and adjacent, so
 * the smallest box containing the gate wins: that is the innermost cell rather
 * than a large neighbour that happens to overlap it.
 */
export function attributeGatesToStructures(gates, instanceBoxes) {
  const boxes = instanceBoxes
    .filter((box) => box && Number.isFinite(box.minX))
    .map((box) => ({ ...box, area: (box.maxX - box.minX) * (box.maxY - box.minY) }))
    .sort((a, b) => a.area - b.area);
  for (const gate of gates) {
    const owner = boxes.find((box) => (
      gate.x >= box.minX && gate.x <= box.maxX && gate.y >= box.minY && gate.y <= box.maxY
    ));
    if (owner) gate.structure = owner.name;
  }
  return gates;
}