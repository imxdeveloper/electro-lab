import { readFileSync } from 'node:fs';
import { parseDef } from './src/utils/DefReader.js';
import { parseGdsii, flattenStructure, structureBounds } from './src/utils/GdsParser.js';

const base = `${process.env.USERPROFILE}\\Desktop\\circuit\\new`;
const def = parseDef(readFileSync(`${base}\\designs\\counter8\\runs\\default_run\\final\\def\\counter8.def`, 'utf8'));
const buffer = readFileSync(`${base}\\layouts\\counter8_sky130A.gds`);
const parsed = parseGdsii(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
const flat = flattenStructure(parsed);

const size = new Map();
for (const s of parsed.structures) {
  const b = structureBounds(s);
  if (b) size.set(s.name, { w: b.maxX - b.minX, h: b.maxY - b.minY, minX: b.minX, minY: b.minY });
}
const byCell = new Map();
for (const i of flat.instances) {
  if (!byCell.has(i.name)) byCell.set(i.name, []);
  byCell.get(i.name).push(i);
}

// Rule under test: GDS translation = DEF origin + R(orientation) applied to the cell box corner.
const rule = {
  N: (w, h) => [0, 0],
  S: (w, h) => [0, h],
  E: (w, h) => [w, 0],
  W: (w, h) => [0, 0],
  FN: (w, h) => [w, h],
  FS: (w, h) => [w, 0],
  FE: (w, h) => [0, h],
  FW: (w, h) => [0, 0]
};

const groups = new Map();
for (const c of def.components) {
  const k = `${c.cell}|${c.orientation}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(c);
}

let ok = 0, bad = 0;
const failures = [];
for (const [k, comps] of groups) {
  const [cell, orient] = k.split('|');
  const s = size.get(cell);
  if (!s || !rule[orient]) { failures.push(`${k}: no size/rule`); bad += comps.length; continue; }
  const [rx, ry] = rule[orient](s.w, s.h);
  const used = new Set();
  let good = 0;
  for (const c of comps) {
    const hit = (byCell.get(cell) ?? []).find((i) => !used.has(i) && i.x === c.x + rx && i.y === c.y + ry);
    if (hit) { used.add(hit); good += 1; } else ok += 0;
  }
  if (good === comps.length) ok += comps.length;
  else { bad += comps.length - good; failures.push(`${k}: ${good}/${comps.length}  rule offset=(${rx},${ry}) cell=${s.w}x${s.h} min=(${s.minX},${s.minY})`); }
}
console.log(`components matched by the derived rule: ${ok}/${def.components.length}`);
console.log(`failures: ${failures.length}`);
failures.slice(0, 12).forEach((f) => console.log('  ' + f));
console.log('\ncell sizes sample:');
for (const [n, s] of [...size.entries()].slice(0, 8)) console.log(`  ${n.padEnd(34)} ${s.w}x${s.h} min=(${s.minX},${s.minY})`);
