// Cross-check the OpenLane artifacts against each other:
//   * does every DEF component correspond to a placement in the final GDS?
//   * do the eight counter bits land on eight distinct real flip-flops?
// Run with: node probe-match.mjs
import { readFileSync } from 'node:fs';
import { parseDef, traceToRegisterCell, matchComponentsToInstances } from './src/utils/DefReader.js';
import { parseGdsii, flattenStructure } from './src/utils/GdsParser.js';

const base = `${process.env.USERPROFILE}\\Desktop\\circuit\\new`;
const runDir = `${base}\\designs\\counter8\\runs\\default_run`;

const def = parseDef(readFileSync(`${runDir}\\final\\def\\counter8.def`, 'utf8'));
const buffer = readFileSync(`${base}\\layouts\\counter8_sky130A.gds`);
const parsed = parseGdsii(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
const flat = flattenStructure(parsed);

console.log(`GDS top=${flat.topName} placements=${flat.instances.length}`);
console.log(`DEF components=${def.components.length} pins=${def.pins.length} nets=${def.nets.length}\n`);

const matches = matchComponentsToInstances(def, flat.instances);
const byConfidence = { origin: 0, inside: 0 };
for (const match of matches.values()) byConfidence[match.confidence] += 1;
console.log(`DEF components matched to GDS placements: ${matches.size}/${def.components.length}`);
console.log(`  exact origin agreement: ${byConfidence.origin}`);
console.log(`  matched by drawn extent: ${byConfidence.inside}`);
const unmatched = def.components.filter((component) => !matches.has(component.name));
if (unmatched.length) {
  console.log(`  unmatched: ${unmatched.map((c) => `${c.name}:${c.cell}`).slice(0, 10).join(', ')}`);
}

console.log('\nbit  net        path                                    register  position        matched by');
let allMatched = true;
for (let bit = 0; bit < 8; bit += 1) {
  const trace = traceToRegisterCell(def, `count[${bit}]`);
  const register = trace?.register;
  if (!register) { console.log(`${bit}    <no register traced>`); allMatched = false; continue; }

  const match = matches.get(register.instance);
  if (!match) allMatched = false;
  const hops = trace.path
    .map((step) => step.cell.replace(/^sky130_fd_sc_hd__/, ''))
    .join(' -> ');
  console.log(
    `${String(bit).padEnd(5)} ${register.net.padEnd(11)} ${hops.slice(0, 38).padEnd(39)} ` +
    `${register.instance.padEnd(9)} (${String(register.x).padStart(5)},${String(register.y).padStart(5)}) ` +
    `${register.orientation.padEnd(3)} ${match ? match.confidence : 'NO MATCH'}`
  );
}

const registers = Array.from({ length: 8 }, (_, bit) => traceToRegisterCell(def, `count[${bit}]`)?.register?.instance);
const distinct = new Set(registers);
console.log(`\ndistinct register instances: ${distinct.size} (expected 8)`);
console.log(`all eight bits resolved to a placed flip-flop: ${allMatched && distinct.size === 8}`);
const cells = [...new Set(registers.map((name) => def.componentByName.get(name)?.cell))];
console.log(`register cell types: ${cells.join(', ')}`);

// Die extents: the GDS overhangs slightly because well taps extend past the die.
const box = parsed.boundingBox;
const area = def.dieArea;
console.log(`\ndie area from DEF:        x ${area.minX}..${area.maxX}  y ${area.minY}..${area.maxY}`);
console.log(`geometry extent from GDS: x ${Math.round(box.minX)}..${Math.round(box.maxX)}  y ${Math.round(box.minY)}..${Math.round(box.maxY)}`);
const overhang = Math.max(Math.round(box.minX - area.minX), Math.round(box.minY - area.minY));
console.log(`GDS overhangs the die by ${overhang} db units on the low side (well geometry outside the die)`);