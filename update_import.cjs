const fs = require('fs');
let c = fs.readFileSync('src/ui/MaskLabPanel.js', 'utf8');

const old = "    this.gdsSummaryEl.textContent = `\\${fileName} · \\${preview.pdk} · \\${preview.layers.length} layer(s) · \\${preview.renderedShapes.toLocaleString()} shapes · \\${units}`;\n    this.gdsLayersEl.replaceChildren();";

const newT = `    this.gdsSummaryEl.textContent = \\`\\${fileName} · \\${preview.pdk} · \\${preview.layers.length} layer(s) · \\${preview.renderedShapes.toLocaleString()} shapes · \\${units}\\`;
    const metaEl = this.gdsViewerEl.querySelector('[data-mask-gds-chip-meta]');
    if (metaEl) {
      const clean = fileName.replace(/\\.[^/.]+\$/, '').replace(/[_-]+/g, ' ').replace(/\\b([a-z])/g, (_, c) => c.toUpperCase()).trim();
      metaEl.innerHTML = \\`
        <span class="meta-chip">Chip: \\${escapeHTML(clean)}</span>
        <span class="meta-arch">Arch: \\${preview.pdk.toUpperCase()}</span>
        <span class="meta-pdk">PDK: \\${preview.layers.length} layers</span>
      \\`;
    }
    this.gdsLayersEl.replaceChildren();`;

if (c.includes(old)) {
  c = c.replace(old, newT);
  fs.writeFileSync('src/ui/MaskLabPanel.js', c);
  console.log('SUCCESS: Updated importGdsLayers');
} else {
  console.log('FAIL: Could not find importGdsLayers summary');
  const idx = c.indexOf('gdsSummaryEl.textContent');
  console.log('Around:', JSON.stringify(c.substring(idx-20, idx+200)));
}
