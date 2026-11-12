import {
  DEFAULT_MASK_TECHNOLOGY_ID,
  MASK_EDITOR_GRID_PITCH_NM,
  MASK_TECHNOLOGIES
} from '../data/MaskTechnologyProfiles.js';
import { buildGdsVectorPreview } from '../utils/GdsVectorPreview.js';

const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const MASK_STORAGE_KEY = 'electroDesigner.maskLab.current';
const MASK_LEARNING_PROGRESS_KEY = 'electroDesigner.maskLab.learningProgress';
const MASK_LEARNING_STATS_KEY = 'electroDesigner.maskLab.learningStats';
export const MASK_LESSONS = [
  {
    id: 'pixel-dot',
    title: '1 · Create a single feature',
    objective: 'Draw a single illuminated 10 nm pixel that sits at the center of the mask.',
    hints: ['Use the 64 × 64 mask grid and draw one cell.', 'The center pixel is at roughly x = 32, y = 32.'],
    width: 64,
    height: 64,
    cells: [[32, 32]]
  },
  {
    id: 'line-pair',
    title: '2 · Build a line pair',
    objective: 'Create two parallel 5-pixel horizontal lines across the middle of the mask.',
    hints: ['Each line is 50 nm long.', 'Leave a 20 nm edge-to-edge gap between the lines.'],
    width: 64,
    height: 64,
    cells: [
      ...Array.from({ length: 5 }, (_, index) => [28 + index, 30]),
      ...Array.from({ length: 5 }, (_, index) => [28 + index, 33])
    ]
  },
  {
    id: 'ring-window',
    title: '3 · Frame a square opening',
    objective: 'Draw a 6 × 6 pixel square frame around an empty 4 × 4 pixel opening.',
    hints: ['The outer frame is 60 nm on each side.', 'Only draw the perimeter; leave the 4 × 4 center empty.'],
    width: 64,
    height: 64,
    cells: Array.from({ length: 36 }, (_, index) => {
      const x = 29 + (index % 6);
      const y = 29 + Math.floor(index / 6);
      return x === 29 || x === 34 || y === 29 || y === 34 ? [x, y] : null;
    }).filter(Boolean)
  },
  {
    id: 'repeat-grid',
    title: '4 · Build a 4 × 4 feature array',
    objective: 'Create sixteen isolated 10 nm square features on a 20 nm pitch near the top-left of the mask.',
    hints: ['Use a 2-pixel center-to-center spacing in both directions.', 'Place four features in each of four evenly spaced rows.'],
    width: 64,
    height: 64,
    cells: Array.from({ length: 16 }, (_, index) => [
      8 + (index % 4) * 2,
      8 + Math.floor(index / 4) * 2
    ])
  }
];

export class MaskLabPanel {
  constructor(editor) {
    this.editor = editor;
    this.pixelSizeNm = MASK_EDITOR_GRID_PITCH_NM;
    this.gridWidth = 64;
    this.gridHeight = 64;
    this.name = 'MaskLab';
    this.technologyId = DEFAULT_MASK_TECHNOLOGY_ID;
    this.profileLayouts = this.createProfileLayouts(this.gridWidth, this.gridHeight);
    this.gdsPreview = null;
    this.gdsViewBox = null;
    this.gdsPan = null;
    this.layerMasks = this.profileLayouts[this.technologyId].layers;
    this.activeLayerId = this.profileLayouts[this.technologyId].activeLayerId;
    this.sourceDesign = null;
    this.brushMode = 'draw';
    this.isDrawing = false;
    this.cellElements = [];
    this.renderedGridWidth = 0;
    this.renderedGridHeight = 0;
    this.focusedCell = null;
    this.mask = this.layerMasks[this.activeLayerId];
    this.learningProgress = this.loadLearningProgress();
    this.learningStats = this.loadLearningStats();
    this.learningLessonIndex = 0;
    this.learningHintCount = 0;
    this.learningResult = 'No challenge checked yet.';
    this.activeTrainingLessonId = null;
    this.learningPassed = false;
    this.trainingSessionSnapshot = null;

    this.el = document.createElement('section');
    this.el.className = 'mask-lab';
    this.el.hidden = true;
    this.el.innerHTML = `
      <header class="mask-topbar">
        <div class="mask-brand">
          <span class="mask-brand-mark">M</span>
          <div>
            <strong>Mask Lab</strong>
            <small>Technology profiles · multi-layer editor</small>
          </div>
        </div>
        <label class="mask-name-label">MASK NAME<input data-mask-name maxlength="48" value="MaskLab" aria-label="Mask name"></label>
        <div class="mask-top-actions">
          <button type="button" data-mask-action="open-training">Training</button>
          <button type="button" data-mask-action="auto-fill-chip">Auto-fill from Chip Lab</button>
          <button type="button" data-mask-action="clear">Clear</button>
          <button type="button" data-mask-action="fill">Fill</button>
          <button type="button" data-mask-action="invert">Invert</button>
          <button type="button" data-mask-action="import-gds">View GDS layers</button>
          <input type="file" data-mask-gds-input accept=".gds,.gdsii" hidden>
          <button type="button" data-mask-action="export" class="mask-primary">Export</button>
        </div>
      </header>
      <nav class="mask-technology-tabs" role="tablist" aria-label="Mask technology profile">
        ${MASK_TECHNOLOGIES.map((technology) => `
          <button type="button" id="mask-technology-tab-${technology.id}" role="tab" aria-controls="mask-profile-panel" tabindex="${technology.id === this.technologyId ? '0' : '-1'}" data-mask-technology="${technology.id}" aria-selected="${technology.id === this.technologyId}">
            ${technology.label}
          </button>`).join('')}
      </nav>
      <section class="mask-profile-notice" id="mask-profile-panel" role="tabpanel" aria-labelledby="mask-technology-tab-${this.technologyId}" data-mask-profile-notice aria-live="polite"></section>
      <div class="mask-workbench">
        <aside class="mask-tools">
          <div class="mask-panel-title"><span>CONTROLS</span></div>
          <div class="mask-control-group">
            <div class="mask-layer-heading">PROCESS LAYERS</div>
            <div class="mask-layer-list" data-mask-layer-list aria-label="Drawing layer"></div>
          </div>
          <div class="mask-control-group">
            <label>
              <span>Grid size</span>
              <input type="range" min="8" max="128" step="8" value="64" data-mask-grid-size>
            </label>
            <div class="mask-size-readout" data-mask-size-readout>64 × 64 pixels</div>
            <div class="mask-brush-group">
              <button type="button" class="mask-brush active" data-mask-brush="draw">Draw</button>
              <button type="button" class="mask-brush" data-mask-brush="erase">Erase</button>
            </div>
          </div>
          <div class="mask-control-group">
            <label>
              <span>Editor raster pitch</span>
              <input type="text" value="${this.pixelSizeNm} nm" readonly>
            </label>
            <div class="mask-size-readout" data-mask-dimension-readout>640 nm × 640 nm</div>
            <small class="mask-control-note">Display raster only; not the PDK manufacturing grid.</small>
          </div>
        </aside>
        <main class="mask-editor-panel">
          <div class="mask-focus-bar">
            <div class="mask-summary" data-mask-summary>0 / 4096 pixels lit</div>
            <div class="mask-layer-indicator" data-mask-active-layer></div>
            <div class="mask-path" data-mask-path>MaskLab</div>
            <div class="mask-status" data-mask-status role="status" aria-live="polite"></div>
          </div>
          <div class="mask-grid-shell">
            <div class="mask-grid" data-mask-grid role="group" aria-label="Mask pixels. Use arrow keys to move and Enter or Space to paint."></div>
          </div>
        </main>
        <aside class="mask-inspector">
          <div class="mask-panel-title"><span>DETAILS</span></div>
          <div class="mask-control-group">
            <div class="mask-info-row"><span>Editor raster</span><strong>10 nm / pixel</strong></div>
            <div class="mask-info-row"><span>Mask area</span><strong data-mask-area>640 nm × 640 nm</strong></div>
            <div class="mask-info-row"><span>Cells active</span><strong data-mask-count>0</strong></div>
          </div>
          <div class="mask-control-group">
            <div class="mask-info-row"><span>Source</span><strong data-mask-source>Manual</strong></div>
            <div class="mask-info-row"><span>Power wiring</span><strong data-mask-power-status>Not checked</strong></div>
            <p class="mask-source-details" data-mask-source-details>No Chip Lab source attached.</p>
            <div class="mask-info-row"><span>File</span><strong>JSON export</strong></div>
            <div class="mask-info-row"><span>Storage</span><strong>local browser</strong></div>
          </div>
        </aside>
      </div>
      <section class="mask-gds-viewer functional-grouping-active" data-mask-gds-viewer hidden aria-label="GDS layer viewer">
        <header>
          <div class="mask-gds-header-group">
            <div class="mask-gds-chip-definition">
              <strong class="mask-gds-viewer-title">Chip Layout &amp; Functional Grouping</strong>
              <span data-mask-gds-summary>Import a physical layout to inspect its actual geometry by layer.</span>
            </div>
            <div class="mask-gds-chip-meta" data-mask-gds-chip-meta>
              <span class="meta-chip">Chip: —</span>
              <span class="meta-arch">Arch: —</span>
              <span class="meta-pdk">PDK: —</span>
            </div>
          </div>
          <div class="mask-gds-actions">
            <button type="button" class="mask-gds-group-toggle" data-mask-gds-grouping aria-pressed="true">Functional Grouping</button>
            <button type="button" data-mask-gds-close>Back to Mask Editor</button>
            <button type="button" data-mask-gds-zoom="out" aria-label="Zoom out">−</button>
            <button type="button" data-mask-gds-zoom="in" aria-label="Zoom in">+</button>
            <button type="button" data-mask-gds-zoom="fit">Fit to View</button>
          </div>
        </header>

        <div class="mask-gds-analysis-header" data-mask-gds-analysis-header>
          <div class="mask-gds-analysis-title-group">
            <h2 class="mask-gds-analysis-title" data-mask-gds-analysis-title>Functional Grouping Analysis</h2>
            <span class="mask-gds-analysis-subtitle" data-mask-gds-analysis-subtitle>Physical layout · Functional sections · Layer map</span>
          </div>
          <div class="mask-chip-telemetry" data-mask-chip-telemetry></div>
        </div>

        <div class="mask-gds-content">
          <nav aria-label="GDS layers">
            <div class="mask-gds-bulk-actions">
              <button type="button" data-mask-gds-layers-action="show">Show all</button>
              <button type="button" data-mask-gds-layers-action="hide">Hide all</button>
            </div>
            <div data-mask-gds-layers></div>
          </nav>
          <div class="mask-gds-main-stage">
            <!-- Section Navigator: Left panel listing all functional sections -->
            <aside class="mask-section-navigator" data-mask-section-navigator>
              <div class="navigator-header">
                <h4>Functional Sections</h4>
                <span class="navigator-count" data-mask-section-count>0 sections</span>
              </div>
              <div class="navigator-list" data-mask-section-list>
              </div>
              <div class="navigator-footer">
                <small>Click a section to inspect its definition and physical properties.</small>
              </div>
            </aside>
            <div class="mask-gds-canvas-wrapper">
              <div class="mask-gds-canvas">
              <svg data-mask-gds-svg role="img" aria-label="Vector view of the imported GDS layout" preserveAspectRatio="xMidYMid meet"></svg>
            </div>
          </div>

            <!-- Section Inspector: Right panel with detailed definition of selected section -->
            <aside class="mask-gds-analysis-sidebar" data-mask-gds-analysis-sidebar>
              <div class="mask-analysis-panel mask-section-inspector-panel" data-mask-section-inspector>
                <div class="mask-inspector-empty">
                  <span class="empty-icon">◐</span>
                  <h3>Section Inspector</h3>
                  <p>Select a functional section from the navigator or canvas to view its definition, physical bounds, layer composition, and engineering details.</p>
                </div>
                <div class="mask-inspector-body" data-mask-section-inspector-body hidden>
                  <div class="inspector-section-header">
                    <span class="inspector-badge" style="background:var(--sec-color);"></span>
                    <div>
                      <strong class="inspector-title" data-inspector-title>Section Title</strong>
                      <small class="inspector-sub" data-inspector-sub>Subtitle</small>
                    </div>
                  </div>
                  <p class="mask-inspector-definition" data-inspector-definition>Definition of this functional section.</p>
                  <div class="mask-inspector-props" data-inspector-props>
                  </div>
                  <div class="inspector-layers" data-inspector-layers>
                  </div>
                  <div class="inspector-bullets" data-inspector-bullets>
                  </div>
                </div>
              </div>
              <div class="mask-analysis-panel mask-layer-legend-panel">
                <h3>Layer Legend (typical)</h3>
                <ul class="mask-layer-legend-list">
                  <li><span class="swatch" style="background:#1966d2;"></span><span class="label"><strong>Metal 1 (M1)</strong><small>– horizontal routing</small></span></li>
                  <li><span class="swatch" style="background:#8a2be2;"></span><span class="label"><strong>Metal 2 (M2)</strong><small>– vertical routing</small></span></li>
                  <li><span class="swatch" style="background:#e63946;"></span><span class="label"><strong>Polysilicon (Poly)</strong><small>– gates</small></span></li>
                  <li><span class="swatch" style="background:#2ecc71;"></span><span class="label"><strong>Diffusion (Active)</strong><small>– transistors</small></span></li>
                  <li><span class="swatch" style="background:#f39c12;"></span><span class="label"><strong>Contact (VIA)</strong><small>– layer connection</small></span></li>
                  <li><span class="swatch" style="background:#6c757d;"></span><span class="label"><strong>Well / N-Well / P-Well</strong><small>– device isolation</small></span></li>
                </ul>
              </div>
              <div class="mask-analysis-panel mask-outputs-panel">
                <h3>Detected Pins &amp; I/O</h3>
                <div class="mask-outputs-list">
                  <div class="mask-outputs-items">
                    <span class="output-item">Loading pins…</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <div class="mask-gds-analysis-dashboard" data-mask-gds-analysis-dashboard>
          <!-- Functional Section Cards: One expandable card per section -->
          <div class="mask-dashboard-card mask-functional-section-cards">
            <div class="card-title-bar">
              <h3>Functional Section Definitions</h3>
              <small>Each section with its purpose, physical properties, and layer composition</small>
            </div>
            <div class="mask-section-cards-grid" data-mask-section-cards-grid>
              <!-- Section cards injected by renderAnalysisDashboard -->
            </div>
          </div>

          <div class="mask-dashboard-card mask-logic-diagram-card">
            <div class="card-title-bar">
              <h3>Chip Architecture Diagram</h3>
              <small>Synchronous dataflow overview</small>
            </div>
            <div class="mask-diagram-wrapper">
              <!-- Architecture SVG injected by renderAnalysisDashboard -->
            </div>
          </div>

          <div class="mask-dashboard-card mask-notes-card">
            <div class="card-title-bar">
              <h3>Physical Verification &amp; Engineering Notes</h3>
              <small>PDK layout signoff telemetry</small>
            </div>
            <ul data-mask-analysis-notes>
              <!-- Notes injected by renderAnalysisDashboard -->
            </ul>
          </div>
        </div>

        <p data-mask-gds-status role="status" aria-live="polite">GDS layers are read-only vector previews. They do not modify the educational raster or produce foundry signoff.</p>
      </section>
      <div class="mask-learning-modal" data-mask-learning-modal hidden>
        <section role="dialog" aria-modal="true" aria-labelledby="mask-training-title">
          <header>
            <div>
              <strong id="mask-training-title">Mask development training</strong>
              <span>Practice common lithography patterns and pitch logic</span>
            </div>
            <button type="button" data-mask-action="close-training" aria-label="Close training">×</button>
          </header>
          <div class="mask-learning-layout">
            <nav data-mask-learning-list aria-label="Training lessons"></nav>
            <article data-mask-learning-content></article>
          </div>
          <footer>
            <span data-mask-training-progress aria-live="polite">${this.learningProgress.length} / ${MASK_LESSONS.length} completed</span>
            <button type="button" data-mask-action="load-training">Start challenge</button>
            <button type="button" class="mask-primary" data-mask-action="check-training">Check my mask</button>
            <button type="button" data-mask-action="next-training-lesson" hidden>Next lesson</button>
          </footer>
        </section>
      </div>
    `;

    this.gridEl = this.el.querySelector('[data-mask-grid]');
    this.summaryEl = this.el.querySelector('[data-mask-summary]');
    this.sizeReadoutEl = this.el.querySelector('[data-mask-size-readout]');
    this.dimensionReadoutEl = this.el.querySelector('[data-mask-dimension-readout]');
    this.maskAreaEl = this.el.querySelector('[data-mask-area]');
    this.maskCountEl = this.el.querySelector('[data-mask-count]');
    this.maskPathEl = this.el.querySelector('[data-mask-path]');
    this.maskSourceEl = this.el.querySelector('[data-mask-source]');
    this.maskPowerStatusEl = this.el.querySelector('[data-mask-power-status]');
    this.maskSourceDetailsEl = this.el.querySelector('[data-mask-source-details]');
    this.statusEl = this.el.querySelector('[data-mask-status]');
    this.activeLayerEl = this.el.querySelector('[data-mask-active-layer]');
    this.technologyTabsEl = this.el.querySelector('.mask-technology-tabs');
    this.profileNoticeEl = this.el.querySelector('[data-mask-profile-notice]');
    this.layerListEl = this.el.querySelector('[data-mask-layer-list]');
    this.autoFillButton = this.el.querySelector('[data-mask-action="auto-fill-chip"]');
    this.gdsViewerEl = this.el.querySelector('[data-mask-gds-viewer]');
    this.gdsSvgEl = this.el.querySelector('[data-mask-gds-svg]');
    this.gdsLayersEl = this.el.querySelector('[data-mask-gds-layers]');
    this.gdsSummaryEl = this.el.querySelector('[data-mask-gds-summary]');
    this.gdsStatusEl = this.el.querySelector('[data-mask-gds-status]');

    this.loadState();
    this.bindEvents();
    this.renderGrid();
    this.renderTechnologyProfile();
    this.updateSummary();
    this.renderLearningPath();
  }

  createMask(width, height) {
    return Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  }

  createProfileLayouts(width, height) {
    return Object.fromEntries(MASK_TECHNOLOGIES.map((technology) => [
      technology.id,
      {
        width,
        height,
        activeLayerId: technology.layers[0].id,
        name: 'MaskLab',
        sourceDesign: null,
        layers: Object.fromEntries(technology.layers.map(({ id }) => [id, this.createMask(width, height)]))
      }
    ]));
  }

  getTechnology() {
    return MASK_TECHNOLOGIES.find(({ id }) => id === this.technologyId) || MASK_TECHNOLOGIES[2];
  }

  syncProfileLayout() {
    this.layerMasks[this.activeLayerId] = this.mask;
    const layout = this.profileLayouts[this.technologyId];
    layout.width = this.gridWidth;
    layout.height = this.gridHeight;
    layout.activeLayerId = this.activeLayerId;
    layout.name = this.name;
    layout.sourceDesign = this.sourceDesign;
    layout.layers = this.layerMasks;
  }

  setCurrentLayerMask(mask) {
    this.mask = mask;
    this.layerMasks[this.activeLayerId] = mask;
  }

  selectTechnology(technologyId) {
    const technology = MASK_TECHNOLOGIES.find(({ id }) => id === technologyId);
    if (!technology || technology.id === this.technologyId) return false;
    if (this.trainingSessionSnapshot) {
      this.setStatus('Close the training challenge before changing technology profiles.');
      return false;
    }
    this.syncProfileLayout();
    this.technologyId = technology.id;
    const layout = this.profileLayouts[technology.id];
    this.gridWidth = layout.width;
    this.gridHeight = layout.height;
    this.layerMasks = layout.layers;
    this.activeLayerId = layout.activeLayerId;
    this.mask = this.layerMasks[this.activeLayerId];
    this.name = layout.name;
    this.sourceDesign = layout.sourceDesign;
    const nameInput = this.el?.querySelector('[data-mask-name]');
    if (nameInput) nameInput.value = this.name;
    const sizeInput = this.el?.querySelector('[data-mask-grid-size]');
    if (sizeInput) sizeInput.value = String(this.gridWidth);
    this.renderTechnologyProfile();
    this.renderGrid();
    this.updateSummary();
    this.saveState();
    return true;
  }

  selectLayer(layerId) {
    if (!this.layerMasks[layerId] || layerId === this.activeLayerId) return false;
    this.syncProfileLayout();
    this.activeLayerId = layerId;
    this.mask = this.layerMasks[layerId];
    this.profileLayouts[this.technologyId].activeLayerId = layerId;
    this.renderTechnologyProfile();
    this.renderGrid();
    this.updateSummary();
    this.saveState();
    return true;
  }

  renderTechnologyProfile() {
    const technology = this.getTechnology();
    this.technologyTabsEl?.querySelectorAll('[data-mask-technology]').forEach((button) => {
      const selected = button.dataset.maskTechnology === technology.id;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.classList.toggle('active', selected);
    });
    this.profileNoticeEl?.setAttribute('aria-labelledby', `mask-technology-tab-${technology.id}`);
    if (this.profileNoticeEl) {
      this.profileNoticeEl.replaceChildren();
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = technology.name;
      const status = document.createElement('span');
      status.textContent = technology.status;
      const description = document.createElement('p');
      description.textContent = technology.description;
      info.append(title, status, description);
      this.profileNoticeEl.appendChild(info);
      if (technology.sourceUrl) {
        const source = document.createElement('a');
        source.href = technology.sourceUrl;
        source.target = '_blank';
        source.rel = 'noreferrer';
        source.textContent = 'Layer documentation';
        this.profileNoticeEl.appendChild(source);
      }
      if (technology.maskSourceUrl) {
        const source = document.createElement('a');
        source.href = technology.maskSourceUrl;
        source.target = '_blank';
        source.rel = 'noreferrer';
        source.textContent = 'Mask numbering and polarity';
        this.profileNoticeEl.appendChild(source);
      }
      if (technology.statusSourceUrl) {
        const source = document.createElement('a');
        source.href = technology.statusSourceUrl;
        source.target = '_blank';
        source.rel = 'noreferrer';
        source.textContent = 'PDK status';
        this.profileNoticeEl.appendChild(source);
      }
      const warning = document.createElement('strong');
      warning.className = 'mask-profile-warning';
      warning.textContent = technology.id === 'generic'
        ? 'Educational drawing only. No PDK rules or fabrication validity are implied.'
        : 'Editor raster is not a PDK manufacturing grid. No DRC, LVS, GDS/OASIS export, or foundry signoff is performed.';
      this.profileNoticeEl.appendChild(warning);
    }
    if (this.autoFillButton) {
      this.autoFillButton.disabled = technology.id !== 'generic';
      this.autoFillButton.title = technology.id === 'generic'
        ? 'Generate conceptual mask layers from the Chip Lab placement preview'
        : 'Schematic rasterization is only available in the Educational profile';
    }
    if (this.layerListEl) {
      this.layerListEl.replaceChildren();
      technology.layers.forEach((entry) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.maskLayer = entry.id;
        button.setAttribute('aria-pressed', String(entry.id === this.activeLayerId));
        button.classList.toggle('active', entry.id === this.activeLayerId);
        const swatch = document.createElement('span');
        swatch.className = 'mask-layer-swatch';
        swatch.style.backgroundColor = entry.color;
        const label = document.createElement('span');
        label.className = 'mask-layer-label';
        label.textContent = entry.label;
        const detail = document.createElement('small');
        detail.textContent = entry.stream ? `GDS ${entry.stream}` : entry.description;
        button.title = `${entry.description}${entry.stream ? ` · GDS ${entry.stream}` : ''}${entry.mask ? ` · Mask ${entry.mask} · ${entry.polarity}` : ''}`;
        button.append(swatch, label, detail);
        this.layerListEl.appendChild(button);
      });
    }
  }

  setActive(active) {
    this.el.hidden = !active;
    if (!active && this.trainingSessionSnapshot) this.closeTraining();
    if (active) {
      this.updateSummary();
    }
  }

  getSummary() {
    const widthNm = this.gridWidth * this.pixelSizeNm;
    const heightNm = this.gridHeight * this.pixelSizeNm;
    const activePixels = this.mask.flat().filter(Boolean).length;
    return {
      activePixels,
      widthNm,
      heightNm,
      totalPixels: this.gridWidth * this.gridHeight,
      fillRatio: (activePixels / (this.gridWidth * this.gridHeight)) * 100
    };
  }

  updateSummary() {
    const summary = this.getSummary();
    if (this.summaryEl) this.summaryEl.textContent = `${summary.activePixels} / ${summary.totalPixels} pixels lit`;
    if (this.sizeReadoutEl) this.sizeReadoutEl.textContent = `${this.gridWidth} × ${this.gridHeight} pixels`;
    if (this.dimensionReadoutEl) this.dimensionReadoutEl.textContent = `${summary.widthNm} nm × ${summary.heightNm} nm`;
    if (this.maskAreaEl) this.maskAreaEl.textContent = `${summary.widthNm} nm × ${summary.heightNm} nm`;
    if (this.maskCountEl) this.maskCountEl.textContent = String(summary.activePixels);
    const activeLayer = this.getTechnology().layers.find(({ id }) => id === this.activeLayerId);
    if (this.activeLayerEl) this.activeLayerEl.textContent = `${this.getTechnology().label} / ${activeLayer?.label || this.activeLayerId}`;
    if (this.maskPathEl) this.maskPathEl.textContent = this.name;
    if (this.maskSourceEl) this.maskSourceEl.textContent = this.sourceDesign ? this.sourceDesign.name : 'Manual';
    if (this.maskPowerStatusEl) this.maskPowerStatusEl.textContent = this.sourceDesign?.powerCheck?.ok ? 'Connected' :
      this.sourceDesign?.powerCheck ? 'Review wiring' : 'Not checked';
    if (this.maskSourceDetailsEl) {
      if (!this.sourceDesign) {
        this.maskSourceDetailsEl.textContent = 'No Chip Lab source attached.';
      } else {
        const unresolved = this.sourceDesign.simulation?.unresolvedComponents?.length || 0;
        const passed = this.sourceDesign.testBench?.passed;
        const tests = this.sourceDesign.testBench?.total;
        const layout = this.sourceDesign.physicalLayout;
        const dieSize = layout ? ` · die ${layout.widthMm} × ${layout.heightMm} mm` : '';
        this.maskSourceDetailsEl.textContent = `${this.sourceDesign.componentCount} components · ${this.sourceDesign.wireCount} wires${dieSize} · ${unresolved} unresolved${Number.isInteger(tests) ? ` · tests ${passed}/${tests}` : ''}`;
        if (this.sourceDesign.sourceView === 'physical-layout-preview') this.maskSourceDetailsEl.textContent += ' · physical placement';
      }
    }
  }

  bindEvents() {
    this.technologyTabsEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-mask-technology]');
      if (button) this.selectTechnology(button.dataset.maskTechnology);
    });
    this.technologyTabsEl.addEventListener('keydown', (event) => {
      const current = event.target.closest('[data-mask-technology]');
      if (!current) return;
      const tabs = [...this.technologyTabsEl.querySelectorAll('[data-mask-technology]')];
      const currentIndex = tabs.indexOf(current);
      const nextIndex = event.key === 'ArrowRight' ? (currentIndex + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (currentIndex - 1 + tabs.length) % tabs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (nextIndex < 0) return;
      event.preventDefault();
      tabs[nextIndex].focus();
      this.selectTechnology(tabs[nextIndex].dataset.maskTechnology);
    });
    this.layerListEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-mask-layer]');
      if (button) this.selectLayer(button.dataset.maskLayer);
    });
    this.el.addEventListener('click', (event) => {
      const bulkLayers = event.target.closest('[data-mask-gds-layers-action]');
      if (bulkLayers) {
        this.setGdsLayersVisible(bulkLayers.dataset.maskGdsLayersAction === 'show');
        return;
      }
      const groupingToggle = event.target.closest('[data-mask-gds-grouping]');
      if (groupingToggle) {
        const visible = groupingToggle.getAttribute('aria-pressed') !== 'true';
        this.setFunctionalGroupingVisible(visible);
        return;
      }
      if (event.target.closest('[data-mask-gds-close]')) {
        this.el.classList.remove('gds-view-mode');
        this.gdsViewerEl.hidden = true;
        return;
      }
      const layerToggle = event.target.closest('[data-mask-gds-layer-toggle]');
      if (layerToggle) {
        const group = document.getElementById(`mask-gds-layer-${layerToggle.dataset.maskGdsLayerToggle.replace('/', '-')}`);
        const visible = layerToggle.getAttribute('aria-pressed') !== 'true';
        if (group) group.style.display = visible ? '' : 'none';
        layerToggle.setAttribute('aria-pressed', String(visible));
        return;
      }
      const zoom = event.target.closest('[data-mask-gds-zoom]');
      if (zoom) {
        if (zoom.dataset.maskGdsZoom === 'fit') this.fitGdsPreview();
        else this.zoomGdsPreview(zoom.dataset.maskGdsZoom === 'in' ? 0.5 : 2);
        return;
      }
      const cell = event.target.closest('.mask-cell');
      if (cell) {
        this.paintCell(cell, this.brushMode === 'draw');
        this.saveState();
        return;
      }
      const trigger = event.target.closest('[data-mask-action]');
      if (!trigger) return;
      const action = trigger.dataset.maskAction;
      if (action === 'clear') this.clearMask();
      if (action === 'fill') this.fillMask();
      if (action === 'invert') this.invertMask();
      if (action === 'export') this.exportMaskFile();
      if (action === 'auto-fill-chip') this.autoFillFromChipDesign();
      if (action === 'import-gds') this.el.querySelector('[data-mask-gds-input]').click();
    });

    this.el.querySelector('[data-mask-gds-input]').addEventListener('change', async (event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file) return;
      this.gdsStatusEl.textContent = `Reading ${file.name}…`;
      try { this.importGdsLayers(await file.arrayBuffer(), file.name); }
      catch (error) { this.gdsStatusEl.textContent = `Could not read GDS: ${error.message}`; }
    });

    this.gdsSvgEl.addEventListener('pointerdown', (event) => {
      if (!this.gdsViewBox) return;
      this.gdsPan = { x: event.clientX, y: event.clientY, viewBox: [...this.gdsViewBox] };
      this.gdsSvgEl.setPointerCapture(event.pointerId);
    });
    this.gdsSvgEl.addEventListener('pointermove', (event) => {
      if (!this.gdsPan) return;
      const rect = this.gdsSvgEl.getBoundingClientRect();
      const [x, y, width, height] = this.gdsPan.viewBox;
      this.gdsViewBox = [
        x - (event.clientX - this.gdsPan.x) / Math.max(rect.width, 1) * width,
        y - (event.clientY - this.gdsPan.y) / Math.max(rect.height, 1) * height,
        width, height
      ];
      this.setGdsSvgViewBox();
    });
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.gdsSvgEl.addEventListener(eventName, () => { this.gdsPan = null; });
    }

    this.el.querySelector('[data-mask-grid-size]').addEventListener('input', (event) => {
      const size = Number(event.target.value);
      if (!Number.isFinite(size)) return;
      this.resizeGrid(size, size);
    });

    this.el.querySelectorAll('[data-mask-brush]').forEach((button) => {
      button.addEventListener('click', () => {
        this.brushMode = button.dataset.maskBrush;
        this.el.querySelectorAll('[data-mask-brush]').forEach((item) => item.classList.toggle('active', item === button));
      });
    });

    this.el.querySelector('[data-mask-name]').addEventListener('input', (event) => {
      this.name = event.target.value.trim() || 'MaskLab';
      this.updateSummary();
      this.saveState();
    });

    this.gridEl.addEventListener('keydown', (event) => {
      const cell = event.target.closest('.mask-cell');
      if (!cell) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.paintCell(cell, this.brushMode === 'draw');
        this.saveState();
        return;
      }
      const x = Number(cell.dataset.x);
      const y = Number(cell.dataset.y);
      let nextX = x;
      let nextY = y;
      if (event.key === 'ArrowLeft') nextX -= 1;
      else if (event.key === 'ArrowRight') nextX += 1;
      else if (event.key === 'ArrowUp') nextY -= 1;
      else if (event.key === 'ArrowDown') nextY += 1;
      else if (event.key === 'Home') {
        nextX = 0;
        if (event.ctrlKey) nextY = 0;
      } else if (event.key === 'End') {
        nextX = this.gridWidth - 1;
        if (event.ctrlKey) nextY = this.gridHeight - 1;
      }
      else return;
      event.preventDefault();
      nextX = Math.max(0, Math.min(this.gridWidth - 1, nextX));
      nextY = Math.max(0, Math.min(this.gridHeight - 1, nextY));
      const nextCell = this.cellElements[nextY * this.gridWidth + nextX];
      if (!nextCell) return;
      this.focusCell(nextCell);
    });

    this.gridEl.addEventListener('pointerdown', (event) => {
      const cell = event.target.closest('.mask-cell');
      if (!cell) return;
      this.isDrawing = true;
      this.focusCell(cell);
      this.paintCell(cell, this.brushMode === 'draw');
    });

    this.gridEl.addEventListener('pointerenter', (event) => {
      if (!this.isDrawing) return;
      const cell = event.target.closest('.mask-cell');
      if (!cell) return;
      this.paintCell(cell, this.brushMode === 'draw');
    }, true);

    const finishDrawing = () => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      this.saveState();
    };
    window.addEventListener('pointerup', finishDrawing);
    window.addEventListener('pointercancel', finishDrawing);

    this.el.addEventListener('click', (event) => {
      const action = event.target.closest('[data-mask-action]')?.dataset.maskAction;
      if (!action) return;
      if (action === 'open-training') this.openTraining();
      if (action === 'close-training') this.closeTraining();
      if (action === 'load-training') this.loadTrainingLesson();
      if (action === 'check-training') this.checkTrainingLesson();
      if (action === 'select-training-lesson') {
        const idx = Number(event.target.closest('[data-mask-lesson-index]')?.dataset.maskLessonIndex);
        if (Number.isInteger(idx)) this.selectTrainingLesson(idx);
      }
      if (action === 'reveal-training-hint') this.revealTrainingHint();
      if (action === 'next-training-lesson') this.nextTrainingLesson();
    });
    this.el.querySelector('[data-mask-learning-modal]').addEventListener('click', (event) => {
      if (event.target.matches('[data-mask-learning-modal]')) this.closeTraining();
    });
    this.el.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.el.querySelector('[data-mask-learning-modal]').hidden) {
        this.closeTraining();
      }
    });
  }

  resizeGrid(width, height = width) {
    this.syncProfileLayout();
    const nextWidth = Math.max(8, Math.min(128, Number(width) || 64));
    const nextHeight = Math.max(8, Math.min(128, Number(height) || nextWidth));
    for (const layer of this.getTechnology().layers) {
      const previousMask = this.layerMasks[layer.id];
      const resizedMask = this.createMask(nextWidth, nextHeight);
      for (let y = 0; y < Math.min(nextHeight, previousMask.length); y += 1) {
        for (let x = 0; x < Math.min(nextWidth, previousMask[y].length); x += 1) {
          resizedMask[y][x] = previousMask[y][x];
        }
      }
      this.layerMasks[layer.id] = resizedMask;
    }
    this.gridWidth = nextWidth;
    this.gridHeight = nextHeight;
    this.mask = this.layerMasks[this.activeLayerId];
    this.profileLayouts[this.technologyId].width = this.gridWidth;
    this.profileLayouts[this.technologyId].height = this.gridHeight;
    this.sourceDesign = null;
    const sizeInput = this.el.querySelector('[data-mask-grid-size]');
    if (sizeInput && this.gridWidth === this.gridHeight) sizeInput.value = String(this.gridWidth);
    this.renderGrid();
    this.updateSummary();
    this.saveState();
  }

  paintCellAt(x, y, value) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    if (x < 0 || y < 0 || x >= this.gridWidth || y >= this.gridHeight) return false;
    const nextValue = Boolean(value);
    if (this.mask[y][x] === nextValue) return true;
    this.mask[y][x] = nextValue;
    this.sourceDesign = null;
    const cell = this.cellElements?.[y * this.gridWidth + x];
    if (cell) {
      cell.classList.toggle('mask-on', nextValue);
      cell.setAttribute('aria-pressed', String(nextValue));
    }
    this.updateSummary();
    return true;
  }

  paintCell(cell, value) {
    if (!cell) return;
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;
    this.paintCellAt(x, y, value);
  }

  focusCell(cell) {
    if (!cell || cell === this.focusedCell) return;
    if (this.focusedCell) this.focusedCell.tabIndex = -1;
    this.focusedCell = cell;
    this.focusedCell.tabIndex = 0;
    this.focusedCell.focus();
  }

  fillMask() {
    this.sourceDesign = null;
    this.setCurrentLayerMask(this.createMask(this.gridWidth, this.gridHeight).map((row) => row.map(() => true)));
    this.renderGrid();
    this.updateSummary();
    this.saveState();
  }

  clearMask() {
    this.sourceDesign = null;
    this.setCurrentLayerMask(this.createMask(this.gridWidth, this.gridHeight));
    this.renderGrid();
    this.updateSummary();
    this.saveState();
  }

  invertMask() {
    this.sourceDesign = null;
    this.setCurrentLayerMask(this.mask.map((row) => row.map((cell) => !cell)));
    this.renderGrid();
    this.updateSummary();
    this.saveState();
  }

  traceDesignLine(x0, y0, x1, y1, targetMask = this.mask) {
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      if (x >= 0 && y >= 0 && x < this.gridWidth && y < this.gridHeight) targetMask[y][x] = true;
      if (x === x1 && y === y1) break;
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        x += sx;
      }
      if (doubled <= dx) {
        error += dx;
        y += sy;
      }
    }
  }

  importGdsLayers(buffer, fileName = 'layout.gds') {
    const preview = buildGdsVectorPreview(buffer);
    if (!preview.layers.length || !preview.bounds) throw new Error('This GDS has no drawable geometry to display.');
    this.gdsPreview = preview;
    this.gdsFileName = fileName;
    this.gdsViewerEl.hidden = false;
    this.el.classList.add('gds-view-mode');
    const units = `${Math.round(preview.width).toLocaleString()} × ${Math.round(preview.height).toLocaleString()} database units`;
    this.gdsSummaryEl.textContent = `${fileName} · ${preview.pdk} · ${preview.layers.length} layer(s) · ${preview.renderedShapes.toLocaleString()} shapes · ${units}`;
    const metaEl = this.gdsViewerEl.querySelector('[data-mask-gds-chip-meta]');
    if (metaEl) {
      const clean = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b([a-z])/g, (_, c) => c.toUpperCase()).trim();
      metaEl.innerHTML = `
        <span class="meta-chip">Chip: ${escapeHTML(clean)}</span>
        <span class="meta-arch">Arch: ${preview.pdk.toUpperCase()}</span>
        <span class="meta-pdk">PDK: ${preview.layers.length} layers</span>
      `;
    }
    this.gdsLayersEl.replaceChildren();
    this.gdsSvgEl.replaceChildren();

    const svgNamespace = 'http://www.w3.org/2000/svg';
    const geometryGroup = document.createElementNS(svgNamespace, 'g');
    geometryGroup.setAttribute('transform', 'scale(1 -1)');
    const metalOne = preview.layers.find(({ name }) => /(?:^|[._])met(?:al)?1(?:[._]|$)/i.test(name));
    const boundary = preview.layers.filter(({ name }) => /prboundary/i.test(name));
    const fallback = preview.layers.filter(({ role }) => role !== 'fill').sort((a, b) => a.shapes - b.shapes)[0];
    const visibleLayerIds = new Set([metalOne?.id, ...boundary.map(({ id }) => id), ...(metalOne || boundary.length ? [] : [fallback?.id])].filter(Boolean));
    for (const layer of preview.layers) {
      const id = `${layer.layer}-${layer.datatype}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mask-gds-layer';
      button.dataset.maskGdsLayerToggle = layer.id;
      const visibleByDefault = visibleLayerIds.has(layer.id);
      button.setAttribute('aria-pressed', String(visibleByDefault));
      button.title = `${layer.name} · ${layer.layer}/${layer.datatype} · ${layer.shapes.toLocaleString()} shapes · ${layer.role}`;
      const swatch = document.createElement('span');
      swatch.style.backgroundColor = layer.color;
      const label = document.createElement('span');
      label.textContent = layer.name;
      const count = document.createElement('small');
      count.textContent = layer.shapes.toLocaleString();
      button.append(swatch, label, count);
      this.gdsLayersEl.appendChild(button);

      const layerGroup = document.createElementNS(svgNamespace, 'g');
      layerGroup.id = `mask-gds-layer-${id}`;
      layerGroup.dataset.gdsLayer = layer.id;
      layerGroup.style.display = visibleByDefault ? '' : 'none';
      layerGroup.setAttribute('aria-label', `${layer.name}, layer ${layer.layer}/${layer.datatype}`);
      if (layer.polygons) {
        const polygons = document.createElementNS(svgNamespace, 'path');
        polygons.setAttribute('d', layer.polygons);
        polygons.setAttribute('fill', layer.color);
        polygons.setAttribute('fill-opacity', layer.role === 'fill' ? '0.14' : '0.64');
        polygons.setAttribute('fill-rule', 'evenodd');
        polygons.setAttribute('stroke', layer.color);
        polygons.setAttribute('stroke-width', String(Math.max(preview.width, preview.height) / 1600));
        layerGroup.appendChild(polygons);
      }
      for (const stroke of layer.strokes) {
        const path = document.createElementNS(svgNamespace, 'path');
        path.setAttribute('d', stroke.d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', layer.color);
        path.setAttribute('stroke-width', String(stroke.width));
        path.setAttribute('stroke-linecap', 'square');
        path.setAttribute('stroke-linejoin', 'round');
        layerGroup.appendChild(path);
      }
      geometryGroup.appendChild(layerGroup);
    }

    // Analyze measured layout metadata and create approximate, coordinate-based zones.
    const analysis = this.analyzeChipLayout(preview, fileName);
    this.currentGdsAnalysis = analysis;
    this.renderAnalysisDashboard(analysis);
    this.gdsSvgEl.appendChild(geometryGroup);

    // Build the functional grouping overlay in upright SVG space (sibling to geometryGroup)
    const groupingOverlay = this.buildFunctionalGroups(analysis, preview, svgNamespace);
    this.gdsSvgEl.appendChild(groupingOverlay);

    // Default select Section 0 so the Section Inspector displays immediately
    this.selectSection(0);
    this.setFunctionalGroupingVisible(true);

    const notes = [...preview.warnings];
    if (preview.dbuNm !== null && (preview.dbuNm < 0.1 || preview.dbuNm > 100)) {
      notes.push(`The GDS declares an unusual ${preview.dbuNm.toPrecision(4)} nm database unit; geometry is shown in raw database coordinates.`);
    }
    this.gdsStatusEl.textContent = notes.length
      ? notes.join(' ')
      : 'GDS layer geometry is shown as a read-only vector preview. This does not modify the educational raster or provide foundry signoff.';
    return preview;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // analyzeChipLayout
  // Measures die and layer metadata, detects labelled pins, and creates six
  // approximate coordinate-based zones for visual inspection.
  // ─────────────────────────────────────────────────────────────────────────
  analyzeChipLayout(preview, fileName = 'layout.gds') {
    const rawName = preview.topName || preview.libraryName || this.sourceDesign?.name || fileName.replace(/\.[^/.]+$/, '');
    const cleanName = rawName
      .replace(/[_-]+/g, ' ')
      .replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
      .trim();

    // 1. Physical Scale & Die Telemetry
    const dbuNm = (Number.isFinite(preview.dbuNm) && preview.dbuNm > 0 && preview.dbuNm < 1000) ? preview.dbuNm : 10;
    const scaleUm = dbuNm / 1000;
    const { minX, minY, maxX, maxY } = preview.bounds || { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const widthDbu = Math.max(maxX - minX, 1);
    const heightDbu = Math.max(maxY - minY, 1);
    const widthUm = widthDbu * scaleUm;
    const heightUm = heightDbu * scaleUm;
    const dieAreaUm2 = widthUm * heightUm;
    const dieAreaMm2 = dieAreaUm2 / 1e6;
    const aspectRatio = (widthUm / Math.max(heightUm, 0.001)).toFixed(2);

    // 2. Process Node & Architecture Classification
    const isCounter = /counter|cnt|timer|prescaler/i.test(cleanName) || /counter/i.test(fileName);
    const isAlu = /alu|adder|arithmetic|mac|multiplier|subtractor|comp/i.test(cleanName);
    const isCore = /core|cpu|mcu|rv32|riscv|processor|pic/i.test(cleanName);
    const isMemory = /ram|rom|sram|fifo|register\s*file|mem|cache/i.test(cleanName);
    const isFsm = /fsm|ctrl|controller|state/i.test(cleanName);

    let architecture = 'Standard-Cell ASIC Core';
    if (isCounter) architecture = '8-Bit Synchronous Counter';
    else if (isAlu) architecture = 'Arithmetic Logic Unit (ALU)';
    else if (isCore) architecture = 'RISC-V Microprocessor Core';
    else if (isMemory) architecture = 'Embedded SRAM Memory Macro';
    else if (isFsm) architecture = 'Finite State Machine Controller';

    let pdkLabel = 'Educational CMOS Profile';
    if (preview.pdk === 'sky130') pdkLabel = 'SkyWater 130 nm CMOS';
    else if (preview.pdk === 'gf180mcu') pdkLabel = 'GF 180 nm MCU';
    else if (preview.pdk === 'freepdk45') pdkLabel = 'FreePDK 45 nm';
    else if (preview.pdk && preview.pdk !== 'unknown') pdkLabel = `${preview.pdk.toUpperCase()} CMOS`;

    const title = `${cleanName || 'Integrated Circuit'} – Layout Analysis & Functional Grouping`;
    const subtitle = `Physical layout · Approximate visual zones · ${pdkLabel}`;

    // 3. I/O Pin & Port Detection from GDS Text Records
    const detectedInputs = [];
    const detectedOutputs = [];
    const detectedClocks = [];
    const detectedResets = [];
    const detectedPower = [];
    const pinMap = [];

    if (preview.texts && Array.isArray(preview.texts)) {
      const topLabels = new Map();
      for (const text of preview.texts) {
        if (text.instanceId != null || (preview.topName && text.structure && text.structure !== preview.topName)) continue;
        const label = (text.string || '').trim();
        if (!label) continue;
        const point = text.points?.[0] || [minX + widthDbu / 2, maxY];
        const boundaryDistance = Math.min(
          Math.abs(point[0] - minX),
          Math.abs(maxX - point[0]),
          Math.abs(point[1] - minY),
          Math.abs(maxY - point[1])
        );
        const key = label.toLowerCase();
        if (!topLabels.has(key) || boundaryDistance < topLabels.get(key).boundaryDistance) {
          topLabels.set(key, { text, boundaryDistance });
        }
      }

      for (const { text: t } of topLabels.values()) {
        const str = (t.string || '').trim();
        if (!str) continue;
        const pt = t.points?.[0] || [minX + widthDbu / 2, maxY];
        const px = pt[0], py = pt[1];
        const pxUm = (px - minX) * scaleUm;
        const pyUm = (py - minY) * scaleUm;
        const pinObj = { name: str, x: px, y: py, xUm: pxUm.toFixed(2), yUm: pyUm.toFixed(2) };
        pinMap.push(pinObj);

        if (/^(?:clk|clock|gclk|sys_clk)/i.test(str) && !detectedClocks.includes(str)) detectedClocks.push(str);
        else if (/^(?:rst|reset|clr|clear|nrst)/i.test(str) && !detectedResets.includes(str)) detectedResets.push(str);
        else if (/^(?:vdd|vss|gnd|vcc|vdda|vssa)/i.test(str) && !detectedPower.includes(str)) detectedPower.push(str);
        else if ((/^(?:q|out|dout|result|y|sum|cout)(?:[\s_]*\d+|\[\d+\])?$/i.test(str) || (isCounter && /^count\[\d+\]$/i.test(str))) && !detectedOutputs.some((p) => p.name === str)) detectedOutputs.push(pinObj);
        else if ((/^(?:d|in|din|a|b|cin|sel|en|enable|load)(?:[\s_]*\d+|\[\d+\])?$/i.test(str) || (isCounter && /^count_next\[\d+\]$/i.test(str))) && !detectedInputs.some((p) => p.name === str)) detectedInputs.push(pinObj);
      }
    }

    const gdsOutputCount = detectedOutputs.length;
    detectedOutputs.sort((a, b) => a.x - b.x);
    if (!detectedOutputs.length && this.sourceDesign?.simulation?.outputs?.length) {
      for (let i = 0; i < this.sourceDesign.simulation.outputs.length; i++) {
        const out = this.sourceDesign.simulation.outputs[i];
        if (out?.label) {
          const frac = (i + 0.5) / this.sourceDesign.simulation.outputs.length;
          const px = minX + widthDbu * frac;
          const py = maxY;
          detectedOutputs.push({ name: out.label, x: px, y: py, xUm: (widthUm * frac).toFixed(2), yUm: heightUm.toFixed(2) });
        }
      }
    }

    // Fallback pin synthesis matching architecture if no texts found in GDS
    const rawOutputLabels = detectedOutputs.length
      ? detectedOutputs.map((p) => p.name)
      : isCounter
        ? ['Q7', 'Q6', 'Q5', 'Q4', 'Q3', 'Q2', 'Q1', 'Q0']
        : isAlu
          ? ['Y7', 'Y6', 'Y5', 'Y4', 'Y3', 'Y2', 'Y1', 'Y0', 'Cout']
          : isCore
            ? ['DATA_OUT7', 'DATA_OUT6', 'DATA_OUT5', 'DATA_OUT4', 'DATA_OUT3', 'DATA_OUT2', 'DATA_OUT1', 'DATA_OUT0']
            : ['OUT7', 'OUT6', 'OUT5', 'OUT4', 'OUT3', 'OUT2', 'OUT1', 'OUT0'];

    const outputs = rawOutputLabels.map((name, i) => {
      const existing = detectedOutputs.find((p) => p.name === name);
      if (existing) return existing;
      const frac = (i + 0.5) / rawOutputLabels.length;
      const px = minX + widthDbu * frac;
      const py = maxY;
      return {
        name,
        x: px,
        y: py,
        xUm: (widthUm * frac).toFixed(2),
        yUm: heightUm.toFixed(2)
      };
    });
    const counterBits = outputs.map(({ name }) => name.match(/^(?:Q|count)\[?(\d+)\]?$/i))
      .filter(Boolean)
      .map((match) => Number(match[1]));
    const outputRangeLabel = isCounter && counterBits.length
      ? `count[${Math.max(...counterBits)}:${Math.min(...counterBits)}]`
      : outputs.length ? `${outputs[0].name} – ${outputs[outputs.length - 1].name}` : 'Outputs';

    // 4. Layer Stack Inventory
    const activeLayers = (preview.layers || []).map((layer) => ({
      id: layer.id,
      layer: layer.layer,
      datatype: layer.datatype,
      name: layer.name,
      role: layer.role,
      color: layer.color,
      shapes: layer.shapes,
      bounds: layer.bounds
    }));
    const instances = Array.isArray(preview.instances) ? preview.instances : [];
    const instanceEvidence = {
      buffers: { pattern: /(?:^|__)(?:buf|inv)[a-z0-9]*_/i, label: 'buffer / inverter cell-name matches' },
      xor: { pattern: /(?:^|__)(?:xor|xnor|or|nor|mux)[a-z0-9]*_/i, label: 'XOR / XNOR / OR / NOR cell-name matches' },
      and: { pattern: /(?:^|__)(?:and|nand|aoi|oai)[a-z0-9]*_/i, label: 'AND / NAND / AOI / OAI cell-name matches' },
      clock: { pattern: /(?:^|__)(?:clkbuf|clkinv|clkdlybuf)[a-z0-9]*_/i, label: 'clock-buffer cell-name matches' },
      sequential: { pattern: /(?:^|__)(?:df|dff|sdff|sdf|dl|latch|ff)[a-z0-9]*_/i, label: 'sequential-cell name matches' },
      physical: { pattern: /(?:^|__)(?:tap|welltap|decap|filltie|tiehi|tielo)[a-z0-9]*(?:_|$)/i, label: 'tap / decap / tie-cell name matches' }
    };
    for (const evidence of Object.values(instanceEvidence)) {
      evidence.count = 0;
      evidence.placedCount = 0;
      evidence.bounds = null;
      evidence.boxes = [];
      for (const instance of instances) {
        if (!evidence.pattern.test(instance.name || '')) continue;
        evidence.count += 1;
        const box = instance.box;
        if (!box || ![box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite)) continue;
        const left = Math.max(minX, box.minX);
        const bottom = Math.max(minY, box.minY);
        const right = Math.min(maxX, box.maxX);
        const top = Math.min(maxY, box.maxY);
        if (right <= left || top <= bottom) continue;
        evidence.placedCount += 1;
        evidence.boxes.push({ minX: left, minY: bottom, maxX: right, maxY: top, name: instance.name });
        if (!evidence.bounds) evidence.bounds = { minX: left, minY: bottom, maxX: right, maxY: top };
        else {
          evidence.bounds.minX = Math.min(evidence.bounds.minX, left);
          evidence.bounds.minY = Math.min(evidence.bounds.minY, bottom);
          evidence.bounds.maxX = Math.max(evidence.bounds.maxX, right);
          evidence.bounds.maxY = Math.max(evidence.bounds.maxY, top);
        }
      }
      instanceEvidence.xor.xorCount = instances.filter(({ name }) => /(?:^|__)(?:xor|xnor)[a-z0-9]*_/i.test(name || '')).length;
    }
    const sequentialInstanceCount = instanceEvidence.sequential.count;

    // 5. Coordinate-based visual zones. These do not imply netlist connectivity.
    // The labels mirror the counter-analysis view used by the Mask Lab UI:
    // 1: Output Buffer, 2: Next-State Logic, 3: Carry Logic,
    // 4: Clock Distribution, 5: Sequential Storage, 6: Power/Ground Rails.
    const partitionSpecs = [
      {
        id: 'sec-1-output-buffer',
        number: 1,
        name: 'Output Buffer',
        sub: outputRangeLabel,
        color: '#168bff',
        evidence: instanceEvidence.buffers,
        // Top boundary where output routing and buffer drivers reside
        yMinFrac: 0.882,
        yMaxFrac: 1.0,
        xMinFrac: 0.0,
        xMaxFrac: 0.94,
        definition: 'A visually selected upper die zone associated with output routing in this illustration. Buffer cells and pad connectivity are not verified from layer polygons.',
        bullets: [
          'Output labels are shown when found in GDS text records',
          'Arrow positions may be illustrative when pins are not labelled',
          'Electrical drive strength and ESD behavior are not analyzed'
        ]
      },
      {
        id: 'sec-2-next-state-logic',
        number: 2,
        name: isAlu ? 'Function Select / ALU Logic' : 'Next-State Logic',
        sub: isCounter && instanceEvidence.xor.count
          ? instanceEvidence.xor.xorCount
            ? `${instanceEvidence.xor.xorCount} XOR / XNOR matches`
            : `${instanceEvidence.xor.count} OR / NOR matches · no XOR cells`
          : isAlu ? 'Mux / Opcode Matrix' : isCounter ? 'No named XOR cells · candidate zone' : 'Combinational Logic Cloud',
        color: '#00d878',
        evidence: instanceEvidence.xor,
        yMinFrac: 0.727,
        yMaxFrac: 0.882,
        xMinFrac: 0.005,
        xMaxFrac: 0.92,
        definition: isCounter
          ? 'Candidate combinational region. XOR and toggle logic is a typical counter implementation, but connectivity is not extracted from this visual grouping.'
          : isAlu
            ? 'Candidate arithmetic or function-select region based on the design name; operations and cell connectivity are not verified.'
            : 'Candidate combinational-logic region based on die position; exact Boolean function requires a netlist or source design.',
        bullets: [
          'Visual region only; no nets are traced',
          'Logic function requires netlist or source verification',
          'Delay and race behavior are not analyzed'
        ]
      },
      {
        id: 'sec-3-carry-logic',
        number: 3,
        name: isAlu ? 'Fast Carry Lookahead / Adder' : 'Carry / Boolean Logic',
        sub: isAlu ? 'CLA candidate · connectivity not traced' : 'AND / NAND / AOI / OAI candidates',
        color: '#ffad16',
        evidence: instanceEvidence.and,
        yMinFrac: 0.582,
        yMaxFrac: 0.727,
        xMinFrac: 0.0,
        xMaxFrac: 0.92,
        hasPartitions: true,
        definition: 'Candidate carry/AND-NAND region shown for a counter-style layout. Gate type and signal function cannot be confirmed from this overlay.',
        bullets: [
          'Placement is a visual heuristic',
          'No carry chain is traced',
          'Timing and gate topology are not analyzed'
        ]
      },
      {
        id: 'sec-4-clock-distribution',
        number: 4,
        name: 'Clock Distribution',
        sub: 'CTS Tree & Buffers',
        color: '#ff3154',
        evidence: instanceEvidence.clock,
        yMinFrac: 0.484,
        yMaxFrac: 0.582,
        xMinFrac: 0.015,
        xMaxFrac: 0.92,
        definition: 'Candidate clock-routing corridor selected by position. Clock labels may be detected, but this preview does not trace a clock tree or calculate skew.',
        bullets: [
          'Clock text labels are listed when present',
          'Clock connectivity is not traced',
          'Skew and transition times are not calculated'
        ]
      },
      {
        id: 'sec-5-sequential-storage',
        number: 5,
        name: isMemory ? 'SRAM Storage Bitcells' : 'D Flip-Flops',
        sub: sequentialInstanceCount
          ? `${sequentialInstanceCount} detected sequential cells`
          : isCounter ? `${outputs.length} inferred state bits` : 'Sequential cells not identified',
        color: '#ae32ff',
        evidence: instanceEvidence.sequential,
        yMinFrac: 0.199,
        yMaxFrac: 0.484,
        xMinFrac: 0.0,
        xMaxFrac: 1.0,
        isMultiTier: true,
        definition: sequentialInstanceCount
          ? `${sequentialInstanceCount} placed cell instance names match common sequential-cell patterns. Their exact function and connectivity still require library and netlist verification.`
          : 'Candidate storage region selected by position. Sequential cells are not identified unless their instance names are available in the imported layout.',
        bullets: [
          sequentialInstanceCount ? `${sequentialInstanceCount} likely sequential instances by name` : 'No sequential cell instances identified',
          'State width is not inferred from region size',
          'Reset behavior requires netlist or source verification'
        ]
      },
      {
        id: 'sec-6-power-ground-rails',
        number: 6,
        name: 'Power / Tie Cells',
        sub: 'VDD / GND Tie-Cell Candidates',
        color: '#00dce7',
        evidence: instanceEvidence.physical,
        yMinFrac: 0.0,
        yMaxFrac: 0.199,
        xMinFrac: 0.015,
        xMaxFrac: 0.985,
        hasSteppedTab: true,
        definition: 'Candidate lower die zone often used for power routing. Rail continuity, well taps, and supply integrity are not determined by the visual overlay.',
        bullets: [
          'Power labels are listed when present',
          'No power-net connectivity is traced',
          'IR drop, latch-up, and decoupling are not analyzed'
        ]
      }
    ];

    // These are visual zones over the die, not functional regions proven by a netlist.
    const groups = partitionSpecs.map((spec) => {
      const sourceBounds = spec.evidence.bounds;
      const secMinX = sourceBounds ? sourceBounds.minX : minX + widthDbu * spec.xMinFrac;
      const secMaxX = sourceBounds ? sourceBounds.maxX : minX + widthDbu * spec.xMaxFrac;
      const secMinY = sourceBounds ? sourceBounds.minY : minY + heightDbu * spec.yMinFrac;
      const secMaxY = sourceBounds ? sourceBounds.maxY : minY + heightDbu * spec.yMaxFrac;
      const secWidthDbu = secMaxX - secMinX;
      const secHeightDbu = secMaxY - secMinY;

      const secWidthUm = secWidthDbu * scaleUm;
      const secHeightUm = secHeightDbu * scaleUm;
      const secAreaUm2 = secWidthUm * secHeightUm;
      const percentArea = ((secAreaUm2 / Math.max(dieAreaUm2, 0.001)) * 100).toFixed(1);
      const instanceBoxes = spec.evidence.boxes;
      const focusBox = instanceBoxes.length
        ? instanceBoxes.reduce((nearest, box) => {
          const centerX = (box.minX + box.maxX) / 2;
          const centerY = (box.minY + box.maxY) / 2;
          const distance = Math.hypot(centerX - (secMinX + secMaxX) / 2, centerY - (secMinY + secMaxY) / 2);
          return !nearest || distance < nearest.distance ? { box, distance } : nearest;
        }, null).box
        : null;
      const secLayers = [];
      for (const l of activeLayers) {
        if (!l.bounds) continue;
        const overlaps = !(
          l.bounds.maxX < secMinX ||
          l.bounds.minX > secMaxX ||
          l.bounds.maxY < secMinY ||
          l.bounds.minY > secMaxY
        );
        if (overlaps) {
          secLayers.push({ name: l.name, role: l.role, color: l.color });
        }
      }

      return {
        ...spec,
        bounds: { minX: secMinX, maxX: secMaxX, minY: secMinY, maxY: secMaxY },
        boundsUm: {
          minX: ((secMinX - minX) * scaleUm).toFixed(2),
          maxX: ((secMaxX - minX) * scaleUm).toFixed(2),
          minY: ((secMinY - minY) * scaleUm).toFixed(2),
          maxY: ((secMaxY - minY) * scaleUm).toFixed(2),
          width: secWidthUm.toFixed(2),
          height: secHeightUm.toFixed(2),
          area: secAreaUm2.toFixed(1)
        },
        percentArea,
        layers: secLayers,
        instanceCount: spec.evidence.count,
        placedInstanceCount: spec.evidence.placedCount,
        instanceBoxes,
        focus: focusBox ? {
          x: (focusBox.minX + focusBox.maxX) / 2,
          y: (focusBox.minY + focusBox.maxY) / 2
        } : null,
        calloutY: minY + heightDbu * (spec.yMinFrac + spec.yMaxFrac) / 2,
        evidenceLabel: spec.evidence.label,
        boundsSource: sourceBounds ? 'placed-cell bounds' : 'coordinate guide'
      };
    });

    // 6. Engineering Verification & Telemetry Notes
    const notes = [
      `Design: ${cleanName} · Architecture: ${architecture}.`,
      `Technology: ${pdkLabel} · Grid: ${dbuNm.toFixed(1)} nm/dbu (${scaleUm.toFixed(3)} µm/unit).`,
      `Die Dimensions: ${widthUm.toFixed(1)} µm × ${heightUm.toFixed(1)} µm (Aspect Ratio ${aspectRatio}, Area ${dieAreaUm2.toFixed(1)} µm² / ${dieAreaMm2.toFixed(4)} mm²).`,
      `Layer Count: ${activeLayers.length} active layers · Rendered Shapes: ${preview.renderedShapes.toLocaleString()} (${(preview.renderedShapes / dieAreaUm2).toFixed(2)} shapes/µm²).`,
      detectedClocks.length ? `Clock labels: ${detectedClocks.join(', ')}.` : 'No clock label was identified in GDS text.',
      detectedPower.length ? `Power labels: ${detectedPower.join(', ')}.` : 'No power label was identified in GDS text.',
      'Colored regions are visual layout zones based on die coordinates; they are not extracted functional blocks.',
      'Cell-name matches can identify candidate cell types and placement bounds, but cannot prove their functional role or signal connectivity.',
      gdsOutputCount ? 'Output labels are read from GDS text records.' : 'Output labels and their evenly spaced arrow positions are illustrative, not detected pin locations.'
    ];

    return {
      title,
      subtitle,
      cleanName,
      architecture,
      pdkLabel,
      dbuNm,
      scaleUm,
      isCounter,
      isAlu,
      isCore,
      isMemory,
      widthUm,
      heightUm,
      dieAreaUm2,
      dieAreaMm2,
      aspectRatio,
      totalShapes: preview.renderedShapes,
      outputs,
      outputsInferred: gdsOutputCount === 0,
      detectedInputs,
      detectedClocks,
      detectedResets,
      detectedPower,
      activeLayers,
      groups,
      notes
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // selectSection
  // Highlights the selected functional section across the SVG canvas and
  // bottom dashboard, and dynamically populates the Section Inspector panel
  // with all physical properties, dimensions, layer metrics, and definitions.
  // ─────────────────────────────────────────────────────────────────────────
  selectSection(index) {
    if (!this.currentGdsAnalysis || !this.currentGdsAnalysis.groups) return;
    const groups = this.currentGdsAnalysis.groups;
    const selectedIndex = Number.isInteger(index) && index >= 0 && index < groups.length ? index : 0;
    const sec = groups[selectedIndex];
    if (!sec) return;
    this.selectedSectionIndex = selectedIndex;

    if (this.gdsSvgEl) {
      this.gdsSvgEl.querySelectorAll('.mask-gds-section-group').forEach((el) => {
        const idx = Number(el.dataset.sectionIndex);
        const active = idx === selectedIndex;
        el.classList.toggle('is-active', active);
        el.setAttribute('aria-pressed', String(active));
      });
    }

    if (this.gdsViewerEl) {
      this.gdsViewerEl.querySelectorAll('[data-section-card], [data-nav-item]').forEach((item) => {
        const attr = item.hasAttribute('data-section-card') ? 'sectionCard' : 'navItem';
        const active = Number(item.dataset[attr]) === selectedIndex;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
    }

    const inspectorEl = this.gdsViewerEl?.querySelector('[data-mask-section-inspector]');
    const inspectorBody = inspectorEl?.querySelector('[data-mask-section-inspector-body]');
    if (!inspectorBody) return;
    inspectorEl.querySelector('.mask-inspector-empty').hidden = true;
    inspectorBody.hidden = false;
    inspectorBody.style.setProperty('--sec-color', sec.color);
    inspectorBody.querySelector('.inspector-badge').textContent = String(sec.number);
    inspectorBody.querySelector('[data-inspector-title]').textContent = sec.name;
    inspectorBody.querySelector('[data-inspector-sub]').textContent = sec.sub || '';
    inspectorBody.querySelector('[data-inspector-definition]').textContent = sec.definition;
    inspectorBody.querySelector('[data-inspector-props]').innerHTML = `
      <div class="prop-row"><span>Zone bounds</span><strong>[${sec.boundsUm.minX}, ${sec.boundsUm.minY}] → [${sec.boundsUm.maxX}, ${sec.boundsUm.maxY}] µm</strong></div>
      <div class="prop-row"><span>Zone size</span><strong>${sec.boundsUm.width} µm × ${sec.boundsUm.height} µm</strong></div>
      <div class="prop-row"><span>Bounding extent</span><strong>${sec.boundsUm.area} µm² (${sec.percentArea}% of die)</strong></div>
      <div class="prop-row"><span>Cell-name matches</span><strong>${sec.instanceCount}</strong></div>
      <div class="prop-row"><span>Located cell bounds</span><strong>${sec.placedInstanceCount}</strong></div>
      <div class="prop-row"><span>Zone basis</span><strong>${escapeHTML(sec.boundsSource)}</strong></div>
      ${sec.instanceBoxes.length ? '<div class="prop-row"><span>Display</span><strong>Separate placed-cell boxes</strong></div>' : ''}
    `;
    inspectorBody.querySelector('[data-inspector-layers]').innerHTML = (sec.layers.length
      ? sec.layers.map((layer) => `<span class="layer-pill" style="border-left-color:${layer.color}">${escapeHTML(layer.name)}</span>`).join('')
      : '<span>No layer bounds available</span>');
    inspectorBody.querySelector('[data-inspector-bullets]').innerHTML = sec.bullets
      .map((bullet) => `<li>${escapeHTML(bullet)}</li>`).join('');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // renderAnalysisDashboard
  // Dynamically injects the analyzed chip data into the HTML header,
  // telemetry strip, right sidebar (Inspector, Legend, Pins) and bottom cards.
  // ─────────────────────────────────────────────────────────────────────────
  renderAnalysisDashboard(analysis) {
    if (!analysis || !this.gdsViewerEl) return;

    // 1. Update Chip Meta Header
    const metaEl = this.gdsViewerEl.querySelector('[data-mask-gds-chip-meta]');
    if (metaEl) {
      metaEl.innerHTML = `
        <span class="meta-chip">Chip: ${escapeHTML(analysis.cleanName)}</span>
        <span class="meta-arch">Arch: ${escapeHTML(analysis.architecture)}</span>
        <span class="meta-pdk">PDK: ${escapeHTML(analysis.pdkLabel)}</span>
      `;
    }

    // 2. Update Title Header & Live Telemetry Strip
    const headerEl = this.gdsViewerEl.querySelector('[data-mask-gds-analysis-header]');
    if (headerEl) {
      headerEl.innerHTML = `
        <div class="mask-gds-analysis-title-group">
          <h2 class="mask-gds-analysis-title" data-mask-gds-analysis-title>${escapeHTML(analysis.title)}</h2>
          <span class="mask-gds-analysis-subtitle" data-mask-gds-analysis-subtitle>${escapeHTML(analysis.subtitle)}</span>
        </div>
        <div class="mask-chip-telemetry" data-mask-chip-telemetry>
          <div class="telemetry-pill">
            <span class="pill-label">ARCHITECTURE</span>
            <strong>${escapeHTML(analysis.architecture)}</strong>
          </div>
          <div class="telemetry-pill">
            <span class="pill-label">PROCESS NODE</span>
            <strong>${escapeHTML(analysis.pdkLabel)}</strong>
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
      `;
    }

    // 3. Update Section Navigator (left panel)
    const navigatorList = this.gdsViewerEl.querySelector('[data-mask-section-list]');
    const sectionCountEl = this.gdsViewerEl.querySelector('[data-mask-section-count]');
    if (navigatorList && analysis.groups) {
      navigatorList.innerHTML = analysis.groups.map((g, idx) => `
        <button type="button" class="navigator-item" data-nav-item="${idx}" aria-pressed="false" style="--sec-color: ${g.color};">
          <span class="nav-color-dot" style="background: ${g.color};"></span>
          <div class="nav-info">
            <strong>${g.number}. ${escapeHTML(g.name)}</strong>
            <small>${escapeHTML(g.sub || '')}</small>
          </div>
          <span class="nav-area">${g.instanceCount ? `${g.placedInstanceCount}/${g.instanceCount} cells` : 'guide zone'}</span>
        </button>
      `).join('');
      navigatorList.querySelectorAll('[data-nav-item]').forEach((el) => {
        const idx = Number(el.dataset.navItem);
        el.addEventListener('click', () => this.selectSection(idx));
        el.addEventListener('pointerenter', () => this.selectSection(idx));
      });
    }
    if (sectionCountEl && analysis.groups) {
      sectionCountEl.textContent = `${analysis.groups.length} sections`;
    }

    // 2. Update Sidebar (Layer Legend & Output Pins)
    const sidebarEl = this.gdsViewerEl.querySelector('[data-mask-gds-analysis-sidebar]');
    if (sidebarEl) {
      const legendItems = analysis.activeLayers.map((l) => `
        <li>
          <span class="swatch" style="background:${escapeHTML(l.color)};"></span>
          <span class="label">
            <strong>${escapeHTML(l.name)}</strong>
            <small>${escapeHTML(l.role || 'unknown')} · ${l.shapes.toLocaleString()} shapes</small>
          </span>
        </li>
      `).join('');

      const outputItems = analysis.outputs.map((out) => {
        const bitMatch = out.name.match(/^(?:Q|count)\[?(\d+)\]?$/i);
        const bitIndex = bitMatch ? Number(bitMatch[1]) : null;
        const isMsb = analysis.isCounter && bitIndex !== null && bitIndex === Math.max(...analysis.outputs.map(({ name }) => Number(name.match(/(?:Q|count)\[?(\d+)\]?/i)?.[1] || 0)));
        const isLsb = analysis.isCounter && bitIndex === 0;
        return `
          <span class="output-item ${isMsb ? 'msb' : ''} ${isLsb ? 'lsb' : ''}">
            <strong>${escapeHTML(out.name)}</strong>
            <small>${isMsb ? '(MSB)' : isLsb ? '(LSB)' : `${escapeHTML(out.xUm)} µm`}</small>
          </span>
        `;
      }).join('');

      sidebarEl.querySelector('.mask-layer-legend-panel h3').textContent = `Layer Legend (${analysis.activeLayers.length} Layers)`;
      sidebarEl.querySelector('.mask-layer-legend-list').innerHTML = legendItems;
      sidebarEl.querySelector('.mask-outputs-panel h3').textContent = analysis.isCounter ? '8-Bit Counter Outputs' : 'Detected Outputs';
      sidebarEl.querySelector('.mask-outputs-items').innerHTML = outputItems || '<span class="output-item">No output labels found</span>';
    }

    // 3. Update Bottom Dashboard (Functional Blocks, Schematic, Notes)
    const dashboardEl = this.gdsViewerEl.querySelector('[data-mask-gds-analysis-dashboard]');
    if (dashboardEl) {
      const blocksHtml = analysis.groups.map((g, idx) => `
        <button type="button" class="mask-section-card" data-section-card="${idx}" aria-pressed="false" style="--block-color: ${g.color};">
          <div class="section-card-header">
            <span class="card-badge">${g.number}</span>
            <div class="card-title-group">
              <strong>${escapeHTML(g.name)}</strong>
              ${g.sub ? `<small class="card-sub">${escapeHTML(g.sub)}</small>` : ''}
            </div>
          </div>
          <div class="section-card-meta">
            <span class="meta-tag">Bounding extent: ${g.boundsUm.area} µm² (${g.percentArea}% of die)</span>
            <span class="meta-tag">${g.instanceCount ? `${g.placedInstanceCount} placed-cell bounds · ${escapeHTML(g.evidenceLabel)}` : `No cell match · ${escapeHTML(g.boundsSource)}`}</span>
          </div>
          <p class="section-card-definition">${escapeHTML(g.definition)}</p>
          <ul class="section-card-bullets">
            ${g.bullets.map((b) => `<li>${escapeHTML(b)}</li>`).join('')}
          </ul>
        </button>
      `).join('');

      const schematicSvg = this.buildArchitectureDiagramSvg(analysis);
      dashboardEl.querySelector('.mask-section-cards-grid').innerHTML = blocksHtml;
      dashboardEl.querySelector('.mask-functional-section-cards .card-title-bar h3').textContent = `Functional Blocks (${analysis.cleanName})`;
      dashboardEl.querySelector('.mask-logic-diagram-card .card-title-bar h3').textContent = `Simplified ${analysis.architecture} Logic Diagram`;
      dashboardEl.querySelector('.mask-logic-diagram-card .card-title-bar small').textContent = 'Illustrative dataflow · not extracted from connectivity';
      dashboardEl.querySelector('.mask-notes-card .card-title-bar h3').textContent = 'Notes & Limitations';
      dashboardEl.querySelector('.mask-notes-card .card-title-bar small').textContent = 'GDS preview · not foundry signoff';
      dashboardEl.querySelector('.mask-diagram-wrapper').innerHTML = schematicSvg;
      dashboardEl.querySelector('[data-mask-analysis-notes]').innerHTML = analysis.notes
        .map((note) => `<li>${escapeHTML(note)}</li>`).join('');

      dashboardEl.querySelectorAll('[data-section-card]').forEach((card) => {
        const idx = Number(card.dataset.sectionCard);
        card.addEventListener('click', () => this.selectSection(idx));
        card.addEventListener('pointerenter', () => this.selectSection(idx));
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // buildArchitectureDiagramSvg
  // Generates a responsive vector schematic matching the detected architecture
  // (Counter, ALU, Processor Core, Memory Macro, or Standard-Cell ASIC).
  // ─────────────────────────────────────────────────────────────────────────
  buildArchitectureDiagramSvg(analysis) {
    if (analysis.isAlu) {
      return `
        <svg class="mask-schematic-svg" viewBox="0 0 460 170" preserveAspectRatio="xMidYMid meet">
          <rect x="20" y="20" width="80" height="34" rx="4" fill="#0d233e" stroke="#168bff" stroke-width="1.6" />
          <text x="60" y="37" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="central">Operand A [7:0]</text>
          <rect x="20" y="70" width="80" height="34" rx="4" fill="#0d233e" stroke="#168bff" stroke-width="1.6" />
          <text x="60" y="87" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="central">Operand B [7:0]</text>
          <rect x="140" y="10" width="130" height="110" rx="6" fill="#142c16" stroke="#00d878" stroke-width="1.8" />
          <text x="205" y="45" fill="#ffffff" font-size="11" font-weight="700" text-anchor="middle">ALU Core Matrix</text>
          <text x="205" y="65" fill="#a0eec0" font-size="9" text-anchor="middle">Fast Carry Lookahead (CLA)</text>
          <text x="205" y="82" fill="#a0eec0" font-size="9" text-anchor="middle">ADD / SUB / AND / OR / XOR</text>
          <line x1="100" y1="37" x2="140" y2="37" stroke="#168bff" stroke-width="1.6" />
          <line x1="100" y1="87" x2="140" y2="87" stroke="#168bff" stroke-width="1.6" />
          <line x1="270" y1="65" x2="310" y2="65" stroke="#ffad16" stroke-width="1.8" />
          <rect x="310" y="35" width="110" height="60" rx="4" fill="#2d1a45" stroke="#ae32ff" stroke-width="1.6" />
          <text x="365" y="58" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle">Output Accumulator</text>
          <text x="365" y="75" fill="#dfb3ff" font-size="9" text-anchor="middle">Result Y [7:0] &amp; Flags</text>
          <line x1="205" y1="145" x2="205" y2="120" stroke="#ff3154" stroke-width="1.4" />
          <text x="205" y="156" fill="#ff7a8e" font-size="9" font-weight="600" text-anchor="middle">CLK &amp; Opcode [3:0]</text>
        </svg>
      `;
    }

    if (analysis.isCore) {
      return `
        <svg class="mask-schematic-svg" viewBox="0 0 460 170" preserveAspectRatio="xMidYMid meet">
          <rect x="15" y="30" width="85" height="50" rx="4" fill="#0d233e" stroke="#168bff" stroke-width="1.6" />
          <text x="57" y="50" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle">IF / ID</text>
          <text x="57" y="65" fill="#8aafc8" font-size="8.5" text-anchor="middle">Fetch &amp; Decode</text>
          <line x1="100" y1="55" x2="125" y2="55" stroke="#168bff" stroke-width="1.6" />
          <rect x="125" y="20" width="95" height="70" rx="4" fill="#2d1a45" stroke="#ae32ff" stroke-width="1.6" />
          <text x="172" y="48" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle">Register File</text>
          <text x="172" y="64" fill="#dfb3ff" font-size="8.5" text-anchor="middle">32-bit (X0 – X31)</text>
          <line x1="220" y1="55" x2="245" y2="55" stroke="#ae32ff" stroke-width="1.6" />
          <rect x="245" y="25" width="90" height="60" rx="4" fill="#142c16" stroke="#00d878" stroke-width="1.6" />
          <text x="290" y="50" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle">EX / ALU</text>
          <text x="290" y="66" fill="#a0eec0" font-size="8.5" text-anchor="middle">Branch &amp; Execute</text>
          <line x1="335" y1="55" x2="360" y2="55" stroke="#00d878" stroke-width="1.6" />
          <rect x="360" y="30" width="85" height="50" rx="4" fill="#0d233e" stroke="#168bff" stroke-width="1.6" />
          <text x="402" y="50" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle">MEM / WB</text>
          <text x="402" y="65" fill="#8aafc8" font-size="8.5" text-anchor="middle">Memory Bus</text>
          <line x1="20" y1="125" x2="430" y2="125" stroke="#ff3154" stroke-width="1.4" />
          <text x="225" y="142" fill="#ff7a8e" font-size="9" font-weight="600" text-anchor="middle">Global Clock Tree (CTS) &amp; Reset Spine</text>
        </svg>
      `;
    }

    // Default: Synchronous Counter / State Machine architecture diagram
    const numOutputs = Math.min(8, Math.max(4, analysis.outputs.length));
    const step = 328 / numOutputs;
    const schematicOutputs = analysis.isCounter
      ? [...analysis.outputs].sort((a, b) => {
        const bitA = Number(a.name.match(/(?:Q|count)\[?(\d+)\]?/i)?.[1] || 0);
        const bitB = Number(b.name.match(/(?:Q|count)\[?(\d+)\]?/i)?.[1] || 0);
        return bitB - bitA;
      })
      : analysis.outputs;
    const ffBlocksHtml = Array.from({ length: numOutputs }, (_, idx) => {
      const x = 64 + idx * step;
      const bitName = schematicOutputs[idx]?.name || `Q${numOutputs - 1 - idx}`;
      const ffName = `FF${numOutputs - 1 - idx}`;
      return `
        <line x1="${x + step / 2}" y1="62" x2="${x + step / 2}" y2="78" stroke="#168bff" stroke-width="1.3" />
        <rect x="${x + step * 0.1}" y="78" width="${step * 0.8}" height="48" rx="3" fill="#0d233e" stroke="#168bff" stroke-width="1.5" />
        <text x="${x + step / 2}" y="88" fill="#8aafc8" font-size="8" font-weight="600" text-anchor="middle">D</text>
        <text x="${x + step / 2}" y="103" fill="#ffffff" font-size="8.5" font-weight="700" text-anchor="middle">${ffName}</text>
        <text x="${x + step / 2}" y="118" fill="#8aafc8" font-size="8" font-weight="600" text-anchor="middle">Q</text>
        <line x1="${x + step / 2}" y1="126" x2="${x + step / 2}" y2="142" stroke="#168bff" stroke-width="1.3" />
        <text x="${x + step / 2}" y="154" fill="#c8ddf0" font-size="9" font-weight="700" text-anchor="middle">${escapeHTML(bitName)}</text>
      `;
    }).join('');

    return `
      <svg class="mask-schematic-svg" viewBox="0 0 460 170" preserveAspectRatio="xMidYMid meet">
        <rect x="130" y="8" width="200" height="20" rx="4" fill="#593200" stroke="#ffad16" stroke-width="1.8" />
        <text x="230" y="22" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="central">Carry Logic (AND / Lookahead)</text>

        <rect x="60" y="42" width="340" height="20" rx="4" fill="#0d3663" stroke="#168bff" stroke-width="1.8" />
        <text x="230" y="56" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="central">Next-State Logic (XOR Steering)</text>

        <line x1="160" y1="28" x2="160" y2="42" stroke="#ffad16" stroke-width="1.4" />
        <line x1="230" y1="28" x2="230" y2="42" stroke="#ffad16" stroke-width="1.4" />
        <line x1="300" y1="28" x2="300" y2="42" stroke="#ffad16" stroke-width="1.4" />

        <text x="12" y="94" fill="#8aafc8" font-size="9" font-weight="700" dominant-baseline="central">CLK</text>
        <line x1="36" y1="94" x2="395" y2="94" stroke="#ff3154" stroke-width="1.4" />

        <text x="12" y="112" fill="#8aafc8" font-size="9" font-weight="700" dominant-baseline="central">RST</text>
        <line x1="36" y1="112" x2="395" y2="112" stroke="#8aafc8" stroke-width="1.2" />

        ${ffBlocksHtml}

        <line x1="80" y1="142" x2="398" y2="142" stroke="#168bff" stroke-width="1.5" />
        <line x1="398" y1="142" x2="415" y2="142" stroke="#168bff" stroke-width="1.8" />
        <polygon points="420,142 413,138 413,146" fill="#168bff" />
        <text x="424" y="137" fill="#c8ddf0" font-size="8" font-weight="600">${analysis.outputs.length}-bit</text>
        <text x="424" y="147" fill="#c8ddf0" font-size="8" font-weight="600">Output</text>
      </svg>
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // buildFunctionalGroups
  // Constructs the complete SVG grouping overlay in upright SVG user space:
  // - Zone boxes mapped into physical layout coordinates
  // - Left callout badges with angled vector pointer lines straight to section edges
  // - Top output pin indicator arrows placed at real pin coordinates
  // - Bottom-right coordinate axes (X right, Y up)
  // - Interactive hover and click handlers that trigger selectSection()
  // ─────────────────────────────────────────────────────────────────────────
  buildFunctionalGroups(analysis, preview, svgNamespace) {
    const { bounds } = preview;
    const svgW = Math.max(preview.width, 1);
    const svgH = Math.max(preview.height, 1);
    const minX = bounds.minX;
    const maxX = bounds.maxX;
    const minY = bounds.minY;
    const maxY = bounds.maxY;

    const maxDim = Math.max(svgW, svgH);
    const strokeW = maxDim / 540;
    const fontSize = maxDim / 38;
    const subFontSize = fontSize * 0.72;

    const regions = document.createElementNS(svgNamespace, 'g');
    regions.dataset.gdsFunctionalGroups = '';
    regions.setAttribute('aria-label', 'Functional grouping overlay');

    const rowSpecs = analysis.groups;

    // ── 1. Draw Functional Layout Regions on the Chip ────────────────────────
    // Note: In native SVG space, Y increases downwards, so a GDS box [minY, maxY]
    // is rendered with top at -maxY and height = maxY - minY.
    rowSpecs.forEach((spec, idx) => {
      const groupEl = document.createElementNS(svgNamespace, 'g');
      groupEl.setAttribute('class', 'mask-gds-section-group');
      groupEl.dataset.sectionIndex = String(idx);
      groupEl.style.setProperty('--sec-color', spec.color);
      groupEl.setAttribute('role', 'button');
      groupEl.setAttribute('tabindex', '0');
      groupEl.setAttribute('aria-label', `Select section ${spec.number}: ${spec.name}`);

      const secMinX = spec.bounds.minX;
      const secMaxX = spec.bounds.maxX;
      const secMinY = spec.bounds.minY;
      const secMaxY = spec.bounds.maxY;
      const rw = Math.max(secMaxX - secMinX, 1);
      const rh = Math.max(secMaxY - secMinY, 1);
      const rx = secMinX;
      const ry = -secMaxY;
      const targetX = spec.focus?.x ?? rx;
      const targetSvgY = spec.focus ? -spec.focus.y : ry + rh / 2;

      if (spec.instanceBoxes?.length) {
        spec.instanceBoxes.forEach((box) => {
          const cellRect = document.createElementNS(svgNamespace, 'rect');
          cellRect.setAttribute('class', 'mask-gds-section-rect mask-gds-instance-box');
          cellRect.setAttribute('x', String(box.minX));
          cellRect.setAttribute('y', String(-box.maxY));
          cellRect.setAttribute('width', String(Math.max(box.maxX - box.minX, 1)));
          cellRect.setAttribute('height', String(Math.max(box.maxY - box.minY, 1)));
          cellRect.setAttribute('fill', spec.color);
          cellRect.setAttribute('fill-opacity', '0.18');
          cellRect.setAttribute('stroke', spec.color);
          cellRect.setAttribute('stroke-width', String(strokeW * 0.9));
          cellRect.setAttribute('rx', String(strokeW * 0.55));
          cellRect.setAttribute('aria-hidden', 'true');
          groupEl.appendChild(cellRect);
        });
      } else if (spec.isMultiTier) {
        const tierH = rh / 3;
        const tiers = [
          { yOff: 0, xOff: 0.0, w: 1.0 },
          { yOff: tierH, xOff: 0.075, w: 0.925 },
          { yOff: tierH * 2, xOff: 0.01, w: 0.99 }
        ];
        tiers.forEach((tier) => {
          const tierRect = document.createElementNS(svgNamespace, 'rect');
          tierRect.setAttribute('class', 'mask-gds-section-rect');
          tierRect.setAttribute('x', String(rx + rw * tier.xOff));
          tierRect.setAttribute('y', String(ry + tier.yOff));
          tierRect.setAttribute('width', String(rw * tier.w));
          tierRect.setAttribute('height', String(tierH));
          tierRect.setAttribute('fill', spec.color);
          tierRect.setAttribute('fill-opacity', '0.12');
          tierRect.setAttribute('stroke', spec.color);
          tierRect.setAttribute('stroke-width', String(strokeW * 1.5));
          tierRect.setAttribute('rx', String(strokeW * 2));
          groupEl.appendChild(tierRect);
        });
      } else if (spec.hasSteppedTab && spec.boundsSource !== 'placed-cell bounds') {
        const mainH = rh * 0.78;
        const mainRect = document.createElementNS(svgNamespace, 'rect');
        mainRect.setAttribute('class', 'mask-gds-section-rect');
        mainRect.setAttribute('x', String(rx));
        mainRect.setAttribute('y', String(ry));
        mainRect.setAttribute('width', String(rw));
        mainRect.setAttribute('height', String(mainH));
        mainRect.setAttribute('fill', spec.color);
        mainRect.setAttribute('fill-opacity', '0.12');
        mainRect.setAttribute('stroke', spec.color);
        mainRect.setAttribute('stroke-width', String(strokeW * 1.5));
        mainRect.setAttribute('rx', String(strokeW * 2));
        groupEl.appendChild(mainRect);

        const tabX = rx + rw * 0.65;
        const tabY = ry + mainH;
        const tabW = rw * 0.24;
        const tabH = rh * 0.22;
        const tabRect = document.createElementNS(svgNamespace, 'rect');
        tabRect.setAttribute('class', 'mask-gds-section-rect');
        tabRect.setAttribute('x', String(tabX));
        tabRect.setAttribute('y', String(tabY));
        tabRect.setAttribute('width', String(tabW));
        tabRect.setAttribute('height', String(tabH));
        tabRect.setAttribute('fill', spec.color);
        tabRect.setAttribute('fill-opacity', '0.14');
        tabRect.setAttribute('stroke', spec.color);
        tabRect.setAttribute('stroke-width', String(strokeW * 1.4));
        tabRect.setAttribute('rx', String(strokeW));
        groupEl.appendChild(tabRect);
      } else {
        const rect = document.createElementNS(svgNamespace, 'rect');
        rect.setAttribute('class', 'mask-gds-section-rect');
        rect.setAttribute('x', String(rx));
        rect.setAttribute('y', String(ry));
        rect.setAttribute('width', String(rw));
        rect.setAttribute('height', String(rh));
        rect.setAttribute('fill', spec.color);
        rect.setAttribute('fill-opacity', '0.12');
        rect.setAttribute('stroke', spec.color);
        rect.setAttribute('stroke-width', String(strokeW * 1.5));
        rect.setAttribute('rx', String(strokeW * 2));
        groupEl.appendChild(rect);

        if (spec.cells) {
          const cellW = rw / spec.cells;
          for (let c = 1; c < spec.cells; c++) {
            const cx = rx + cellW * c;
            const line = document.createElementNS(svgNamespace, 'line');
            line.setAttribute('x1', String(cx));
            line.setAttribute('y1', String(ry));
            line.setAttribute('x2', String(cx));
            line.setAttribute('y2', String(ry + rh));
            line.setAttribute('stroke', spec.color);
            line.setAttribute('stroke-width', String(strokeW * 0.8));
            line.setAttribute('stroke-opacity', '0.45');
            line.setAttribute('stroke-dasharray', `${strokeW * 2} ${strokeW * 2}`);
            groupEl.appendChild(line);
          }
        }

        if (spec.hasPartitions) {
          [0.25, 0.5, 0.75].forEach((frac) => {
            const px = rx + rw * frac;
            const line = document.createElementNS(svgNamespace, 'line');
            line.setAttribute('x1', String(px));
            line.setAttribute('y1', String(ry));
            line.setAttribute('x2', String(px));
            line.setAttribute('y2', String(ry + rh));
            line.setAttribute('stroke', spec.color);
            line.setAttribute('stroke-width', String(strokeW * 0.9));
            line.setAttribute('stroke-opacity', '0.4');
            groupEl.appendChild(line);
          });
        }
      }

      // ── 2. Draw Left Callout Badges and Angled Leader Lines ─────────────────
      const calloutW = svgW * 0.36;
      const calloutH = fontSize * 2.8;
      const calloutLeftX = minX - svgW * 0.44;
      const calloutRightX = calloutLeftX + calloutW;

      // Vertical center in SVG space
      const calloutCenterSvgY = -spec.calloutY;
      const calloutTopSvgY = calloutCenterSvgY - calloutH / 2;

      // Angled leader line straight to physical edge of this section
      const p0x = calloutRightX;
      const p0y = calloutCenterSvgY;
      const p1x = calloutRightX + svgW * 0.022;
      const p1y = calloutCenterSvgY;
      const p2x = targetX - svgW * 0.015;
      const p2y = targetSvgY;
      const p3x = targetX;
      const p3y = targetSvgY;

      const path = document.createElementNS(svgNamespace, 'path');
      path.setAttribute('d', `M${p0x},${p0y} L${p1x},${p1y} L${p2x},${p2y} L${p3x},${p3y}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', spec.color);
      path.setAttribute('stroke-width', String(strokeW * 1.5));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      groupEl.appendChild(path);

      const dot = document.createElementNS(svgNamespace, 'circle');
      dot.setAttribute('cx', String(p3x));
      dot.setAttribute('cy', String(p3y));
      dot.setAttribute('r', String(strokeW * 2.2));
      dot.setAttribute('fill', spec.color);
      groupEl.appendChild(dot);

      // Callout box
      const boxRect = document.createElementNS(svgNamespace, 'rect');
      boxRect.setAttribute('class', 'mask-callout-badge');
      boxRect.setAttribute('x', String(calloutLeftX));
      boxRect.setAttribute('y', String(calloutTopSvgY));
      boxRect.setAttribute('width', String(calloutW));
      boxRect.setAttribute('height', String(calloutH));
      boxRect.setAttribute('rx', String(strokeW * 4));
      boxRect.setAttribute('fill', '#07111f');
      boxRect.setAttribute('fill-opacity', '0.94');
      boxRect.setAttribute('stroke', spec.color);
      boxRect.setAttribute('stroke-width', String(strokeW * 1.6));
      groupEl.appendChild(boxRect);

      // Callout Title
      const hasSub = Boolean(spec.sub);
      const titleY = hasSub ? calloutCenterSvgY - subFontSize * 0.55 : calloutCenterSvgY;
      const textX = calloutLeftX + svgW * 0.018;

      const titleText = document.createElementNS(svgNamespace, 'text');
      titleText.setAttribute('x', String(textX));
      titleText.setAttribute('y', String(titleY));
      titleText.setAttribute('fill', '#ffffff');
      titleText.setAttribute('font-size', String(fontSize * 0.88));
      titleText.setAttribute('font-weight', '700');
      titleText.setAttribute('dominant-baseline', 'central');
      titleText.setAttribute('paint-order', 'stroke');
      titleText.setAttribute('stroke', '#07111f');
      titleText.setAttribute('stroke-width', String(strokeW * 0.6));
      titleText.textContent = `${spec.number}. ${spec.name}`;
      groupEl.appendChild(titleText);

      if (hasSub) {
        const subText = document.createElementNS(svgNamespace, 'text');
        subText.setAttribute('x', String(textX));
        subText.setAttribute('y', String(calloutCenterSvgY + subFontSize * 0.85));
        subText.setAttribute('fill', '#8aafc8');
        subText.setAttribute('font-size', String(subFontSize));
        subText.setAttribute('font-weight', '600');
        subText.setAttribute('dominant-baseline', 'central');
        subText.setAttribute('paint-order', 'stroke');
        subText.setAttribute('stroke', '#07111f');
        subText.setAttribute('stroke-width', String(strokeW * 0.5));
        subText.textContent = `(${spec.sub})`;
        groupEl.appendChild(subText);
      }

      // Interactive click and hover listeners
      groupEl.addEventListener('click', () => this.selectSection(idx));
      groupEl.addEventListener('pointerenter', () => this.selectSection(idx));
      groupEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.selectSection(idx);
      });
      regions.appendChild(groupEl);
    });

    // ── 3. Draw Top Output Arrows & Real Pin Labels ───────────────────────────
    const outputs = analysis.outputs;
    const arrowStemH = svgH * 0.045;

    outputs.forEach((pin) => {
      const pinX = pin.x;
      const pinY = -pin.y;
      const distances = [
        { direction: 'left', distance: Math.abs(pin.x - minX), dx: -1, dy: 0 },
        { direction: 'right', distance: Math.abs(maxX - pin.x), dx: 1, dy: 0 },
        { direction: 'down', distance: Math.abs(pin.y - minY), dx: 0, dy: 1 },
        { direction: 'up', distance: Math.abs(maxY - pin.y), dx: 0, dy: -1 }
      ];
      const nearestEdge = distances.reduce((nearest, edge) => edge.distance < nearest.distance ? edge : nearest);
      const arrowLength = Math.max(arrowStemH * 0.55, fontSize * 1.6);
      const tipX = pinX + nearestEdge.dx * arrowLength;
      const tipY = pinY + nearestEdge.dy * arrowLength;
      const baseX = tipX - nearestEdge.dx * strokeW * 4.2;
      const baseY = tipY - nearestEdge.dy * strokeW * 4.2;
      const halfWidth = strokeW * 2.8;
      const perpX = -nearestEdge.dy * halfWidth;
      const perpY = nearestEdge.dx * halfWidth;

      const shaft = document.createElementNS(svgNamespace, 'line');
      shaft.setAttribute('x1', String(pinX));
      shaft.setAttribute('y1', String(pinY));
      shaft.setAttribute('x2', String(tipX));
      shaft.setAttribute('y2', String(tipY));
      shaft.setAttribute('stroke', '#168bff');
      shaft.setAttribute('stroke-width', String(strokeW * 1.5));
      regions.appendChild(shaft);

      const arrow = document.createElementNS(svgNamespace, 'polygon');
      arrow.setAttribute('points', `${tipX},${tipY} ${baseX + perpX},${baseY + perpY} ${baseX - perpX},${baseY - perpY}`);
      arrow.setAttribute('fill', '#168bff');
      regions.appendChild(arrow);

      const text = document.createElementNS(svgNamespace, 'text');
      const labelGap = fontSize * 0.55;
      text.setAttribute('x', String(tipX + nearestEdge.dx * labelGap));
      text.setAttribute('y', String(tipY + nearestEdge.dy * labelGap));
      text.setAttribute('fill', '#c8ddf0');
      text.setAttribute('font-size', String(fontSize * 0.88));
      text.setAttribute('font-weight', '700');
      text.setAttribute('text-anchor', nearestEdge.dx < 0 ? 'end' : nearestEdge.dx > 0 ? 'start' : 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('paint-order', 'stroke');
      text.setAttribute('stroke', '#07111f');
      text.setAttribute('stroke-width', String(strokeW * 0.8));
      text.textContent = pin.name;
      regions.appendChild(text);
    });

    // ── 4. Coordinate Axes in Bottom Right ───────────────────────────────────
    const axisGroup = document.createElementNS(svgNamespace, 'g');
    const axisOriginX = minX + svgW * 1.05;
    const axisOriginY = -minY + svgH * 0.04;
    const axisLen = svgW * 0.06;

    const yAxisLine = document.createElementNS(svgNamespace, 'line');
    yAxisLine.setAttribute('x1', String(axisOriginX));
    yAxisLine.setAttribute('y1', String(axisOriginY));
    yAxisLine.setAttribute('x2', String(axisOriginX));
    yAxisLine.setAttribute('y2', String(axisOriginY - axisLen));
    yAxisLine.setAttribute('stroke', '#8aafc8');
    yAxisLine.setAttribute('stroke-width', String(strokeW * 1.2));
    axisGroup.appendChild(yAxisLine);

    const yArrow = document.createElementNS(svgNamespace, 'polygon');
    const yaw = strokeW * 2.2;
    const yah = strokeW * 3.5;
    yArrow.setAttribute('points', `${axisOriginX},${axisOriginY - axisLen - yah} ${axisOriginX - yaw},${axisOriginY - axisLen} ${axisOriginX + yaw},${axisOriginY - axisLen}`);
    yArrow.setAttribute('fill', '#8aafc8');
    axisGroup.appendChild(yArrow);

    const yLabel = document.createElementNS(svgNamespace, 'text');
    yLabel.setAttribute('x', String(axisOriginX + strokeW * 3));
    yLabel.setAttribute('y', String(axisOriginY - axisLen - yah));
    yLabel.setAttribute('fill', '#8aafc8');
    yLabel.setAttribute('font-size', String(fontSize * 0.65));
    yLabel.setAttribute('font-weight', '600');
    yLabel.setAttribute('dominant-baseline', 'central');
    yLabel.textContent = 'Y (up)';
    axisGroup.appendChild(yLabel);

    const xAxisLine = document.createElementNS(svgNamespace, 'line');
    xAxisLine.setAttribute('x1', String(axisOriginX));
    xAxisLine.setAttribute('y1', String(axisOriginY));
    xAxisLine.setAttribute('x2', String(axisOriginX + axisLen));
    xAxisLine.setAttribute('y2', String(axisOriginY));
    xAxisLine.setAttribute('stroke', '#8aafc8');
    xAxisLine.setAttribute('stroke-width', String(strokeW * 1.2));
    axisGroup.appendChild(xAxisLine);

    const xArrow = document.createElementNS(svgNamespace, 'polygon');
    xArrow.setAttribute('points', `${axisOriginX + axisLen + yah},${axisOriginY} ${axisOriginX + axisLen},${axisOriginY - yaw} ${axisOriginX + axisLen},${axisOriginY + yaw}`);
    xArrow.setAttribute('fill', '#8aafc8');
    axisGroup.appendChild(xArrow);

    const xLabel = document.createElementNS(svgNamespace, 'text');
    xLabel.setAttribute('x', String(axisOriginX + axisLen + yah + strokeW * 3));
    xLabel.setAttribute('y', String(axisOriginY));
    xLabel.setAttribute('fill', '#8aafc8');
    xLabel.setAttribute('font-size', String(fontSize * 0.65));
    xLabel.setAttribute('font-weight', '600');
    xLabel.setAttribute('dominant-baseline', 'central');
    xLabel.textContent = 'X (right)';
    axisGroup.appendChild(xLabel);

    regions.appendChild(axisGroup);
    return regions;
  }

  setGdsSvgViewBox() {
    if (this.gdsViewBox) this.gdsSvgEl.setAttribute('viewBox', this.gdsViewBox.join(' '));
  }

  setGdsLayersVisible(visible) {
    this.gdsLayersEl.querySelectorAll('[data-mask-gds-layer-toggle]').forEach((button) => {
      const id = button.dataset.maskGdsLayerToggle.replace('/', '-');
      const group = document.getElementById(`mask-gds-layer-${id}`);
      if (group) group.style.display = visible ? '' : 'none';
      button.setAttribute('aria-pressed', String(visible));
    });
  }

  setFunctionalGroupingVisible(visible) {
    const toggle = this.el.querySelector('[data-mask-gds-grouping]');
    if (toggle) toggle.setAttribute('aria-pressed', String(visible));
    this.gdsViewerEl.classList.toggle('functional-grouping-active', visible);
    const grouping = this.gdsSvgEl.querySelector('[data-gds-functional-groups]');
    if (grouping) grouping.style.display = visible ? '' : 'none';
    this.fitGdsPreview();
  }

  fitGdsPreview() {
    if (!this.gdsPreview?.bounds) return;
    const { minX, minY, maxX, maxY } = this.gdsPreview.bounds;
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const groupingActive = this.gdsViewerEl.classList.contains('functional-grouping-active');
    if (groupingActive) {
      // Extended viewbox margins to accommodate left callouts, top bit arrows, and coordinate axes
      const leftPad = width * 0.48;
      const rightPad = width * 0.16;
      const topPad = height * 0.14;
      const bottomPad = height * 0.12;
      this.gdsViewBox = [minX - leftPad, -maxY - topPad, width + leftPad + rightPad, height + topPad + bottomPad];
    } else {
      const pad = Math.max(width, height) * 0.04;
      this.gdsViewBox = [minX - pad, -maxY - pad, width + pad * 2, height + pad * 2];
    }
    this.setGdsSvgViewBox();
  }

  zoomGdsPreview(factor) {
    if (!this.gdsViewBox) return;
    const [x, y, width, height] = this.gdsViewBox;
    const baseWidth = Math.max(this.gdsPreview.width, 1);
    const minWidth = baseWidth / 4096;
    const nextWidth = Math.max(minWidth, Math.min(baseWidth * 2, width * factor));
    const nextHeight = height * (nextWidth / width);
    const centerX = x + width / 2, centerY = y + height / 2;
    this.gdsViewBox = [centerX - nextWidth / 2, centerY - nextHeight / 2, nextWidth, nextHeight];
    this.setGdsSvgViewBox();
  }

  autoFillFromChipDesign() {
    if (this.technologyId !== 'generic') {
      this.setStatus('Chip Lab schematic rasterization is only available in the Educational profile; it does not generate a PDK layout.');
      return false;
    }
    if (this.trainingSessionSnapshot) {
      this.setStatus('Close the training challenge before replacing the mask from Chip Lab.');
      return false;
    }
    const chipLab = this.editor?.chipLabPanel;
    if (!chipLab || !Array.isArray(chipLab.nodes) || !chipLab.nodes.length) {
      this.setStatus('Open Chip Lab and create or load a design before using Auto-fill.');
      return false;
    }
    const nodes = chipLab.nodes.filter((node) =>
      node && Number.isFinite(node.x) && Number.isFinite(node.y) && typeof node.id === 'string'
    );
    const wires = Array.isArray(chipLab.wires) ? chipLab.wires : [];
    if (!nodes.length) {
      this.setStatus('The Chip Lab design has no components with valid layout positions.');
      return false;
    }
    const physicalLayout = chipLab.normalizePhysicalLayout?.(chipLab.physicalLayout) || null;
    const usesPhysicalLayout = Boolean(physicalLayout && nodes.every((node) => physicalLayout.placements?.[node.id]));
    // Start on ACTIVE so a newly generated layout is visible even when the
    // design has no routed wires yet (in which case METAL 1 is legitimately empty).
    this.activeLayerId = 'active';
    this.setCurrentLayerMask(this.layerMasks.active);
    if (usesPhysicalLayout) {
      const activeMask = this.createMask(this.gridWidth, this.gridHeight);
      const gateMask = this.createMask(this.gridWidth, this.gridHeight);
      const metalMask = this.createMask(this.gridWidth, this.gridHeight);
      const margin = 2;
      const availableWidth = Math.max(1, this.gridWidth - margin * 2 - 1);
      const availableHeight = Math.max(1, this.gridHeight - margin * 2 - 1);
      const aspect = physicalLayout.widthMm / physicalLayout.heightMm;
      let renderedWidth = availableWidth, renderedHeight = renderedWidth / aspect;
      if (renderedHeight > availableHeight) {
        renderedHeight = availableHeight;
        renderedWidth = renderedHeight * aspect;
      }
      const offsetX = (this.gridWidth - 1 - renderedWidth) / 2;
      const offsetY = (this.gridHeight - 1 - renderedHeight) / 2;
      const cellWidth = Math.max(2, Math.round(renderedWidth * 0.104));
      const cellHeight = Math.max(2, Math.round(renderedHeight * 0.095));
      const project = (placement) => ({
        x: Math.max(0, Math.min(this.gridWidth - 1, Math.round(offsetX + placement.x * renderedWidth))),
        y: Math.max(0, Math.min(this.gridHeight - 1, Math.round(offsetY + placement.y * renderedHeight)))
      });
      const centers = new Map();
      for (const node of nodes) {
        const center = project(physicalLayout.placements[node.id]);
        centers.set(node.id, center);
        const left = center.x - Math.floor(cellWidth / 2), right = center.x + Math.floor(cellWidth / 2);
        const top = center.y - Math.floor(cellHeight / 2), bottom = center.y + Math.floor(cellHeight / 2);
        this.traceDesignLine(left, top, right, top, activeMask);
        this.traceDesignLine(right, top, right, bottom, activeMask);
        this.traceDesignLine(right, bottom, left, bottom, activeMask);
        this.traceDesignLine(left, bottom, left, top, activeMask);
        this.traceDesignLine(center.x, center.y, center.x, center.y, gateMask);
        if (node.type === 'VPLUS' || node.type === 'GROUND') {
          this.traceDesignLine(center.x - 1, center.y, center.x + 1, center.y, gateMask);
        }
      }
      for (const wire of wires) {
        const start = centers.get(wire.from), end = centers.get(wire.to);
        if (!start || !end) continue;
        if (wire.route === 'straight') this.traceDesignLine(start.x, start.y, end.x, end.y, metalMask);
        else {
          const bendX = Math.round((start.x + end.x) / 2);
          this.traceDesignLine(start.x, start.y, bendX, start.y, metalMask);
          this.traceDesignLine(bendX, start.y, bendX, end.y, metalMask);
          this.traceDesignLine(bendX, end.y, end.x, end.y, metalMask);
        }
      }
      this.layerMasks.active = activeMask;
      this.layerMasks.gate = gateMask;
      this.layerMasks.metal1 = metalMask;
      this.setCurrentLayerMask(activeMask);
    } else {
    const geometry = nodes.map((node) => ({
      node,
      left: node.x,
      top: node.y,
      right: node.x + 150,
      bottom: node.y + (chipLab.nodeHeight?.(node) || 72)
    }));
    const minX = Math.min(...geometry.map(({ left }) => left));
    const maxX = Math.max(...geometry.map(({ right }) => right));
    const minY = Math.min(...geometry.map(({ top }) => top));
    const maxY = Math.max(...geometry.map(({ bottom }) => bottom));
    const margin = Math.min(4, Math.floor(Math.min(this.gridWidth, this.gridHeight) / 4));
    const availableWidth = Math.max(1, this.gridWidth - margin * 2 - 1);
    const availableHeight = Math.max(1, this.gridHeight - margin * 2 - 1);
    const scale = Math.min(
      availableWidth / Math.max(1, maxX - minX),
      availableHeight / Math.max(1, maxY - minY)
    );
    const renderedWidth = (maxX - minX) * scale;
    const renderedHeight = (maxY - minY) * scale;
    const offsetX = Math.round((this.gridWidth - 1 - renderedWidth) / 2);
    const offsetY = Math.round((this.gridHeight - 1 - renderedHeight) / 2);
    const project = (point) => ({
      x: Math.max(0, Math.min(this.gridWidth - 1, Math.round(offsetX + (point.x - minX) * scale))),
      y: Math.max(0, Math.min(this.gridHeight - 1, Math.round(offsetY + (point.y - minY) * scale)))
    });
    this.setCurrentLayerMask(this.createMask(this.gridWidth, this.gridHeight));

    for (const { node, left, top, right, bottom } of geometry) {
      const a = project({ x: left, y: top });
      const b = project({ x: right, y: bottom });
      this.traceDesignLine(a.x, a.y, b.x, a.y);
      this.traceDesignLine(b.x, a.y, b.x, b.y);
      this.traceDesignLine(b.x, b.y, a.x, b.y);
      this.traceDesignLine(a.x, b.y, a.x, a.y);
      const center = project({ x: (left + right) / 2, y: (top + bottom) / 2 });
      this.mask[center.y][center.x] = true;
      if (node.type === 'VPLUS') {
        this.traceDesignLine(center.x - 1, center.y, center.x + 1, center.y);
        this.traceDesignLine(center.x, center.y - 1, center.x, center.y + 1);
      } else if (node.type === 'GROUND') {
        this.traceDesignLine(center.x - 1, center.y - 1, center.x + 1, center.y - 1);
        this.traceDesignLine(center.x - 1, center.y, center.x + 1, center.y);
        this.traceDesignLine(center.x - 1, center.y + 1, center.x + 1, center.y + 1);
      }
    }

    const positions = new Map(nodes.map((node) => [node.id, node]));
    for (const wire of wires) {
      const source = positions.get(wire.from);
      const target = positions.get(wire.to);
      if (!source || !target) continue;
      const start = chipLab.portPosition?.(source, 'out', wire.output) || { x: source.x + 150, y: source.y + 36 };
      const end = chipLab.portPosition?.(target, 'in', wire.input) || { x: target.x, y: target.y + 36 };
      const points = [];
      if (wire.route === 'orthogonal') {
        const bendX = (start.x + end.x) / 2;
        points.push(start, { x: bendX, y: start.y }, { x: bendX, y: end.y }, end);
      } else if (wire.route === 'straight') {
        points.push(start, end);
      } else {
        const bend = Math.max(50, Math.abs(end.x - start.x) * 0.45);
        const control1 = { x: start.x + bend, y: start.y };
        const control2 = { x: end.x - bend, y: end.y };
        for (let step = 0; step <= 24; step += 1) {
          const t = step / 24;
          const inverse = 1 - t;
          points.push({
            x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * control1.x + 3 * inverse * t ** 2 * control2.x + t ** 3 * end.x,
            y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * control1.y + 3 * inverse * t ** 2 * control2.y + t ** 3 * end.y
          });
        }
      }
      for (let index = 1; index < points.length; index += 1) {
        const a = project(points[index - 1]);
        const b = project(points[index]);
        this.traceDesignLine(a.x, a.y, b.x, b.y);
      }
    }
    }

    const powerCheck = chipLab.inspectPowerRails?.() || null;
    const simulation = chipLab.evaluate?.();
    const outputNodes = nodes.filter((node) => node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT');
    const outputValues = outputNodes.map((node) => {
      const value = simulation?.outputs.get(node.id);
      return {
        label: node.label,
        value: Array.isArray(value) ? value.slice() : value ?? null
      };
    });
    const unresolvedComponents = [...(simulation?.unresolved || [])]
      .map((id) => nodes.find((node) => node.id === id)?.label || id);
    const diagnostics = chipLab.analyzeDesign?.() || [];
    const steps = chipLab.testBench?.steps || [];
    const completedSteps = steps.filter((step) => typeof step.result === 'boolean');
    this.name = `${chipLab.chipName || 'Chip Lab'} mask`;
    this.sourceDesign = {
      name: chipLab.chipName || 'Chip Lab design',
      designId: chipLab.designId || null,
      componentCount: nodes.length,
      wireCount: wires.length,
      physicalLayout,
      sourceView: usesPhysicalLayout ? 'physical-layout-preview' : 'schematic-preview',
      generatedAt: new Date().toISOString(),
      powerCheck,
      simulation: {
        outputs: outputValues,
        unresolvedComponents,
        diagnostics: diagnostics.map(({ severity, message }) => ({ severity, message }))
      },
      testBench: steps.length ? {
        name: chipLab.testBench.name,
        total: steps.length,
        passed: completedSteps.filter((step) => step.result).length,
        completed: completedSteps.length
      } : null
    };
    const nameInput = this.el.querySelector('[data-mask-name]');
    if (nameInput) nameInput.value = this.name;
    this.profileLayouts[this.technologyId].name = this.name;
    this.profileLayouts[this.technologyId].sourceDesign = this.sourceDesign;
    this.renderTechnologyProfile();
    this.renderGrid();
    this.updateSummary();
    const stateSaved = this.saveState();
    const status = powerCheck?.ok
      ? `Auto-filled ${nodes.length} components and ${wires.length} wires. V+ and GND are connected; ${unresolvedComponents.length} unresolved component(s).`
      : `Auto-filled ${nodes.length} components and ${wires.length} wires. Review Chip Lab V+ / GND wiring: ${powerCheck?.issues.join(' ') || 'power rails are not configured.'}`;
    this.setStatus(`${status}${usesPhysicalLayout ? ' Conceptual ACTIVE, GATE, and METAL 1 layers generated.' : ''}${stateSaved ? '' : ' Autosave failed; export the mask to keep a copy.'}`);
    return true;
  }

  setStatus(message) {
    if (this.statusEl) this.statusEl.textContent = message;
  }

  saveState() {
    if (this.trainingSessionSnapshot) return true;
    try {
      if (typeof localStorage === 'undefined') throw new Error('localStorage is unavailable');
      const payload = this.exportMask();
      localStorage.setItem(MASK_STORAGE_KEY, JSON.stringify(payload));
      this.setStatus('Autosaved in this browser.');
      return true;
    } catch (error) {
      console.error('MaskLab could not save its state:', error);
      this.setStatus(`Autosave failed: ${error.message}. Export the mask to keep a copy.`);
      return false;
    }
  }

  loadState() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(MASK_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.importMask(data);
    } catch (error) {
      console.warn('MaskLab could not restore its previous state:', error);
    }
  }

  exportMask() {
    this.syncProfileLayout();
    const profiles = Object.fromEntries(Object.entries(this.profileLayouts).map(([technologyId, layout]) => [
      technologyId,
      {
        widthPx: layout.width,
        heightPx: layout.height,
        activeLayerId: layout.activeLayerId,
        name: layout.name,
        sourceDesign: layout.sourceDesign,
        layers: Object.fromEntries(Object.entries(layout.layers).flatMap(([layerId, mask]) => {
          const activeCells = [];
          for (let y = 0; y < layout.height; y += 1) {
            for (let x = 0; x < layout.width; x += 1) {
              if (mask[y]?.[x]) activeCells.push(y * layout.width + x);
            }
          }
          return activeCells.length ? [[layerId, activeCells]] : [];
        }))
      }
    ]));
    return {
      schemaVersion: 2,
      technologyId: this.technologyId,
      activeLayerId: this.activeLayerId,
      name: this.name,
      pixelSizeNm: this.pixelSizeNm,
      widthPx: this.gridWidth,
      heightPx: this.gridHeight,
      cells: this.mask.map((row) => row.map(Boolean)),
      ...(this.sourceDesign ? { sourceDesign: this.sourceDesign } : {}),
      profiles
    };
  }

  loadLearningProgress() {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = JSON.parse(localStorage.getItem(MASK_LEARNING_PROGRESS_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter((lessonId) => MASK_LESSONS.some((lesson) => lesson.id === lessonId)) : [];
    } catch {
      return [];
    }
  }

  loadLearningStats() {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = JSON.parse(localStorage.getItem(MASK_LEARNING_STATS_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }

  saveLearningProgress() {
    try {
      if (typeof localStorage === 'undefined') throw new Error('localStorage is unavailable');
      localStorage.setItem(MASK_LEARNING_PROGRESS_KEY, JSON.stringify(this.learningProgress));
    } catch (error) {
      console.error('MaskLab could not save training progress:', error);
      this.setStatus(`Training progress could not be saved: ${error.message}.`);
    }
  }

  saveLearningStats() {
    try {
      if (typeof localStorage === 'undefined') throw new Error('localStorage is unavailable');
      localStorage.setItem(MASK_LEARNING_STATS_KEY, JSON.stringify(this.learningStats));
    } catch (error) {
      console.error('MaskLab could not save training scores:', error);
      this.setStatus(`Training scores could not be saved: ${error.message}.`);
    }
  }

  openTraining() {
    if (this.technologyId !== 'generic') {
      this.setStatus('Pattern training is available only in the Educational profile.');
      return;
    }
    const modal = this.el.querySelector('[data-mask-learning-modal]');
    if (modal) modal.hidden = false;
    this.renderLearningPath();
  }

  closeTraining() {
    const modal = this.el.querySelector('[data-mask-learning-modal]');
    if (modal) modal.hidden = true;
    this.activeTrainingLessonId = null;
    this.learningPassed = false;
    this.restoreTrainingSession();
  }

  selectTrainingLesson(index) {
    if (!Number.isInteger(index) || !MASK_LESSONS[index]) return;
    this.learningLessonIndex = index;
    this.learningHintCount = 0;
    this.activeTrainingLessonId = null;
    this.learningPassed = false;
    this.learningResult = 'Start the challenge when you are ready.';
    this.renderLearningPath();
  }

  revealTrainingHint() {
    const lesson = MASK_LESSONS[this.learningLessonIndex];
    if (!lesson) return;
    this.learningHintCount = Math.min(this.learningHintCount + 1, lesson.hints.length);
    this.renderLearningPath();
  }

  nextTrainingLesson() {
    const nextIndex = this.learningLessonIndex + 1;
    if (!MASK_LESSONS[nextIndex]) {
      this.learningResult = 'Training complete. Your original mask has been restored.';
      this.closeTraining();
      this.renderLearningPath();
      return;
    }
    this.selectTrainingLesson(nextIndex);
    this.loadTrainingLesson();
  }

  renderLearningPath() {
    const list = this.el.querySelector('[data-mask-learning-list]');
    const content = this.el.querySelector('[data-mask-learning-content]');
    if (!list || !content) return;
    list.innerHTML = MASK_LESSONS.map((lesson, index) => `
      <button type="button" data-mask-action="select-training-lesson" data-mask-lesson-index="${index}" class="${index === this.learningLessonIndex ? 'active' : ''}">
        ${lesson.title}${this.learningProgress.includes(lesson.id) ? ' ✓' : ''}
      </button>`).join('');

    const lesson = MASK_LESSONS[this.learningLessonIndex];
    const stats = this.learningStats[lesson.id] || { attempts: 0, bestScore: 0 };
    const hints = lesson.hints.slice(0, this.learningHintCount).map((hint) => `<li>${hint}</li>`).join('');
    const nextButton = this.el.querySelector('[data-mask-action="next-training-lesson"]');
    if (nextButton) {
      nextButton.hidden = !this.learningPassed;
      nextButton.textContent = this.learningLessonIndex === MASK_LESSONS.length - 1 ? 'Finish training' : 'Next lesson';
    }
    const checkButton = this.el.querySelector('[data-mask-action="check-training"]');
    if (checkButton) checkButton.disabled = this.activeTrainingLessonId !== lesson.id;
    const progress = this.el.querySelector('[data-mask-training-progress]');
    if (progress) progress.textContent = `${this.learningProgress.length} / ${MASK_LESSONS.length} completed`;

    content.innerHTML = `
      <span>LESSON ${this.learningLessonIndex + 1} OF ${MASK_LESSONS.length} · BEST ${stats.bestScore || 0} PTS · ${stats.attempts || 0} ATTEMPTS</span>
      <h3>${lesson.title.slice(4)}</h3>
      <p>${lesson.objective}</p>
      <aside>
        <strong>HINTS · ${this.learningHintCount}/${lesson.hints.length}</strong>
        <ul>${hints || '<li>Try the challenge first or reveal a hint.</li>'}</ul>
        <button type="button" data-mask-action="reveal-training-hint" ${this.learningHintCount >= lesson.hints.length ? 'disabled' : ''}>Reveal next hint</button>
      </aside>
      <p class="mask-learning-result" aria-live="polite">${this.learningResult}</p>
    `;
  }

  loadTrainingLesson() {
    const lesson = MASK_LESSONS[this.learningLessonIndex];
    if (!lesson) return;
    if (!this.trainingSessionSnapshot) this.trainingSessionSnapshot = this.exportMask();
    this.resizeGrid(lesson.width, lesson.height);
    this.name = `Mask training: ${lesson.title}`;
    if (this.el.querySelector('[data-mask-name]')) {
      this.el.querySelector('[data-mask-name]').value = this.name;
    }
    this.learningHintCount = 0;
    this.learningResult = 'Challenge started. Draw the target pattern to match the lesson.';
    this.activeTrainingLessonId = lesson.id;
    this.learningPassed = false;
    this.clearMask();
    this.renderLearningPath();
    this.updateSummary();
  }

  restoreTrainingSession() {
    if (!this.trainingSessionSnapshot) return;
    const snapshot = this.trainingSessionSnapshot;
    this.trainingSessionSnapshot = null;
    this.importMask(snapshot);
  }

  evaluateTrainingMask(lesson) {
    const expected = new Set((lesson.cells || []).map(([x, y]) => `${x},${y}`));
    const actual = new Set();
    for (let y = 0; y < this.gridHeight; y += 1) {
      for (let x = 0; x < this.gridWidth; x += 1) {
        if (this.mask[y]?.[x]) actual.add(`${x},${y}`);
      }
    }
    const missing = [...expected].filter((cell) => !actual.has(cell));
    const extras = [...actual].filter((cell) => !expected.has(cell));
    const matches = this.gridWidth === lesson.width
      && this.gridHeight === lesson.height
      && missing.length === 0
      && extras.length === 0;
    const precision = actual.size === 0 ? 0 : (expected.size - missing.length) / actual.size;
    const recall = expected.size === 0 ? 1 : (expected.size - missing.length) / expected.size;
    const score = precision + recall === 0 ? 0 : (2 * precision * recall / (precision + recall)) * 100;
    return { matches, missing, extras, score };
  }

  checkTrainingLesson() {
    const lesson = MASK_LESSONS[this.learningLessonIndex];
    if (!lesson) return;
    if (this.activeTrainingLessonId !== lesson.id) {
      this.learningResult = 'Start this challenge before checking your mask.';
      this.renderLearningPath();
      return;
    }
    const { matches, missing, extras, score } = this.evaluateTrainingMask(lesson);
    this.learningPassed = matches;
    this.learningResult = matches
      ? 'Excellent — exact match (100/100).'
      : `Score ${Math.round(score)}/100. ${missing.length} target pixel${missing.length === 1 ? '' : 's'} missing, ${extras.length} extra. Check grid size and placement.`;
    this.learningStats[lesson.id] = {
      attempts: (this.learningStats[lesson.id]?.attempts || 0) + 1,
      bestScore: Math.max(this.learningStats[lesson.id]?.bestScore || 0, Math.round(score)),
      lastScore: Math.round(score),
      hintsUsed: this.learningHintCount
    };
    this.saveLearningStats();
    if (matches && !this.learningProgress.includes(lesson.id)) {
      this.learningProgress.push(lesson.id);
      this.saveLearningProgress();
    }
    this.renderLearningPath();
  }

  importMask(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.profiles && typeof data.profiles === 'object') {
      const restoredLayouts = this.createProfileLayouts(64, 64);
      for (const technology of MASK_TECHNOLOGIES) {
        const saved = data.profiles[technology.id];
        if (!saved || typeof saved !== 'object') continue;
        const width = Math.max(8, Math.min(128, Math.round(Number(saved.widthPx) || 64)));
        const height = Math.max(8, Math.min(128, Math.round(Number(saved.heightPx) || width)));
        const layout = {
          width,
          height,
          activeLayerId: technology.layers.some(({ id }) => id === saved.activeLayerId)
            ? saved.activeLayerId : technology.layers[0].id,
          name: typeof saved.name === 'string' && saved.name.trim() ? saved.name.trim() : 'MaskLab',
          sourceDesign: saved.sourceDesign && typeof saved.sourceDesign === 'object' ? saved.sourceDesign : null,
          layers: Object.fromEntries(technology.layers.map(({ id }) => [id, this.createMask(width, height)]))
        };
        for (const [layerId, activeIndices] of Object.entries(saved.layers || {})) {
          const target = layout.layers[layerId];
          if (!target || !Array.isArray(activeIndices)) continue;
          for (const index of activeIndices) {
            if (!Number.isInteger(index) || index < 0 || index >= width * height) continue;
            target[Math.floor(index / width)][index % width] = true;
          }
        }
        restoredLayouts[technology.id] = layout;
      }
      this.profileLayouts = restoredLayouts;
      this.technologyId = MASK_TECHNOLOGIES.some(({ id }) => id === data.technologyId)
        ? data.technologyId : DEFAULT_MASK_TECHNOLOGY_ID;
      const layout = this.profileLayouts[this.technologyId];
      this.gridWidth = layout.width;
      this.gridHeight = layout.height;
      this.layerMasks = layout.layers;
      this.activeLayerId = MASK_TECHNOLOGIES.find(({ id }) => id === this.technologyId)
        .layers.some(({ id }) => id === data.activeLayerId) ? data.activeLayerId : layout.activeLayerId;
      this.mask = this.layerMasks[this.activeLayerId];
      this.name = layout.name;
      this.sourceDesign = layout.sourceDesign;
    } else {
      const width = Number(data.widthPx) || Number(data.width) || 64;
      const height = Number(data.heightPx) || Number(data.height) || width;
      const cells = Array.isArray(data.cells) ? data.cells : Array.isArray(data.mask) ? data.mask : null;
      if (!cells) return false;
      this.technologyId = DEFAULT_MASK_TECHNOLOGY_ID;
      const safeWidth = Math.max(8, Math.min(128, Math.round(width)));
      const safeHeight = Math.max(8, Math.min(128, Math.round(height)));
      this.gridWidth = safeWidth;
      this.gridHeight = safeHeight;
      const technology = this.getTechnology();
      this.layerMasks = Object.fromEntries(technology.layers.map(({ id }) => [id, this.createMask(safeWidth, safeHeight)]));
      this.activeLayerId = technology.layers[0].id;
      this.mask = this.layerMasks[this.activeLayerId];
      for (let y = 0; y < safeHeight; y += 1) {
        const row = Array.isArray(cells[y]) ? cells[y] : [];
        for (let x = 0; x < safeWidth; x += 1) {
          this.mask[y][x] = Boolean(row[x]);
        }
      }
      this.name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : this.name;
      this.sourceDesign = data.sourceDesign && typeof data.sourceDesign === 'object' ? data.sourceDesign : null;
      this.profileLayouts[this.technologyId] = {
        width: this.gridWidth,
        height: this.gridHeight,
        activeLayerId: this.activeLayerId,
        name: this.name,
        sourceDesign: this.sourceDesign,
        layers: this.layerMasks
      };
    }
    const nameInput = this.el?.querySelector('[data-mask-name]');
    if (nameInput) nameInput.value = this.name;
    const sizeInput = this.el?.querySelector('[data-mask-grid-size]');
    if (sizeInput) sizeInput.value = String(this.gridWidth);
    this.renderTechnologyProfile();
    this.renderGrid();
    this.updateSummary();
    this.saveState();
    return true;
  }

  renderGrid() {
    if (!this.gridEl) return;
    const technology = this.getTechnology();
    const activeLayer = technology.layers.find(({ id }) => id === this.activeLayerId);
    this.gridEl.style.setProperty('--mask-layer-color', activeLayer?.color || '#7aa2ff');
    this.gridEl.setAttribute('aria-label', `${technology.name}, ${activeLayer?.label || 'drawing'} layer. Use arrow keys to move and Enter or Space to paint.`);
    this.gridEl.style.gridTemplateColumns = `repeat(${this.gridWidth}, minmax(0, 1fr))`;
    this.gridEl.style.gridTemplateRows = `repeat(${this.gridHeight}, minmax(0, 1fr))`;
    const cellCount = this.gridWidth * this.gridHeight;
    if (this.renderedGridWidth !== this.gridWidth ||
        this.renderedGridHeight !== this.gridHeight ||
        this.cellElements.length !== cellCount) {
      const fragment = document.createDocumentFragment();
      this.cellElements = [];
      for (let y = 0; y < this.gridHeight; y += 1) {
        for (let x = 0; x < this.gridWidth; x += 1) {
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'mask-cell';
          cell.dataset.x = String(x);
          cell.dataset.y = String(y);
          cell.title = `Pixel ${x}, ${y}`;
          cell.setAttribute('aria-label', `Pixel ${x}, ${y}`);
          cell.tabIndex = x === 0 && y === 0 ? 0 : -1;
          fragment.appendChild(cell);
          this.cellElements.push(cell);
        }
      }
      this.gridEl.replaceChildren(fragment);
      this.renderedGridWidth = this.gridWidth;
      this.renderedGridHeight = this.gridHeight;
      this.focusedCell = this.cellElements[0] || null;
    }
    for (let y = 0; y < this.gridHeight; y += 1) {
      for (let x = 0; x < this.gridWidth; x += 1) {
        const cell = this.cellElements[y * this.gridWidth + x];
        const active = Boolean(this.mask[y][x]);
        cell.classList.toggle('mask-on', active);
        cell.setAttribute('aria-pressed', String(active));
      }
    }
    this.updateSummary();
  }

  exportMaskFile() {
    const payload = JSON.stringify(this.exportMask(), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(this.name || 'MaskLab').replace(/\s+/g, '-').toLowerCase()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
