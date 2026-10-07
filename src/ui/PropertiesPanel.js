import * as THREE from 'three';
import { Icons } from '../utils/Icons.js';
import { GeometryUtils } from '../utils/GeometryUtils.js';

export class PropertiesPanel {
  constructor(editor, container) {
    this.editor = editor;
    this.container = container;
    this.activeTab = 'item'; // 'item', 'modifiers', 'material', 'world', 'scene'

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.el = document.createElement('div');
    this.el.className = 'electroDesigner-properties-panel';

    this.el.innerHTML = `
      <!-- Vertical Tab Bar -->
      <div class="properties-tabs-sidebar">
        <button class="properties-collapse-btn" type="button" data-properties-collapse aria-expanded="true" title="Minimize Properties">‹</button>
        <button class="prop-tab-btn active" data-tab="item" title="Item / Transform (N)">
          ${Icons.transform}
        </button>
        <button class="prop-tab-btn" data-tab="modifiers" title="Modifiers">
          ${Icons.wrench}
        </button>
        <button class="prop-tab-btn" data-tab="material" title="Material Properties">
          ${Icons.material}
        </button>
        <button class="prop-tab-btn" data-tab="world" title="World Properties">
          ${Icons.world}
        </button>
        <button class="prop-tab-btn" data-tab="scene" title="Scene & Export">
          ${Icons.scene}
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="properties-content-area" id="properties-content">
        <!-- Injected dynamically -->
      </div>
    `;

    this.container.appendChild(this.el);
    this.contentEl = this.el.querySelector('#properties-content');
  }

  bindEvents() {
    const collapseButton = this.el.querySelector('[data-properties-collapse]');
    collapseButton.addEventListener('click', () => {
      const collapsed = this.el.classList.toggle('properties-collapsed');
      collapseButton.textContent = collapsed ? '›' : '‹';
      collapseButton.setAttribute('aria-expanded', String(!collapsed));
      collapseButton.title = collapsed ? 'Expand Properties' : 'Minimize Properties';
    });

    const tabs = this.el.querySelectorAll('.prop-tab-btn');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeTab = tab.dataset.tab;
        this.update();
      });
    });
  }

  update() {
    if (!this.contentEl) return;
    const active = this.editor.selectionManager.activeObject;

    switch (this.activeTab) {
      case 'item':
        this.renderItemTab(active);
        break;
      case 'modifiers':
        this.renderModifiersTab(active);
        break;
      case 'material':
        this.renderMaterialTab(active);
        break;
      case 'world':
        this.renderWorldTab();
        break;
      case 'scene':
        this.renderSceneTab();
        break;
    }
  }

  renderItemTab(active) {
    if (!active) {
      this.contentEl.innerHTML = `
        <div class="empty-properties-hint">
          <p>No active object selected</p>
          <span>Select an object to inspect and edit its transform.</span>
        </div>
      `;
      return;
    }

    const pos = active.position;
    const rot = active.rotation;
    const scale = active.scale;

    // Convert radians to degrees
    const rx = THREE.MathUtils.radToDeg(rot.x);
    const ry = THREE.MathUtils.radToDeg(rot.y);
    const rz = THREE.MathUtils.radToDeg(rot.z);

    // Calculate dimensions
    const box = new THREE.Box3().setFromObject(active);
    const size = box.getSize(new THREE.Vector3());

    this.contentEl.innerHTML = `
      <div class="prop-panel-title">Transform</div>
      
      <div class="prop-group">
        <label class="prop-group-title">Location</label>
        <div class="prop-axis-row">
          <div class="axis-input x"><span class="axis-badge">X</span><input type="number" step="0.1" id="tr-px" value="${pos.x.toFixed(3)}"></div>
          <div class="axis-input y"><span class="axis-badge">Y</span><input type="number" step="0.1" id="tr-py" value="${pos.y.toFixed(3)}"></div>
          <div class="axis-input z"><span class="axis-badge">Z</span><input type="number" step="0.1" id="tr-pz" value="${pos.z.toFixed(3)}"></div>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-group-title">Rotation (Deg)</label>
        <div class="prop-axis-row">
          <div class="axis-input x"><span class="axis-badge">X</span><input type="number" step="1" id="tr-rx" value="${rx.toFixed(1)}"></div>
          <div class="axis-input y"><span class="axis-badge">Y</span><input type="number" step="1" id="tr-ry" value="${ry.toFixed(1)}"></div>
          <div class="axis-input z"><span class="axis-badge">Z</span><input type="number" step="1" id="tr-rz" value="${rz.toFixed(1)}"></div>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-group-title">Scale</label>
        <div class="prop-axis-row">
          <div class="axis-input x"><span class="axis-badge">X</span><input type="number" step="0.1" id="tr-sx" value="${scale.x.toFixed(3)}"></div>
          <div class="axis-input y"><span class="axis-badge">Y</span><input type="number" step="0.1" id="tr-sy" value="${scale.y.toFixed(3)}"></div>
          <div class="axis-input z"><span class="axis-badge">Z</span><input type="number" step="0.1" id="tr-sz" value="${scale.z.toFixed(3)}"></div>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-group-title">Dimensions</label>
        <div class="dimensions-display">
          <span>X: ${size.x.toFixed(2)}m</span>
          <span>Y: ${size.y.toFixed(2)}m</span>
          <span>Z: ${size.z.toFixed(2)}m</span>
        </div>
      </div>
      ${active.userData?.voltageSource ? `
        <div class="prop-group">
          <label class="prop-group-title" for="circuit-voltage">Source Voltage (V)</label>
          <div class="axis-input"><input type="number" id="circuit-voltage" min="-1000" max="1000" step="0.1" value="${Number(active.userData.voltage ?? 5)}"></div>
        </div>
      ` : ''}
      ${Number(active.userData?.resistanceOhms) > 0 ? `
        <div class="prop-group">
          <label class="prop-group-title" for="circuit-resistance">Resistance (Ω)</label>
          <div class="axis-input"><input type="number" id="circuit-resistance" min="0.01" max="1000000000" step="1" value="${Number(active.userData.resistanceOhms)}"></div>
        </div>
      ` : ''}
    `;

    // Bind inputs
    const syncTransform = () => {
      const px = parseFloat(this.contentEl.querySelector('#tr-px').value) || 0;
      const py = parseFloat(this.contentEl.querySelector('#tr-py').value) || 0;
      const pz = parseFloat(this.contentEl.querySelector('#tr-pz').value) || 0;
      active.position.set(px, py, pz);

      const drx = parseFloat(this.contentEl.querySelector('#tr-rx').value) || 0;
      const dry = parseFloat(this.contentEl.querySelector('#tr-ry').value) || 0;
      const drz = parseFloat(this.contentEl.querySelector('#tr-rz').value) || 0;
      active.rotation.set(
        THREE.MathUtils.degToRad(drx),
        THREE.MathUtils.degToRad(dry),
        THREE.MathUtils.degToRad(drz)
      );

      const sx = parseFloat(this.contentEl.querySelector('#tr-sx').value) || 1;
      const sy = parseFloat(this.contentEl.querySelector('#tr-sy').value) || 1;
      const sz = parseFloat(this.contentEl.querySelector('#tr-sz').value) || 1;
      active.scale.set(sx, sy, sz);

      this.editor.selectionManager.updateSelectionVisuals();
    };

    this.contentEl.querySelectorAll('input[id^="tr-"]').forEach((input) => {
      input.addEventListener('input', syncTransform);
    });

    const voltageInput = this.contentEl.querySelector('#circuit-voltage');
    if (voltageInput) {
      voltageInput.addEventListener('input', () => {
        const voltage = Number(voltageInput.value);
        if (!Number.isFinite(voltage)) return;
        active.userData.voltage = THREE.MathUtils.clamp(voltage, -1000, 1000);
        active.name = `Voltage Source (${active.userData.voltage} V)`;
      });
    }

    const resistanceInput = this.contentEl.querySelector('#circuit-resistance');
    if (resistanceInput) {
      resistanceInput.addEventListener('input', () => {
        const resistance = Number(resistanceInput.value);
        if (!Number.isFinite(resistance) || resistance <= 0) return;
        active.userData.resistanceOhms = resistance;
        active.name = `Resistor (${resistance} Ω)`;
      });
    }
  }

  renderModifiersTab(active) {
    if (!active || !active.isMesh) {
      this.contentEl.innerHTML = `
        <div class="empty-properties-hint">
          <p>No mesh object selected</p>
          <span>Modifiers can only be added to mesh geometries.</span>
        </div>
      `;
      return;
    }

    const mods = this.editor.modifierManager.getModifiers(active);

    let html = `
      <div class="prop-panel-title">Modifiers</div>

      <div class="add-modifier-row">
        <select id="select-add-modifier">
          <option value="" disabled selected>+ Add Modifier...</option>
          <option value="subdivision">Subdivision Surface</option>
          <option value="wireframe">Wireframe</option>
          <option value="mirror">Mirror</option>
          <option value="array">Array</option>
        </select>
      </div>

      <div class="modifiers-list">
    `;

    if (mods.length === 0) {
      html += `<div class="no-modifiers-hint">No modifiers on this mesh.</div>`;
    } else {
      mods.forEach((mod) => {
        html += `
          <div class="modifier-card" data-mod-id="${mod.id}">
            <div class="modifier-card-header">
              <span class="modifier-card-title">${Icons.wrench} ${mod.name}</span>
              <div class="modifier-header-actions">
                <button class="btn-mod-apply" data-mod-id="${mod.id}">Apply</button>
                <button class="btn-mod-remove" data-mod-id="${mod.id}" title="Remove">${Icons.trash}</button>
              </div>
            </div>
            <div class="modifier-card-body">
        `;

        if (mod.type === 'subdivision') {
          html += `
            <div class="prop-row">
              <label>Levels:</label>
              <input type="range" min="1" max="2" value="${mod.params.levels}" class="input-subdiv-level" data-mod-id="${mod.id}">
              <span>${mod.params.levels}</span>
            </div>
          `;
        } else if (mod.type === 'mirror') {
          html += `
            <div class="prop-row">
              <label>Axis:</label>
              <select class="select-mirror-axis" data-mod-id="${mod.id}">
                <option value="X" ${mod.params.axis === 'X' ? 'selected' : ''}>X</option>
                <option value="Y" ${mod.params.axis === 'Y' ? 'selected' : ''}>Y</option>
                <option value="Z" ${mod.params.axis === 'Z' ? 'selected' : ''}>Z</option>
              </select>
            </div>
          `;
        } else if (mod.type === 'array') {
          html += `
            <div class="prop-row">
              <label>Count:</label>
              <input type="number" min="2" max="6" value="${mod.params.count}" class="input-array-count" data-mod-id="${mod.id}">
            </div>
            <div class="prop-row">
              <label>Offset X:</label>
              <input type="number" step="0.5" value="${mod.params.offsetX}" class="input-array-offset" data-mod-id="${mod.id}">
            </div>
          `;
        } else if (mod.type === 'wireframe') {
          html += `<div class="prop-row"><span>Wireframe Cage Active</span></div>`;
        }

        html += `</div></div>`;
      });
    }

    html += `</div>`;
    this.contentEl.innerHTML = html;

    // Events
    const addSelect = this.contentEl.querySelector('#select-add-modifier');
    addSelect.addEventListener('change', (e) => {
      const type = e.target.value;
      if (type) {
        this.editor.modifierManager.addModifier(active, type);
        this.update();
      }
    });

    this.contentEl.querySelectorAll('.btn-mod-apply').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.editor.modifierManager.applyModifier(active, btn.dataset.modId);
        this.update();
      });
    });

    this.contentEl.querySelectorAll('.btn-mod-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.editor.modifierManager.removeModifier(active, btn.dataset.modId);
        this.update();
      });
    });

    this.contentEl.querySelectorAll('.input-subdiv-level').forEach((input) => {
      input.addEventListener('change', (e) => {
        this.editor.modifierManager.updateModifierParam(
          active,
          input.dataset.modId,
          'levels',
          parseInt(e.target.value)
        );
        this.update();
      });
    });

    this.contentEl.querySelectorAll('.select-mirror-axis').forEach((select) => {
      select.addEventListener('change', (e) => {
        this.editor.modifierManager.updateModifierParam(
          active,
          select.dataset.modId,
          'axis',
          e.target.value
        );
        this.update();
      });
    });

    this.contentEl.querySelectorAll('.input-array-count').forEach((input) => {
      input.addEventListener('change', (e) => {
        this.editor.modifierManager.updateModifierParam(
          active,
          input.dataset.modId,
          'count',
          parseInt(e.target.value)
        );
        this.update();
      });
    });

    this.contentEl.querySelectorAll('.input-array-offset').forEach((input) => {
      input.addEventListener('change', (e) => {
        this.editor.modifierManager.updateModifierParam(
          active,
          input.dataset.modId,
          'offsetX',
          parseFloat(e.target.value)
        );
        this.update();
      });
    });
  }

  renderMaterialTab(active) {
    if (!active || !active.isMesh) {
      this.contentEl.innerHTML = `
        <div class="empty-properties-hint">
          <p>No mesh object selected</p>
          <span>Materials apply to mesh surfaces.</span>
        </div>
      `;
      return;
    }

    const mat = active.material;
    const hexColor = mat.color ? '#' + mat.color.getHexString() : '#cccccc';
    const roughness = mat.roughness !== undefined ? mat.roughness : 0.5;
    const metalness = mat.metalness !== undefined ? mat.metalness : 0.1;
    const wireframe = !!mat.wireframe;

    this.contentEl.innerHTML = `
      <div class="prop-panel-title">Principled BSDF</div>

      <div class="prop-group">
        <label class="prop-group-title">Base Color</label>
        <div class="color-picker-row">
          <input type="color" id="mat-color-picker" value="${hexColor}">
          <span class="color-hex-label">${hexColor.toUpperCase()}</span>
        </div>
      </div>

      <div class="prop-group">
        <div class="slider-row">
          <label>Roughness</label>
          <input type="range" min="0" max="1" step="0.01" id="mat-roughness" value="${roughness}">
          <span id="label-roughness">${roughness.toFixed(2)}</span>
        </div>
      </div>

      <div class="prop-group">
        <div class="slider-row">
          <label>Metallic</label>
          <input type="range" min="0" max="1" step="0.01" id="mat-metallic" value="${metalness}">
          <span id="label-metallic">${metalness.toFixed(2)}</span>
        </div>
      </div>

      <div class="prop-group">
        <label class="checkbox-row">
          <input type="checkbox" id="mat-wireframe" ${wireframe ? 'checked' : ''}>
          <span>Wireframe Rendering</span>
        </label>
      </div>

      <div class="prop-group">
        <label class="prop-group-title">Normals / Shading</label>
        <div class="shading-toggle-btns">
          <button id="btn-shade-smooth" class="electroDesigner-action-btn">Shade Smooth</button>
          <button id="btn-shade-flat" class="electroDesigner-action-btn">Shade Flat</button>
        </div>
      </div>
    `;

    // Events
    const colorPicker = this.contentEl.querySelector('#mat-color-picker');
    colorPicker.addEventListener('input', (e) => {
      mat.color.set(e.target.value);
      this.contentEl.querySelector('.color-hex-label').textContent = e.target.value.toUpperCase();
    });

    const roughInput = this.contentEl.querySelector('#mat-roughness');
    roughInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      mat.roughness = val;
      this.contentEl.querySelector('#label-roughness').textContent = val.toFixed(2);
    });

    const metalInput = this.contentEl.querySelector('#mat-metallic');
    metalInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      mat.metalness = val;
      this.contentEl.querySelector('#label-metallic').textContent = val.toFixed(2);
    });

    const wireCheck = this.contentEl.querySelector('#mat-wireframe');
    wireCheck.addEventListener('change', (e) => {
      mat.wireframe = e.target.checked;
    });

    this.contentEl.querySelector('#btn-shade-smooth').addEventListener('click', () => {
      this.editor.setSmoothShading(true);
    });

    this.contentEl.querySelector('#btn-shade-flat').addEventListener('click', () => {
      this.editor.setSmoothShading(false);
    });
  }

  renderWorldTab() {
    const scene = this.editor.sceneManager.scene;
    const bgHex = '#' + scene.background.getHexString();
    const ambientLight = this.editor.sceneManager.ambientLight;
    const sunLight = this.editor.sceneManager.sunLight;
    const grid = this.editor.sceneManager.gridHelper;

    this.contentEl.innerHTML = `
      <div class="prop-panel-title">World & Environment</div>

      <div class="prop-group">
        <label class="prop-group-title">Background Color</label>
        <div class="color-picker-row">
          <input type="color" id="world-bg-picker" value="${bgHex}">
          <span class="color-hex-label">${bgHex.toUpperCase()}</span>
        </div>
      </div>

      <div class="prop-group">
        <div class="slider-row">
          <label>Ambient Light</label>
          <input type="range" min="0" max="2" step="0.05" id="world-ambient" value="${ambientLight.intensity}">
          <span>${ambientLight.intensity.toFixed(2)}</span>
        </div>
      </div>

      <div class="prop-group">
        <div class="slider-row">
          <label>Sun Light</label>
          <input type="range" min="0" max="4" step="0.1" id="world-sun" value="${sunLight.intensity}">
          <span>${sunLight.intensity.toFixed(1)}</span>
        </div>
      </div>

      <div class="prop-group">
        <label class="checkbox-row">
          <input type="checkbox" id="world-grid-toggle" ${grid.visible ? 'checked' : ''}>
          <span>Viewport Floor Grid</span>
        </label>
      </div>
    `;

    // Events
    this.contentEl.querySelector('#world-bg-picker').addEventListener('input', (e) => {
      scene.background.set(e.target.value);
    });

    this.contentEl.querySelector('#world-ambient').addEventListener('input', (e) => {
      ambientLight.intensity = parseFloat(e.target.value);
    });

    this.contentEl.querySelector('#world-sun').addEventListener('input', (e) => {
      sunLight.intensity = parseFloat(e.target.value);
    });

    this.contentEl.querySelector('#world-grid-toggle').addEventListener('change', (e) => {
      grid.visible = e.target.checked;
      this.editor.sceneManager.axisLineX.visible = e.target.checked;
      this.editor.sceneManager.axisLineY.visible = e.target.checked;
    });
  }

  renderSceneTab() {
    const stats = GeometryUtils.getMeshStatistics(this.editor.sceneManager.scene);
    const objectCount = this.editor.sceneManager.objectsList.filter(
      (o) => !o.name.startsWith('__')
    ).length;

    this.contentEl.innerHTML = `
      <div class="prop-panel-title">Scene Statistics & Output</div>

      <div class="prop-group">
        <div class="stats-table">
          <div class="stat-row"><span>Objects:</span><b>${objectCount}</b></div>
          <div class="stat-row"><span>Vertices:</span><b>${stats.vertices.toLocaleString()}</b></div>
          <div class="stat-row"><span>Faces:</span><b>${stats.faces.toLocaleString()}</b></div>
          <div class="stat-row"><span>Triangles:</span><b>${stats.triangles.toLocaleString()}</b></div>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-group-title">Export 3D Asset</label>
        <div class="export-buttons-stack">
          <button class="electroDesigner-action-btn primary" id="btn-exp-gltf">Export GLTF / GLB</button>
          <button class="electroDesigner-action-btn" id="btn-exp-obj">Export OBJ</button>
          <button class="electroDesigner-action-btn" id="btn-exp-stl">Export STL</button>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-group-title">Render Capture</label>
        <button class="electroDesigner-action-btn" id="btn-screenshot">Capture Viewport Image (PNG)</button>
      </div>
    `;

    // Events
    this.contentEl.querySelector('#btn-exp-gltf').addEventListener('click', () => {
      this.editor.exportModel('gltf');
    });

    this.contentEl.querySelector('#btn-exp-obj').addEventListener('click', () => {
      this.editor.exportModel('obj');
    });

    this.contentEl.querySelector('#btn-exp-stl').addEventListener('click', () => {
      this.editor.exportModel('stl');
    });

    this.contentEl.querySelector('#btn-screenshot').addEventListener('click', () => {
      this.editor.captureScreenshot();
    });
  }
}
