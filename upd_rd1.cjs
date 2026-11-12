const fs = require('fs');
let c = fs.readFileSync('src/ui/MaskLabPanel.js', 'utf8');

// Replace header + add section navigator (after line 1437, before "// 2. Update Sidebar")
const old1 = `    // 1. Update Title Header & Live Telemetry Strip
    const headerEl = this.gdsViewerEl.querySelector('[data-mask-gds-analysis-header]');
    if (headerEl) {
      headerEl.innerHTML = \`
        <div class="mask-gds-analysis-title-group">
          <h2 class="mask-gds-analysis-title">${analysis.title}</h2>
          <span class="mask-gds-analysis-subtitle">${analysis.subtitle}</span>
        </div>
        <div class="mask-chip-telemetry">
          <div class="telemetry-pill">
            <span class="pill-label">ARCHITECTURE</span>
            <strong>${analysis.architecture}</strong>
          </div>
          <div class="telemetry-pill">
            <span class="pill-label">PROCESS NODE</span>
            <strong>${analysis.pdkLabel}</strong>
          </div>
          <div class="telemetry-pill">
            <span class="pill-label">DIE SIZE</span>
            <strong>${analysis.widthUm.toFixed(1)} µm × ${analysis.heightUm.toFixed(1)} µm</strong>
          </div>
          <div class="telemetry-pill">
            <span class="pill-label">DIE AREA</span>
            <strong>${analysis.dieAreaUm2.toFixed(1)} µm² <small>(${analysis.dieAreaMm2.toFixed(4)} mm²)</small></strong>
          </div>
          <div class="telemetry-pill">
            <span class="pill-label">SHAPES</span>
            <strong>${analysis.totalShapes.toLocaleString()} <small>(${analysis.activeLayers.length} layers)</small></strong>
          </div>
          <div class="telemetry-pill">
            <span class="pill-label">DENSITY</span>
            <strong>${(analysis.totalShapes / Math.max(analysis.dieAreaUm2, 0.001)).toFixed(2)} shapes/µm²</strong>
          </div>
        </div>
      \`;
    }

    // 2. Update Sidebar (Layer Legend & Output Pins)`;

const new1 = `    // 1. Update Chip Meta Header
    const metaEl = this.gdsViewerEl.querySelector('[data-mask-gds-chip-meta]');
    if (metaEl) {
      metaEl.innerHTML = \`
        <span class="meta-chip">Chip: \${escapeHTML(analysis.cleanName)}</span>
        <span class="meta-arch">Arch: \${analysis.architecture}</span>
        <span class="meta-pdk">PDK: \${analysis.pdkLabel}</span>
      \`;
    }

    // 2. Update Title Header & Live Telemetry Strip
    const headerEl = this.gdsViewerEl.querySelector('[data-mask-gds-analysis-header]');
    if (headerEl) {
      headerEl.innerHTML = \`
        <div class="mask-gds-analysis-title-group">
          <h2 class="mask-gds-analysis-title" data-mask-gds-analysis-title>\${analysis.title}</h2>
          <span class="mask-gds-analysis-subtitle" data-mask-gds-analysis-subtitle>\${analysis.subtitle}</span>
        </div>
        <div class="mask-chip-telemetry" data-mask-chip-telemetry>
          <div class="telemetry-pill">
            <span class="pill-label">ARCHITECTURE</span>
            <strong>\${analysis.architecture}</strong>
          </div>
          <div class="telemetry-pill">
            <span class="pill-label">PROCESS NODE</span>
            <strong>\${analysis.pdkLabel}</strong>
          </div>
          <div class="telemetry-pill">
            <span class="pill-label">DIE SIZE</span>
            <strong>\${analysis.widthUm.toFixed(1)} µm × \${analysis.heightUm.toFixed(1)} µm</strong>
          </div>
          <div class="telemetry-pill">
            <span class="pill-label">DIE AREA</span>
            <strong>\${analysis.dieAreaUm2.toFixed(1)} µm² <small>(\${analysis.dieAreaMm2.toFixed(4)} mm²)</small></strong>
          </div>
          <div class="telemetry-pill">
            <span class="pill-label">SHAPES</span>
            <strong>\${analysis.totalShapes.toLocaleString()} <small>(\${analysis.activeLayers.length} layers)</small></strong>
          </div>
          <div class="telemetry-pill">
            <span class="pill-label">DENSITY</span>
            <strong>(\${(analysis.totalShapes / Math.max(analysis.dieAreaUm2, 0.001)).toFixed(2)} shapes/µm²)</strong>
          </div>
        </div>
      \`;
    }

    // 3. Update Section Navigator (left panel)
    const navigatorList = this.gdsViewerEl.querySelector('[data-mask-section-list]');
    const sectionCountEl = this.gdsViewerEl.querySelector('[data-mask-section-count]');
    if (navigatorList && analysis.groups) {
      navigatorList.innerHTML = analysis.groups.map((g, idx) => \`
        <div class="navigator-item" data-nav-item="\${idx}" style="--sec-color: \${g.color};">
          <span class="nav-color-dot" style="background: \${g.color};"></span>
          <div class="nav-info">
            <strong>\${g.number}. \${escapeHTML(g.name)}</strong>
            <small>\${escapeHTML(g.sub || '')}</small>
          </div>
          <span class="nav-area">\${g.percentArea}% die</span>
        </div>
      \`).join('');
      navigatorList.querySelectorAll('[data-nav-item]').forEach((el) => {
        const idx = Number(el.dataset.navItem);
        el.addEventListener('click', () => this.selectSection(idx));
        el.addEventListener('pointerenter', () => this.selectSection(idx));
      });
    }
    if (sectionCountEl && analysis.groups) {
      sectionCountEl.textContent = \`\${analysis.groups.length} sections\`;
    }

    // 4. Update Sidebar (Layer Legend & Output Pins)`;

if (c.includes(old1)) {
  c = c.replace(old1, new1);
  fs.writeFileSync('src/ui/MaskLabPanel.js', c);
  console.log('SUCCESS: Part 1 (header + navigator) updated');
} else {
  console.log('FAIL: Part 1 marker not found');
  const idx = c.indexOf('// 1. Update Title Header');
  console.log('Found at:', idx);
  console.log('Around:', JSON.stringify(c.substring(idx, idx+100)));
}
