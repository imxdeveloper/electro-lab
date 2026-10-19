import { readFileSync } from 'node:fs';
import { parseGdsii } from './src/utils/GdsParser.js';

const buffer = readFileSync(`${process.env.USERPROFILE}\\Desktop\\circuit\\new\\layouts\\counter8_sky130A.gds`);
const parsed = parseGdsii(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

for (const name of ['sky130_fd_sc_hd__nor2_1', 'sky130_fd_sc_hd__dfrtp_1', 'sky130_fd_sc_hd__inv_1', 'sky130_fd_sc_hd__buf_1']) {
  const structure = parsed.structures.find((entry) => entry.name === name);
  if (!structure) {
    console.log(`${name}: not present`);
    continue;
  }
  const counts = new Map();
  structure.elements.forEach((element) => {
    const key = `${element.layer}/${element.datatype}:${element.type}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  console.log(`${name} (${structure.elements.length} elements)`);
  [...counts.entries()].sort().forEach(([key, count]) => console.log(`   ${key} -> ${count}`));
}

// Transistor hunting: find small poly rectangles that overlap diffusion rectangles.
const diffusionLayers = new Set(['67/20', '65/20', '66/20']);
const perStructure = new Map();
parsed.structures.forEach((structure) => {
  const rects = structure.elements
    .filter((element) => element.type === 'BOUNDARY' && element.points.length === 5)
    .map((element) => {
      const xs = element.points.map((point) => point[0]);
      const ys = element.points.map((point) => point[1]);
      return {
        layer: `${element.layer}/${element.datatype}`,
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys)
      };
    });
  perStructure.set(structure.name, rects);
});

function overlaps(a, b) {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

console.log('\ntransistor candidates (small rectangle overlapping a larger one):');
parsed.structures.forEach((structure) => {
  const rects = perStructure.get(structure.name) ?? [];
  const small = rects.filter((rect) => rect.maxX - rect.minX < 600 && rect.maxY - rect.minY < 600);
  const large = rects.filter((rect) => (rect.maxX - rect.minX) >= 600 || (rect.maxY - rect.minY) >= 600);
  const pairs = [];
  small.forEach((s) => large.forEach((l) => { if (overlaps(s, l)) pairs.push([s.layer, l.layer]); }));
  const byPair = new Map();
  pairs.forEach(([a, b]) => {
    const key = [a, b].sort().join(' x ');
    byPair.set(key, (byPair.get(key) ?? 0) + 1);
  });
  if (byPair.size) {
    console.log(`  ${structure.name}: ` + [...byPair.entries()].map(([k, v]) => `${k}=${v}`).join(', '));
  }
});