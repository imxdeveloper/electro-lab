import { readFileSync } from 'node:fs';
import { parseDef, mapPortsToDrivers, traceToRegisterCell } from './src/utils/DefReader.js';

const runDir = `${process.env.USERPROFILE}\\Desktop\\circuit\\new\\designs\\counter8\\runs\\default_run`;
const def = parseDef(readFileSync(`${runDir}\\final\\def\\counter8.def`, 'utf8'));

console.log(`design ${def.name}  units=${def.units}nm  die=${def.dieArea.maxX - def.dieArea.minX} x ${def.dieArea.maxY - def.dieArea.minY}`);
console.log(`components=${def.components.length} pins=${def.pins.length} nets=${def.nets.length}\n`);

const bitIndex = (port) => Number((port.match(/count\[(\d+)\]/) ?? [])[1] ?? -1);

console.log('counter bit -> physical register (traced back through output buffers)');
console.log('bit  net            path                                        register            position');
const traces = [];
for (let bit = 0; bit < 8; bit += 1) {
  const trace = traceToRegisterCell(def, `count[${bit}]`);
  if (!trace?.register) {
    console.log(`${bit}     <no register found>`);
    continue;
  }
  traces.push(trace);
  const hops = trace.path.map((step) => `${step.cell.replace(/^sky130_(fd|ef)_sc_hd__/, '')}(${step.pin})`).join(' -> ');
  console.log(
    `${String(bit).padEnd(5)} ${trace.register.net.padEnd(14)} ` +
    `${hops.slice(0, 40).padEnd(42)} ` +
    `${trace.register.instance.padEnd(6)} @(${String(trace.register.x).padStart(6)},${String(trace.register.y).padStart(6)}) ${trace.register.orientation}`
  );
}

const distinct = new Set(traces.map((trace) => trace.register?.instance));
console.log(`\ndistinct register instances: ${distinct.size} (expected 8)`);
const cells = [...new Set(traces.map((trace) => trace.register?.cell))];
console.log(`register cell types: ${cells.join(', ')}`);

// Sanity: the traced positions must fall inside the die area.
const inside = traces.every((trace) => (
  trace.register.x >= def.dieArea.minX && trace.register.x <= def.dieArea.maxX &&
  trace.register.y >= def.dieArea.minY && trace.register.y <= def.dieArea.maxY
));
console.log(`all register positions inside the die area: ${inside}`);

// Also show the input ports, which drive the whole design.
const drivers = mapPortsToDrivers(def);
console.log('\ninput ports:');
drivers
  .filter((port) => port.direction === 'INPUT')
  .forEach((port) => {
    const net = def.netByName.get(port.net);
    const sinks = net ? net.connections.filter((c) => c.kind === 'instance').length : 0;
    console.log(`  ${port.port.padEnd(8)} net=${port.net.padEnd(10)} reaches ${sinks} instance pins`);
  });