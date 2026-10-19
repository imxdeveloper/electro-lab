import { readFileSync } from 'node:fs';
import { parseGdsii } from './src/utils/GdsParser.js';

const buffer = readFileSync(`${process.env.USERPROFILE}\\Desktop\\circuit\\new\\layouts\\counter8_sky130A.gds`);
const parsed = parseGdsii(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

console.log('library:', parsed.libraryName, '| structures:', parsed.structures.length);
console.log('\nstructures:');
parsed.structures.forEach((structure) => console.log(`  ${structure.name} (${structure.elements.length} elements)`));

console.log('\nlayers (layer/datatype -> elements):');
parsed.layers.forEach((layer) => {
  console.log(`  ${String(layer.layer).padStart(3)}/${String(layer.datatype).padStart(2)} -> ${layer.elements}`);
});

const srefs = [];
parsed.structures.forEach((structure) => structure.elements.forEach((element) => {
  if (element.type === 'SREF' || element.type === 'AREF') srefs.push(element);
}));
const names = new Map();
srefs.forEach((ref) => names.set(ref.sname, (names.get(ref.sname) ?? 0) + 1));
console.log(`\nstructure references: ${srefs.length}, distinct names: ${names.size}`);
[...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([name, count]) => {
  console.log(`  ${String(count).padStart(5)} x ${name}`);
});

// Bounding boxes of the biggest polygons on the top structure, to guess poly vs diffusion.
const top = parsed.structures.find((structure) => structure.name === 'counter8');
if (top) {
  const byLayer = new Map();
  top.elements.forEach((element) => {
    if (element.type !== 'BOUNDARY' || element.points.length < 5) return;
    const xs = element.points.map((point) => point[0]);
    const ys = element.points.map((point) => point[1]);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const key = element.layer;
    const list = byLayer.get(key) ?? [];
    list.push({ width, height });
    byLayer.set(key, list);
  });
  console.log('\ntop-cell polygon size ranges (db units), 4-point rectangles:');
  byLayer.forEach((list, layer) => {
    const widths = list.map((entry) => entry.width).sort((a, b) => a - b);
    const heights = list.map((entry) => entry.height).sort((a, b) => a - b);
    const pick = (array) => [array[0], array[Math.floor(array.length / 2)], array[array.length - 1]].map((value) => Math.round(value)).join('/');
    console.log(`  layer ${String(layer).padStart(3)}: n=${String(list.length).padStart(4)} width ${pick(widths)} height ${pick(heights)}`);
  });
}