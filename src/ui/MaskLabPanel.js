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
    this.pixelSizeNm = 10;
    this.gridWidth = 64;
    this.gridHeight = 64;
    this.name = 'MaskLab';
    this.sourceDesign = null;
    this.brushMode = 'draw';
    this.isDrawing = false;
    this.cellElements = [];
    this.renderedGridWidth = 0;
    this.renderedGridHeight = 0;
    this.focusedCell = null;
    this.mask = this.createMask(this.gridWidth, this.gridHeight);
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
            <small>10 nm × 10 nm pixel mask editor</small>
          </div>
        </div>
        <label class="mask-name-label">MASK NAME<input data-mask-name maxlength="48" value="MaskLab" aria-label="Mask name"></label>
        <div class="mask-top-actions">
          <button type="button" data-mask-action="open-training">Training</button>
          <button type="button" data-mask-action="auto-fill-chip">Auto-fill from Chip Lab</button>
          <button type="button" data-mask-action="clear">Clear</button>
          <button type="button" data-mask-action="fill">Fill</button>
          <button type="button" data-mask-action="invert">Invert</button>
          <button type="button" data-mask-action="export" class="mask-primary">Export</button>
        </div>
      </header>
      <div class="mask-workbench">
        <aside class="mask-tools">
          <div class="mask-panel-title"><span>CONTROLS</span></div>
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
              <span>Pixel pitch</span>
              <input type="text" value="10 nm" readonly>
            </label>
            <div class="mask-size-readout" data-mask-dimension-readout>640 nm × 640 nm</div>
          </div>
        </aside>
        <main class="mask-editor-panel">
          <div class="mask-focus-bar">
            <div class="mask-summary" data-mask-summary>0 / 4096 pixels lit</div>
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
            <div class="mask-info-row"><span>Resolution</span><strong>10 nm / pixel</strong></div>
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

    this.loadState();
    this.bindEvents();
    this.renderGrid();
    this.updateSummary();
    this.renderLearningPath();
  }

  createMask(width, height) {
    return Array.from({ length: height }, () => Array.from({ length: width }, () => false));
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
        this.maskSourceDetailsEl.textContent = `${this.sourceDesign.componentCount} components · ${this.sourceDesign.wireCount} wires · ${unresolved} unresolved${Number.isInteger(tests) ? ` · tests ${passed}/${tests}` : ''}`;
      }
    }
  }

  bindEvents() {
    this.el.addEventListener('click', (event) => {
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
    });

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
    this.gridWidth = Math.max(8, Math.min(128, Number(width) || 64));
    this.gridHeight = Math.max(8, Math.min(128, Number(height) || this.gridWidth));
    this.mask = this.createMask(this.gridWidth, this.gridHeight);
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
    this.mask = this.createMask(this.gridWidth, this.gridHeight).map((row) => row.map(() => true));
    this.renderGrid();
    this.updateSummary();
    this.saveState();
  }

  clearMask() {
    this.sourceDesign = null;
    this.mask = this.createMask(this.gridWidth, this.gridHeight);
    this.renderGrid();
    this.updateSummary();
    this.saveState();
  }

  invertMask() {
    this.sourceDesign = null;
    this.mask = this.mask.map((row) => row.map((cell) => !cell));
    this.renderGrid();
    this.updateSummary();
    this.saveState();
  }

  traceDesignLine(x0, y0, x1, y1) {
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      if (x >= 0 && y >= 0 && x < this.gridWidth && y < this.gridHeight) this.mask[y][x] = true;
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

  autoFillFromChipDesign() {
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
    this.mask = this.createMask(this.gridWidth, this.gridHeight);

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
    this.renderGrid();
    this.updateSummary();
    const stateSaved = this.saveState();
    const status = powerCheck?.ok
      ? `Auto-filled ${nodes.length} components and ${wires.length} wires. V+ and GND are connected; ${unresolvedComponents.length} unresolved component(s).`
      : `Auto-filled ${nodes.length} components and ${wires.length} wires. Review Chip Lab V+ / GND wiring: ${powerCheck?.issues.join(' ') || 'power rails are not configured.'}`;
    this.setStatus(`${status}${stateSaved ? '' : ' Autosave failed; export the mask to keep a copy.'}`);
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
    return {
      name: this.name,
      pixelSizeNm: this.pixelSizeNm,
      widthPx: this.gridWidth,
      heightPx: this.gridHeight,
      cells: this.mask.map((row) => row.map(Boolean)),
      ...(this.sourceDesign ? { sourceDesign: this.sourceDesign } : {})
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
    const width = Number(data.widthPx) || Number(data.width) || 64;
    const height = Number(data.heightPx) || Number(data.height) || width;
    const cells = Array.isArray(data.cells) ? data.cells : Array.isArray(data.mask) ? data.mask : null;
    if (!cells) return false;
    const safeWidth = Math.max(8, Math.min(128, width));
    const safeHeight = Math.max(8, Math.min(128, height));
    this.gridWidth = safeWidth;
    this.gridHeight = safeHeight;
    this.mask = this.createMask(this.gridWidth, this.gridHeight);
    for (let y = 0; y < safeHeight; y += 1) {
      const row = Array.isArray(cells[y]) ? cells[y] : [];
      for (let x = 0; x < safeWidth; x += 1) {
        this.mask[y][x] = Boolean(row[x]);
      }
    }
    this.name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : this.name;
    this.sourceDesign = data.sourceDesign && typeof data.sourceDesign === 'object' ? data.sourceDesign : null;
    if (this.el?.querySelector('[data-mask-name]')) {
      this.el.querySelector('[data-mask-name]').value = this.name;
    }
    this.renderGrid();
    this.updateSummary();
    this.saveState();
    return true;
  }

  renderGrid() {
    if (!this.gridEl) return;
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
