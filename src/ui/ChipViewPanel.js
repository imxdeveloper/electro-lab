import * as THREE from 'three';
import { DEFAULT_STACK_GAP, buildGdsModel, stackLayers } from '../utils/GdsSceneBuilder.js';
import { getFileExtension, isGdsFileName, isGltfFileName } from '../utils/GdsParser.js';

// Chip View is an Atom Lab clone kept read-only: files are imported for
// inspection only. Nothing loaded here can be selected, moved, or deleted from
// the viewport; use the panel buttons to remove an import.
export class ChipViewPanel {
  constructor(editor) {
    this.editor = editor;
    this.models = [];
    this.nextId = 1;
    this.dismissed = false;
    this.active = false;

    this.createDOM();
    this.bindEvents();
  }

  createDOM() {
    this.el = document.createElement('section');
    this.el.className = 'chip-view-panel';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Chip View panel');
    this.el.innerHTML = `
      <header>
        <strong>Chip View</strong>
        <button type="button" data-chipview-close aria-label="Close Chip View panel">×</button>
      </header>
      <div class="chip-view-body">
        <p class="chip-view-intro">Import a chip layout or model to inspect it in 3D. Chip View is view-only: imports cannot be selected or edited.</p>
        <button type="button" class="chip-view-import" data-chipview-import>Import 3D file (GDS / GDSII / GLTF / GLB)</button>
        <input type="file" data-chipview-input multiple accept=".gds,.gdsii,.glb,.gltf,.bin,.png,.jpg,.jpeg,.webp" hidden>
        <p class="chip-view-hint">For a .gltf with external .bin or textures, select every file of the model at once.</p>
        <div class="chip-view-models" data-chipview-models></div>
        <footer data-chipview-status>No chip imported yet.</footer>
        <p class="chip-view-notice">Preview only. GDSII boundaries and paths are extruded for viewing; structure references, array references, and labels are counted, not flattened. No DRC, LVS, or foundry signoff is performed.</p>
      </div>
    `;

    this.fileInput = this.el.querySelector('[data-chipview-input]');
    this.modelList = this.el.querySelector('[data-chipview-models]');
    this.statusEl = this.el.querySelector('[data-chipview-status]');
    document.body.appendChild(this.el);
    this.renderModels();
  }

  bindEvents() {
    this.el.querySelector('[data-chipview-import]').addEventListener('click', () => this.fileInput.click());
    this.el.querySelector('[data-chipview-close]').addEventListener('click', () => {
      this.dismissed = true;
      this.setActive(false);
    });

    this.fileInput.addEventListener('change', (event) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length) this.handleFiles(files);
    });

    this.modelList.addEventListener('click', (event) => {
      const bulk = event.target.closest('button[data-chipview-layers-action]');
      if (bulk) {
        const id = Number(bulk.closest('[data-chipview-model]').dataset.chipviewModel);
        this.setAllLayersVisible(id, bulk.dataset.chipviewLayersAction === 'show');
        return;
      }
      const layerToggle = event.target.closest('[data-chipview-layer]');
      if (layerToggle) {
        this.toggleLayer(layerToggle);
        return;
      }
      const stackToggle = event.target.closest('[data-chipview-stack]');
      if (stackToggle) {
        const model = this.modelFromEvent(event);
        if (!model) return;
        model.stack.stacked = stackToggle.checked;
        this.applyStack(model);
        return;
      }
      const button = event.target.closest('button[data-chipview-model-action]');
      if (!button) return;
      const id = Number(button.closest('[data-chipview-model]').dataset.chipviewModel);
      if (button.dataset.chipviewModelAction === 'focus') this.focusModel(id);
      if (button.dataset.chipviewModelAction === 'remove') this.removeModel(id);
    });

    this.modelList.addEventListener('change', (event) => {
      const gapInput = event.target.closest('[data-chipview-gap]');
      if (!gapInput) return;
      const model = this.modelFromEvent(event);
      if (!model) return;
      const gap = Number(gapInput.value);
      if (!Number.isFinite(gap) || gap <= 0) return;
      model.stack.gap = Math.min(gap, 3);
      gapInput.value = String(model.stack.gap);
      this.applyStack(model);
    });
  }

  modelFromEvent(event) {
    const row = event.target.closest('[data-chipview-model]');
    if (!row) return null;
    return this.models.find((entry) => entry.id === Number(row.dataset.chipviewModel)) ?? null;
  }

  applyStack(model) {
    stackLayers(model.object, { stacked: model.stack.stacked, gap: model.stack.gap });
    this.editor.sceneManager.render();
  }

  layerRows(model) {
    return model.object.children
      .filter((child) => child.isMesh && child.userData.chipViewLayer !== undefined)
      .map((mesh) => ({ mesh, layer: mesh.userData.chipViewLayer, datatype: mesh.userData.chipViewDatatype }))
      .sort((a, b) => b.mesh.userData.chipViewElements - a.mesh.userData.chipViewElements
        || a.layer - b.layer
        || a.datatype - b.datatype);
  }

  toggleLayer(toggle) {
    const id = Number(toggle.closest('[data-chipview-model]').dataset.chipviewModel);
    const model = this.models.find((entry) => entry.id === id);
    if (!model) return;
    const mesh = model.object.children.find((child) => child.name === toggle.dataset.chipviewLayer);
    if (!mesh) return;
    mesh.visible = !mesh.visible;
    toggle.setAttribute('aria-pressed', String(mesh.visible));
    this.editor.sceneManager.render();
  }

  setAllLayersVisible(id, visible) {
    const model = this.models.find((entry) => entry.id === id);
    if (!model) return;
    model.object.children.forEach((mesh) => { mesh.visible = visible; });
    const row = this.modelList.querySelector(`[data-chipview-model="${id}"]`);
    row?.querySelectorAll('[data-chipview-layer]').forEach((toggle) => {
      toggle.setAttribute('aria-pressed', String(visible));
    });
    this.editor.sceneManager.render();
  }

  setActive(active) {
    this.active = Boolean(active);
    if (active) this.dismissed = false;
    this.el.hidden = !this.active || this.dismissed;
  }

  openFilePicker() {
    this.fileInput.click();
  }

  setStatus(message, isError = false) {
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle('chip-view-status-error', isError);
  }

  async handleFiles(files) {
    const entry = files.find((file) => isGdsFileName(file.name) || isGltfFileName(file.name)) ?? files[0];
    if (!entry) return;
    const extension = getFileExtension(entry.name);
    if (isGdsFileName(entry.name)) {
      await this.loadGds(entry);
    } else if (isGltfFileName(entry.name)) {
      await this.loadGltf(entry, files);
    } else {
      this.setStatus(`Unsupported file ".${extension}". Choose a .gds, .gdsii, .gltf, or .glb file.`, true);
    }
  }

  async loadGds(file) {
    this.setStatus(`Reading ${file.name}…`);
    try {
      const buffer = await file.arrayBuffer();
      const { group, summary } = buildGdsModel(buffer);
      if (!group.children.length) {
        this.setStatus(`${file.name} has no drawable boundary, box, or path elements to display.`, true);
        return;
      }
      const shapeText = summary.truncated
        ? `${summary.polygons.toLocaleString()} of ${summary.drawablePolygons.toLocaleString()} shape(s)`
        : `${summary.polygons.toLocaleString()} shape(s)`;
      const sizeText = summary.unitsPlausible
        ? `${summary.widthMicrons.toFixed(1)} × ${summary.heightMicrons.toFixed(1)} µm`
        : `${summary.widthDbUnits.toLocaleString()} × ${summary.heightDbUnits.toLocaleString()} db units`;
      const warnings = [...summary.warnings];
      if (summary.truncated) {
        warnings.push(`Only the first ${summary.polygons.toLocaleString()} drawable elements are rendered; ${summary.truncated.toLocaleString()} more were skipped.`);
      }
      this.addModel({
        name: file.name.replace(/\.[^/.]+$/, ''),
        format: summary.format,
        object: group,
        detail: `${summary.layers} layer(s) · ${shapeText} · ${sizeText}`,
        stack: { stacked: true, gap: summary.stackGap ?? DEFAULT_STACK_GAP },
        warnings
      });
      this.setStatus(`${file.name} imported for viewing.`);
    } catch (error) {
      console.error(`Could not read ${file.name}:`, error);
      this.setStatus(`Could not read ${file.name}: ${error.message}`, true);
    }
  }

  async loadGltf(file, companionFiles) {
    this.setStatus(`Reading ${file.name}…`);
    // Companion files (buffers and textures) are served from object URLs so a
    // multi-file .gltf resolves without a server.
    const urls = new Map();
    const created = [];
    for (const companion of companionFiles) {
      const url = URL.createObjectURL(companion);
      urls.set(companion.name, url);
      urls.set(`./${companion.name}`, url);
      created.push(url);
    }
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        const base = decodeURIComponent(String(url).split('/').pop().split('?')[0]);
        return urls.get(base) ?? url;
      });
      const loader = new GLTFLoader(manager);
      const data = await file.arrayBuffer();
      const gltf = await new Promise((resolve, reject) => {
        loader.parse(data, '', resolve, reject);
      });
      const name = file.name.replace(/\.[^/.]+$/, '');
      gltf.scene.name = name;
      let meshes = 0;
      let triangles = 0;
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        meshes += 1;
        const index = node.geometry?.index;
        triangles += (index ? index.count : (node.geometry?.attributes?.position?.count ?? 0)) / 3;
      });
      this.addModel({
        name,
        format: file.name.toLowerCase().endsWith('.glb') ? 'GLB' : 'GLTF',
        object: gltf.scene,
        detail: `${meshes} mesh(es) · ~${Math.round(triangles).toLocaleString()} triangles`,
        urls: created
      });
      this.setStatus(`${file.name} imported for viewing.`);
    } catch (error) {
      created.forEach((url) => URL.revokeObjectURL(url));
      console.error(`Could not read ${file.name}:`, error);
      this.setStatus(`Could not read ${file.name}: ${error.message}`, true);
    }
  }

  addModel({ name, format, object, detail, urls = [], stack = { stacked: true, gap: DEFAULT_STACK_GAP }, warnings = [] }) {
    object.userData.chipViewModel = true;
    object.traverse((node) => {
      node.userData.chipViewModel = true;
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });

    const model = { id: this.nextId++, name, format, object, detail, urls, stack, warnings };
    this.models.push(model);
    this.editor.sceneManager.addObject(object);
    this.renderModels();
    this.focusModel(model.id);
    return model;
  }

  focusModel(id) {
    const model = this.models.find((entry) => entry.id === id);
    if (!model) return;
    const box = new THREE.Box3().setFromObject(model.object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const direction = new THREE.Vector3().copy(this.editor.sceneManager.activeCamera.position)
      .sub(this.editor.navigation.target)
      .normalize();
    if (direction.lengthSq() < 0.1) direction.set(0.8, 1, 0.8).normalize();
    this.editor.navigation.animateTo(center.clone().addScaledVector(direction, maxDim * 2.4), center);
  }

  removeModelByObject(object) {
    const model = this.models.find((entry) => entry.object === object);
    if (!model) return false;
    this.removeModel(model.id);
    return true;
  }

  removeModel(id) {
    const index = this.models.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    const [model] = this.models.splice(index, 1);
    this.editor.sceneManager.removeObject(model.object);
    model.object.traverse((node) => {
      if (node.isMesh) {
        node.geometry?.dispose?.();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material?.dispose?.());
      }
    });
    model.urls.forEach((url) => URL.revokeObjectURL(url));
    this.renderModels();
    this.setStatus(this.models.length ? `${model.name} removed.` : 'No chip imported yet.');
    this.editor.sceneManager.render();
  }

  clear() {
    [...this.models].forEach((model) => this.removeModel(model.id));
    this.setStatus('All chip imports removed.');
  }

  renderModels() {
    this.modelList.innerHTML = '';
    if (!this.models.length) {
      const empty = document.createElement('p');
      empty.className = 'chip-view-empty';
      empty.textContent = 'Imported chips appear here.';
      this.modelList.appendChild(empty);
      return;
    }
    for (const model of this.models) {
      const row = document.createElement('div');
      row.className = 'chip-view-model';
      row.dataset.chipviewModel = String(model.id);
      const layers = this.layerRows(model);
      const layerList = layers.map(({ mesh, layer, datatype }) => {
        const coverage = mesh.userData.chipViewCoverage ?? 0;
        const fullArea = mesh.userData.chipViewFullArea;
        const swatch = `#${mesh.material.color.getHexString()}`;
        return `
          <button type="button" class="chip-view-layer" data-chipview-layer="${mesh.name}"
                  aria-pressed="${mesh.visible}" title="${layer}/${datatype} · ${mesh.userData.chipViewElements} elements · ${Math.min(coverage * 100, 999).toFixed(0)}% of the drawing${fullArea ? ' · full-area fill or plate' : ''}">
            <span class="chip-view-layer-swatch" style="background:${swatch}"></span>
            <span>${layer}/${datatype}</span>
            ${fullArea ? '<em>fill</em>' : ''}
          </button>`;
      }).join('');
      row.innerHTML = `
        <div class="chip-view-model-info">
          <strong>${model.name}</strong>
          <span>${model.format}</span>
          <span>${model.detail}</span>
        </div>
        <div class="chip-view-model-actions">
          <button type="button" data-chipview-model-action="focus">Focus</button>
          <button type="button" data-chipview-model-action="remove">Remove</button>
        </div>
        ${layers.length > 1 ? `
          <div class="chip-view-stack">
            <label>
              <input type="checkbox" data-chipview-stack ${model.stack.stacked ? 'checked' : ''}>
              Stack layers by number
            </label>
            <label>
              Gap
              <input type="number" data-chipview-gap value="${model.stack.gap}" min="0.05" max="3" step="0.05" aria-label="Layer stack gap">
            </label>
          </div>` : ''}
        ${layers.length > 1 ? `
          <details class="chip-view-layers" ${layers.some((entry) => entry.mesh.userData.chipViewFullArea) ? 'open' : ''}>
            <summary>Layers (${layers.length})</summary>
            <div class="chip-view-layers-actions">
              <button type="button" data-chipview-layers-action="show">Show all</button>
              <button type="button" data-chipview-layers-action="hide">Hide all</button>
            </div>
            <div class="chip-view-layer-list">${layerList}</div>
          </details>` : ''}
        ${model.warnings?.length ? `<p class="chip-view-model-warning">${model.warnings.join(' ')}</p>` : ''}
      `;
      this.modelList.appendChild(row);
    }
  }
}