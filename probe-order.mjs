import { readFileSync } from 'node:fs';
import { parseDef } from './src/utils/DefReader.js';
import { parseGdsii, flattenStructure } from './src/utils/GdsParser.js';

const base = `${process.env.USERPROFILE}\\Desktop\\circuit\\new`;
const def = parseDef(readFileSync(`${base}\\designs\\counter8\\runs\\default_run\\final\\def\\counter8.def`, 'utf8'));
const buffer = readFileSync(`${base}\\layouts\\counter8_sky130A.gds`);
const parsed = parseGdsii(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
const flat = flattenStructure(parsed);

let same = 0, diff = [];
for (let i = 0; i < Math.max(def.components.length, flat.instances.length); i += 1) {
  if (def.components[i]?.cell === flat.instances[i]?.name) same += 1;
  else diff.push(`${i}: def=${def.components[i]?.cell} gds=${flat.instances[i]?.name}`);
}
console.log(`component list vs placement list, same index, same cell type: ${same}/${def.components.length}`);
if (diff.length) console.log(diff.slice(0, 5).join('\n'));

// Offset per orientation, using this alignment.
const byOrient = new Map();
for (let i = 0; i < def.components.length; i += 1) {
  const c = def.components[i], g = flat.instances[i];
  if (c.cell !== g.name) continue;
  const key = c.orientation;
  if (!byOrient.has(key)) byOrient.set(key, new Map());
  const t = byOrient.get(key);
  const k = `(${g.x - c.x},${g.y - c.y})`;
  t.set(k, (t.get(k) ?? 0) + 1);
}
for (const [o, t] of [...byOrient.entries()].sort()) {
  const top = [...t.entries()].sort((a,b) => b[1]-a[1]).slice(0, 4);
  console.log(`\n${o}: ${top.map(([k,v]) => `${k} x${v}`).join('  ')}`);
}
