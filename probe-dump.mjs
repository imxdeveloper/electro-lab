import { readFileSync } from 'node:fs';
import { parseDef, traceToRegisterCell } from './src/utils/DefReader.js';
import { parseGdsii, flattenStructure } from './src/utils/GdsParser.js';

const base = `${process.env.USERPROFILE}\\Desktop\\circuit\\new`;
const def = parseDef(readFileSync(`${base}\\designs\\counter8\\runs\\default_run\\final\\def\\counter8.def`, 'utf8'));
const buf = readFileSync(`${base}\\layouts\\counter8_sky130A.gds`);
const flat = flattenStructure(parseGdsii(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));

console.log('DEF components (cell, x, y, orient) for all dfrtp_1:');
for (const c of def.components.filter(c => c.cell.includes('dfrtp')))
  console.log(`  ${c.name} (${c.x},${c.y}) ${c.orientation}`);

console.log('\nGDS placements of dfrtp_1 (origin, transform):');
for (const i of flat.instances.filter(i => i.name.includes('dfrtp')))
  console.log(`  origin=(${i.x},${i.y}) strans=${i.strans ?? '?'} mag=${i.mag ?? 1} angle=${i.angle ?? 0} box=[${Math.round(i.box.minX)},${Math.round(i.box.minY)}..${Math.round(i.box.maxX)},${Math.round(i.box.maxY)}]`);
