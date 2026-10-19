// One-off generator: turn PDK layer-properties files into a lookup table of
// GDS layer/datatype -> PDK layer name. Run with:
//   node scripts/generate-layer-map.mjs <sky130A.lyp> [gf180mcu.lyp]
//
// Both PDKs are handled: sky130 writes "<name>layer.purpose - L/D</name>" and
// GF180 writes "<source>LayerName L/D@1</source>".
import { readFileSync, writeFileSync } from 'node:fs';

const [skyPath, gfPath] = process.argv.slice(2);
if (!skyPath) {
  console.error('usage: node scripts/generate-layer-map.mjs <sky130A.lyp> [gf180mcu.lyp]');
  process.exit(1);
}

const KEEP_PURPOSES = new Set(['drawing', 'pin', 'net', 'via', 'cut', 'res', 'boundary']);

function parseSky(text) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/<name>([^<]+?) - (\d+)\/(\d+)<\/name>/);
    if (!match) continue;
    const [, fullName, layer, datatype] = match;
    // Names look like "met1.drawing"; the suffix is a purpose only when it is
    // one, so "areaid.standardc" stays a single name instead of being split.
    const parts = fullName.split('.');
    const hasPurpose = parts.length > 1 && KEEP_PURPOSES.has(parts[parts.length - 1]);
    const name = hasPurpose ? parts.join('.') : fullName;
    if (!hasPurpose && parts.length > 1 && parts[parts.length - 1].match(/^(label|blk|paste|dummy|res|net)$/)) continue;
    const id = `${Number(layer)}/${Number(datatype)}`;
    if (!entries.has(id)) entries.set(id, name);
  }
  return entries;
}

function parseGf(text) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/<source>\s*([^\s<]+)\s+(\d+)\/(\d+)@\d+\s*<\/source>/);
    if (!match) continue;
    const [, layerName, layer, datatype] = match;
    const id = `${Number(layer)}/${Number(datatype)}`;
    // Decal/DRC marker layers (the _mk layers) are not stream-out layers.
    if (!entries.has(id) && !layerName.endsWith('_mk')) entries.set(id, layerName);
  }
  return entries;
}

const sky = parseSky(readFileSync(skyPath, 'utf8'));
const gf = gfPath ? parseGf(readFileSync(gfPath, 'utf8')) : new Map();

const format = (entries) => [...entries.entries()]
  .sort((a, b) => {
    const [al, ad] = a[0].split('/').map(Number);
    const [bl, bd] = b[0].split('/').map(Number);
    return al - bl || ad - bd;
  })
  .map(([id, name]) => `  '${id}': '${name}'`)
  .join(',\n');

writeFileSync('src/data/PdkLayerMaps.js', `// GENERATED FILE - do not edit by hand.
// Sources: sky130A.lyp (SkyWater sky130, Apache-2.0) and gf180mcu.lyp
// (GlobalFoundries GF180MCU, Apache-2.0).
// Regenerate with:
//   node scripts/generate-layer-map.mjs <sky130A.lyp> <gf180mcu.lyp>
//
// Maps GDS layer/datatype numbers to PDK layer names so a layout reads as
// "poly.drawing" instead of "Layer 66/20". Layouts whose layer numbers are
// not covered keep the numbered fallback rather than a guessed name.

export const SKY130_LAYER_NAMES = {
${format(sky)}
};

export const GF180_LAYER_NAMES = {
${format(gf)}
};

export const PDK_LAYER_MAPS = {
  sky130: SKY130_LAYER_NAMES,
  gf180: GF180_LAYER_NAMES
};

/** Roles used for colouring, ordering, and grouping in Chip View. */
export const LAYER_ROLES = {
  DEVICE: 'device',
  WELL: 'well',
  ROUTING: 'routing',
  CUT: 'cut',
  PIN: 'pin',
  LABEL: 'label',
  FILL: 'fill',
  OTHER: 'other'
};

const ROLE_BY_NAME = [
  [/^(diff|poly|tap|activ|pplus|nplus|contact|dualgate)(\\.|$)/i, LAYER_ROLES.DEVICE],
  [/^(nsdm|cnsdm|psdm|pplus|psd|nsd|nplus|nsd|nwell|pwell|dnwell|lvpwell|well)(\\.|$)/i, LAYER_ROLES.WELL],
  [/(^|[._])cut$/i, LAYER_ROLES.CUT],
  [/(^|[._])pin$/i, LAYER_ROLES.PIN],
  [/(^|[._])label$/i, LAYER_ROLES.LABEL],
  [/fill|boundary|areaid|^boundary$/i, LAYER_ROLES.FILL],
  [/^(li\\d*|mcon|met\\d*|metal\\d*|via\\d*|viata|contact)(\\.|$)/i, LAYER_ROLES.ROUTING]
];

export function layerRole(name) {
  if (!name) return LAYER_ROLES.OTHER;
  for (const [pattern, role] of ROLE_BY_NAME) {
    if (pattern.test(name)) return role;
  }
  return LAYER_ROLES.OTHER;
}

/**
 * Guess which PDK wrote a layout by seeing which map explains the most layers.
 * The bar is deliberately high: different PDKs reuse small numbers, so a map
 * that only explains a handful of layers is a coincidence, not an
 * identification. Anything below the threshold stays unknown and keeps the
 * numbered fallback rather than being given another PDK's names.
 */
export function detectPdk(layers) {
  const keys = layers.map((layer) => \`\${layer.layer}/\${layer.datatype}\`);
  let best = { pdk: null, score: 0 };
  for (const [pdk, map] of Object.entries(PDK_LAYER_MAPS)) {
    const score = keys.filter((key) => map[key]).length;
    if (score > best.score) best = { pdk, score };
  }
  if (!best.pdk || best.score < 5) return null;
  return best.score / keys.length >= 0.5 ? best.pdk : null;
}

/**
 * Look up a GDS layer/datatype. \`pdk\` picks the map; when omitted, every map is
 * consulted so a layout still reads correctly without being told its PDK.
 */
export function describeLayer(layer, datatype, pdk = null) {
  const key = \`\${layer}/\${datatype}\`;
  const name = pdk
    ? PDK_LAYER_MAPS[pdk]?.[key]
    : SKY130_LAYER_NAMES[key] ?? GF180_LAYER_NAMES[key];
  if (name) return { name, role: layerRole(name), known: true, pdk: pdk ?? null };
  return { name: \`Layer \${layer}/\${datatype}\`, role: LAYER_ROLES.OTHER, known: false, pdk: pdk ?? null };
}
`);

console.log(`sky130: ${sky.size} entries`);
console.log(`gf180:  ${gf.size} entries`);
const show = (key) => (sky.has(key) ? `sky130 ${sky.get(key)}` : gf.has(key) ? `gf180 ${gf.get(key)}` : 'unnamed');
['66/20', '65/20', '93/44', '81/4', '236/0', '21/0', '33/0', '31/0', '32/0'].forEach((key) => {
  console.log(`  ${key}: ${show(key)}`);
});