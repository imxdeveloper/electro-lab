// Measure how a DEF component position relates to a GDS placement translation,
// per orientation, so the offset rule can be derived from data rather than
// assumed.
import { readFileSync } from 'node:fs';
import { parseDef } from './src/utils/DefReader.js';
import { parseGdsii, flattenStructure } from './src/utils/GdsParser.js';

const base = `${process.env.USERPROFILE}\\Desktop\\circuit\\new`;
const def = parseDef(readFileSync(`${base}\\designs\\counter8\\runs\\default_run\\final\\def\\counter8.def`, 'utf8'));
const buffer = readFileSync(`${base}\\layouts\\counter8_sky130A.gds`);
const parsed = parseGdsii(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
const flat = flattenStructure(parsed);

// Cell size per cell type, taken from the GDS structure definition (not the
// placement, which is transformed).
const size = new Map();
for (const structure of parsed.structures) {
  const bounds = structure.bounds ?? null;
  if (!bounds) continue;
  size.set(structure.name, { w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY });
}

const byCell = new Map();
for (const instance of flat.instances) {
  if (!byCell.has(instance.name)) byCell.set(instance.name, []);
  byCell.get(instance.name).push(instance);
}

const stats = new Map();
for (const component of def.components) {
  for (const instance of byCell.get(component.cell) ?? []) {
    const dx = instance.x - component.x;
    const dy = instance.y - component.y;
    const cellSize = size.get(component.cell) ?? { w: 0, h: 0 };
    // Express the offset in units of the cell size so different cells compare.
    const key = `${component.orientation} dx=${dx} dy=${dy} (cell ${cellSize.w}x${cellSize.h})`;
    if (!stats.has(key)) stats.set(key, []);
    stats.get(key).push(component.name);
  }
}

console.log('orientation  offset (GDS translation - DEF origin)  count');
const byOrientation = new Map();
for (const [key, names] of stats) {
  const orientation = key.split(' ')[0];
  const offset = key.slice(orientation.length);
  if (!byOrientation.has(orientation)) byOrientation.set(orientation, new Map());
  const table = byOrientation.get(orientation);
  table.set(offset, (table.get(offset) ?? 0) + names.length);
}
for (const [orientation, table] of [...byOrientation.entries()].sort()) {
  console.log(`\n${orientation}:`);
  for (const [offset, count] of [...table.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`  ${offset.padEnd(58)} ${count}`);
  }
}