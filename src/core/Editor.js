import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

import { GeometryUtils } from '../utils/GeometryUtils.js';
import { SceneManager } from './SceneManager.js';
import { Navigation } from './Navigation.js';
import { SelectionManager } from './SelectionManager.js';
import { TransformManager } from './TransformManager.js';
import { HistoryManager } from './HistoryManager.js';
import { AnimationManager } from './AnimationManager.js';
import { ModifierManager } from './Modifiers.js';
import { EditModeManager, EditorMode, SelectionMode } from './EditModeManager.js';

import { TopHeader } from '../ui/TopHeader.js';
import { Toolbar } from '../ui/Toolbar.js';
import { Outliner } from '../ui/Outliner.js';
import { PropertiesPanel } from '../ui/PropertiesPanel.js';
import { NavigationGizmo } from '../ui/NavigationGizmo.js';
import { TimelineUI } from '../ui/TimelineUI.js';
import { AddMenuModal } from '../ui/AddMenuModal.js';
import { CompoundMenuModal } from '../ui/CompoundMenuModal.js';
import { ElectronFieldMenuModal } from '../ui/ElectronFieldMenuModal.js';
import { MagneticCompoundMenuModal } from '../ui/MagneticCompoundMenuModal.js';
import { PreferencesModal } from '../ui/PreferencesModal.js';
import { ShortcutsModal } from '../ui/ShortcutsModal.js';
import { CodeEditorPanel } from '../ui/CodeEditorPanel.js';
import { BoardPanel } from '../ui/BoardPanel.js';

export class Editor {
  constructor(rootContainer) {
    this.root = rootContainer;
    this.geometryUtils = GeometryUtils;
    this.workspaceMode = 'atoms';
    this.circuitDockVisible = false;

    this.sidebarVisible = true;
    this.lastMouseClientX = window.innerWidth / 2;
    this.lastMouseClientY = window.innerHeight / 2;

    this.initLayout();
    this.initComponents();
    this.codeEditorPanel = new CodeEditorPanel(this);
    this.boardPanel = new BoardPanel(this);
    this.bindGlobalEvents();
    this.startLoop();
  }

  setWorkspaceMode(mode) {
    if (!['atoms', 'circuits'].includes(mode) || this.workspaceMode === mode) return;
    this.setCircuitToolMode?.(null);
    this.workspaceMode = mode;
    this.sceneManager.updateWorkspaceBackground();
    this.root.classList.toggle('circuit-workspace', mode === 'circuits');
    this.topHeader?.updateWorkspaceMode(mode);
    this.addMenuModal?.setWorkspaceMode(mode);
    if (mode === 'circuits') {
      this.addMenuModal?.close();
      this.compoundMenuModal?.close();
      this.electronFieldMenuModal?.close();
      this.magneticCompoundMenuModal?.close();
    }
    const circuitMode = mode === 'circuits';
    if (circuitMode) {
      // Clear previously placed MOS logic gates and their attached connections.
      for (const object of [...this.sceneManager.objectsList]) {
        if (object.userData?.logicCircuit) this.sceneManager.removeObject(object);
      }
      // The annotation SVG sits above the canvas and captures left clicks.
      // Return to the selection tool so Circuit Lab canvas interactions work.
      this.toolbar?.selectTool('select');
      this.toolbar?.updateActiveButton('select');
      // Enter Circuit Lab with its tool panel restored, regardless of F2 state.
      this.circuitDockVisible = true;
      this.circuitDock.classList.remove('minimized');
      const dockToggle = this.circuitDock.querySelector('.circuit-collapse-all');
      dockToggle?.setAttribute('aria-expanded', 'true');
      if (dockToggle) dockToggle.textContent = '-';
      this.circuitDock.querySelectorAll('.circuit-section-toggle').forEach((button) => {
        button.setAttribute('aria-expanded', 'true');
        button.textContent = '-';
        const content = this.circuitDock.querySelector(`#${button.getAttribute('aria-controls')}`);
        if (content) content.hidden = false;
      });
      this._atomCameraState = {
        position: this.sceneManager.activeCamera.position.clone(),
        up: this.sceneManager.activeCamera.up.clone(),
        target: this.navigation.target.clone()
      };
      this.selectionManager.clearSelection();
    }
    for (const object of this.sceneManager.objectsList) {
      object.visible = circuitMode ? Boolean(object.userData?.circuitComponent) : !object.userData?.circuitComponent;
    }
    this.sceneManager.gridHelper.visible = true;
    this.sceneManager.axisLineX.visible = !circuitMode;
    this.sceneManager.axisLineY.visible = !circuitMode;
    this.sceneManager.cursorGroup.visible = !circuitMode;
    if (circuitMode) {
      const camera = this.sceneManager.activeCamera;
      camera.position.set(0, 24, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, 0, 0);
      this.navigation.target.set(0, 0, 0);
      this.navigation.updateSphericalFromCamera();
    } else if (this._atomCameraState) {
      const camera = this.sceneManager.activeCamera;
      camera.position.copy(this._atomCameraState.position);
      camera.up.copy(this._atomCameraState.up);
      camera.lookAt(this._atomCameraState.target);
      this.navigation.target.copy(this._atomCameraState.target);
      this.navigation.updateSphericalFromCamera();
      this._atomCameraState = null;
    }
    this.circuitDock.classList.toggle('active', this.circuitDockVisible);
    this.circuitDock.classList.toggle('circuit-mode-active', circuitMode);
    this.circuitDock.style.display = this.circuitDockVisible ? 'block' : 'none';
    const dockMode = this.circuitDock.querySelector('select');
    if (dockMode) dockMode.value = mode;
    this.updateHUDText();
    requestAnimationFrame(() => {
      this.sceneManager.onResize();
      this.sceneManager.render();
      this.navGizmo?.render();
    });
  }

  initLayout() {
    this.root.className = 'electroDesigner-app-container';

    // Layout hierarchy:
    // Header (Top)
    // Main Workspace (Middle):
    //   Left: Toolbar
    //   Center: Viewport (Canvas + HUD overlays + Nav Gizmo)
    //   Right: Sidebar (Outliner on top, Properties on bottom)
    // Footer: Timeline (Bottom)

    this.workspace = document.createElement('div');
    this.workspace.className = 'electroDesigner-workspace';

    // Viewport Container
    this.viewportEl = document.createElement('div');
    this.viewportEl.className = 'electroDesigner-viewport';

    // Viewport Info Overlay (Top Left)
    this.infoOverlay = document.createElement('div');
    this.infoOverlay.className = 'electroDesigner-viewport-info';
    this.infoOverlay.innerHTML = `
      <div class="view-cam-text" id="hud-cam-text">User Perspective</div>
      <div class="view-obj-text" id="hud-obj-text">(1) Collection | Cube</div>
    `;
    this.viewportEl.appendChild(this.infoOverlay);

    // Modal Transform HUD Overlay (Top Center / Floating)
    this.transformHud = document.createElement('div');
    this.transformHud.className = 'electroDesigner-transform-hud';
    this.transformHud.style.display = 'none';
    this.viewportEl.appendChild(this.transformHud);

    this.circuitDock = document.createElement('div');
    this.circuitDock.className = 'circuit-dock';
    this.circuitDock.innerHTML = `
      <div class="circuit-dock-heading">
        <div class="circuit-dock-title">Lab Switcher</div>
        <button class="circuit-collapse-all" type="button" aria-expanded="true" title="Minimize lab panel">âˆ’</button>
      </div>
      <div class="circuit-dock-content">
        <section class="circuit-section">
          <h2><span>Workspace</span><button class="circuit-section-toggle" type="button" aria-expanded="true" aria-controls="circuit-workspace-controls" title="Minimize workspace controls">âˆ’</button></h2>
          <label id="circuit-workspace-controls" class="circuit-mode-control">
            <select aria-label="Workspace mode"><option value="circuits">Circuit Lab</option><option value="atoms" selected>Atom Lab</option></select>
          </label>
        </section>
        <section class="circuit-section circuit-only-section">
          <h2><span>Components</span><button class="circuit-section-toggle" type="button" aria-expanded="true" aria-controls="circuit-component-controls" title="Minimize components">âˆ’</button></h2>
          <div class="circuit-tools" id="circuit-component-controls" aria-label="Circuit components">
            <button data-circuit="battery">ï¼‹ Battery</button>
            <button data-circuit="voltageSource">V Source</button>
            <button data-circuit="resistor">ï¼‹ Resistor</button>
            <button data-circuit="led">ï¼‹ LED</button>
            <button data-circuit-demo="led">Build LED Circuit</button>
            <button data-circuit="switch">ï¼‹ Switch</button>
            <button data-circuit="wire">ï¼‹ Wire</button>
            <button data-circuit="pmosMosfet">P-Channel MOSFET</button>
            <button data-circuit="nmosMosfet">N-Channel MOSFET</button>
            <button data-circuit="npnTransistor">NPN Transistor</button>
            <button data-circuit="capacitor">Capacitor</button>
            <button data-circuit="diode">Diode</button>
            <button data-circuit="inductor">Inductor</button>
            <button data-circuit="ground">Ground</button>
            <button class="circuit-tool-button" data-circuit-tool="selectObjects">Select objects</button>
            <button class="circuit-tool-button" data-circuit-tool="placeNode">＋ Place connection point</button>
            <button class="circuit-tool-button" data-circuit-tool="connectNodes">Connect two points</button>
            <button class="circuit-delete" data-circuit-delete>Delete selected</button>
          </div>
        </section>
        <section class="circuit-section circuit-only-section">
          <h2><span>Controls</span><button class="circuit-section-toggle" type="button" aria-expanded="true" aria-controls="circuit-hint" title="Minimize controls">âˆ’</button></h2>
          <button class="circuit-save-model" type="button" data-circuit-save-model>Save 3D circuit (GLB)</button>
          <div class="circuit-tool-status" data-circuit-tool-status>Connection tools are off.</div>
          <div class="circuit-hint" id="circuit-hint">Shift + A to add parts<br>Shift-click two terminals, then F to join them straight<br>Select one terminal, point into the scene, then Shift + F to add and connect another<br>Close the V+ to V− loop to light wires and show estimated current (+ to −)<br>Set resistor ohms in Properties to update the current estimate<br>F2 show / hide this panel</div>
        </section>
      </div>
    `;
    // Place the toolbox above the renderer and editor panels so it remains
    // visible when Circuit Lab takes over the viewport.
    document.body.appendChild(this.circuitDock);

    this.designPanel = document.createElement('section');
    this.designPanel.className = 'circuit-design-panel';
    this.designPanel.hidden = true;
    this.designPanel.innerHTML = `
      <header><strong>Design Library</strong><button type="button" data-design-close aria-label="Close">×</button></header>
      <p>Press Shift + L to save the selected object as a reusable item. Save a full circuit layout below. Press F3 to toggle this panel.</p>
      <div class="design-save-row"><input type="text" maxlength="48" placeholder="Item or design name" aria-label="Item or design name"><button type="button" data-design-save>Save layout</button></div>
      <button class="design-arrange" type="button" data-design-arrange>Arrange current items</button>
      <div class="design-item-list" data-design-list></div>
    `;
    document.body.appendChild(this.designPanel);

    // Right Sidebar Container
    this.sidebarEl = document.createElement('div');
    this.sidebarEl.className = 'electroDesigner-sidebar';

    this.workspace.appendChild(this.viewportEl);
    this.workspace.appendChild(this.sidebarEl);
    this.root.appendChild(this.workspace);

    this.sidebarToggle = document.createElement('button');
    this.sidebarToggle.className = 'sidebar-visibility-toggle';
    this.sidebarToggle.type = 'button';
    this.sidebarToggle.textContent = '‹';
    this.sidebarToggle.setAttribute('aria-expanded', 'true');
    this.sidebarToggle.title = 'Minimize sidebar';
    this.sidebarToggle.addEventListener('click', () => {
      this.setSidebarVisible(!this.sidebarVisible);
    });
    this.root.appendChild(this.sidebarToggle);

    this.domElement = this.viewportEl;
  }

  initComponents() {
    // 1. Core Scene & Render
    this.sceneManager = new SceneManager(this.viewportEl, this);

    // 2. Navigation with Emulate 3 Button Mouse enabled
    this.navigation = new Navigation(
      this.sceneManager.activeCamera,
      this.sceneManager.renderer.domElement,
      this.sceneManager
    );

    // 3. Selection
    this.selectionManager = new SelectionManager(
      this.sceneManager,
      this.navigation,
      this.sceneManager.renderer.domElement
    );

    // 4. Transform (Gizmo + G/R/S modals)
    this.transformManager = new TransformManager(
      this.sceneManager,
      this.navigation,
      this.selectionManager,
      this.sceneManager.renderer.domElement,
      this.transformHud,
      this
    );
    this.selectionManager.transformManager = this.transformManager;

    // 5. History (Undo / Redo)
    this.historyManager = new HistoryManager(this);

    // 6. Animation
    this.animationManager = new AnimationManager(this.sceneManager, this.selectionManager);

    // 7. Modifiers
    this.modifierManager = new ModifierManager(this.sceneManager, this);

    // 8. Edit Mode
    this.editModeManager = new EditModeManager(this);

    // 9. UI Components
    this.topHeader = new TopHeader(this, this.root);
    this.toolbar = new Toolbar(this, this.workspace);
    this.outliner = new Outliner(this, this.sidebarEl);
    this.propertiesPanel = new PropertiesPanel(this, this.sidebarEl);
    this.navGizmo = new NavigationGizmo(this, this.viewportEl);
    this.timelineUI = new TimelineUI(this, this.root);
    this.addMenuModal = new AddMenuModal(this);
    this.compoundMenuModal = new CompoundMenuModal(this);
    this.electronFieldMenuModal = new ElectronFieldMenuModal(this);
    this.magneticCompoundMenuModal = new MagneticCompoundMenuModal(this);
    this.preferencesModal = new PreferencesModal(this);
    this.shortcutsModal = new ShortcutsModal();

    // Link callbacks
    this.selectionManager.onSelectionChange = (selectedList, activeObj) => {
      this.transformManager.updateAttachedObject(activeObj);
      this.outliner.update();
      this.propertiesPanel.update();
      this.timelineUI.updateKeyframeMarkers();
      this.updateHUDText();
    };

    this.sceneManager.onSceneChanged = () => {
      this.outliner.update();
      this.propertiesPanel.update();
      this.updateHUDText();
    };

    this.sceneManager.onCameraChanged = (cam, isOrtho) => {
      this.navigation.camera = cam;
      this.transformManager.gizmo.camera = cam;
      this.navGizmo.render();
      this.updateHUDText();
    };

    this.transformManager.onTransformChange = () => {
      this.propertiesPanel.update();
    };

    this.onModeChanged = (mode) => {
      this.topHeader.updateMode(mode);
      this.toolbar.setMode(mode);
      this.updateHUDText();
    };

    this.onSelectionModeChanged = (selMode) => {
      this.toolbar.updateSelectionModeButton(selMode);
      this.updateHUDText();
    };

    this.onEditSelectionChanged = (info) => {
      this.updateHUDText();
    };

    // Initial sync
    this.outliner.update();
    this.propertiesPanel.update();
    this.updateHUDText();
  }

  bindGlobalEvents() {
    window.addEventListener('keydown', (event) => {
      if (this.workspaceMode !== 'circuits' || event.code !== 'KeyF' || event.ctrlKey || event.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const terminals = [...this.selectionManager.selectedObjects].filter((object) =>
        object.userData?.circuitNodeId && (object.userData?.terminalOwnerId || object.userData?.isUserTerminal)
      );
      if (event.shiftKey) {
        if (terminals.length !== 1) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const target = this.getCircuitPlacementTarget(this.lastMouseClientX, this.lastMouseClientY);
        if (!target) {
          this.circuitDock.querySelector('[data-circuit-tool-status]').textContent = 'Move the pointer into the scene to place the new terminal.';
          return;
        }
        const terminalData = { isUserTerminal: true, terminalLabel: 'T' };
        if (target.owner) {
          terminalData.terminalOwnerId = target.owner.uuid;
          terminalData.terminalLocalOffset = target.localOffset;
        }
        const newTerminal = this.sceneManager.createCircuitConnectionPoint(target.position, terminalData);
        newTerminal.name = 'User Terminal';
        const wire = this.sceneManager.createCircuitConnection(terminals[0], newTerminal);
        if (wire) {
          this.selectionManager.select(wire, false);
          this.circuitDock.querySelector('[data-circuit-tool-status]').textContent = 'New terminal created at the pointer and connected.';
        }
        return;
      }
      if (terminals.length !== 2) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const wire = this.sceneManager.createCircuitConnection(terminals[0], terminals[1]);
      if (wire) {
        this.selectionManager.select(wire, false);
        this.circuitDock.querySelector('[data-circuit-tool-status]').textContent = 'Terminals joined with a straight wire.';
      } else {
        this.circuitDock.querySelector('[data-circuit-tool-status]').textContent = 'Those terminals are already connected.';
      }
    }, true);

    window.addEventListener('keydown', (event) => {
      if (this.workspaceMode === 'circuits' && event.code === 'KeyQ' && event.shiftKey && !event.ctrlKey && !event.altKey) {
        if (event.repeat || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.setCircuitToolMode(null);
        this.sceneManager.createLedDemoCircuit();
        return;
      }
      if (event.code !== 'F2') return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      event.preventDefault();
      this.circuitDockVisible = !this.circuitDockVisible;
      this.circuitDock.style.display = this.circuitDockVisible ? 'block' : 'none';
      this.circuitDock.classList.toggle('active', this.circuitDockVisible);
    });
    this.designPanel.querySelector('[data-design-close]').addEventListener('click', () => {
      this.designPanel.hidden = true;
    });
    this.designPanel.querySelector('[data-design-save]').addEventListener('click', () => this.saveCircuitDesign());
    this.designPanel.querySelector('[data-design-arrange]').addEventListener('click', () => this.arrangeCircuitItems());
    this.designPanel.querySelector('[data-design-list]').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-design-action]');
      if (!button) return;
      const designs = this.getSavedCircuitDesigns();
      const index = Number(button.dataset.index);
      const design = designs[index];
      if (!design) return;
      if (button.dataset.designAction === 'load') this.loadCircuitDesign(design);
      if (button.dataset.designAction === 'add') this.addLibraryItem(design);
      if (button.dataset.designAction === 'rename') this.startRenameSavedDesign(index, design);
      if (button.dataset.designAction === 'rename-save') this.commitRenameSavedDesign(index, button.closest('.design-list-row')?.querySelector('input')?.value);
      if (button.dataset.designAction === 'rename-cancel') this.renderCircuitDesignList();
      if (button.dataset.designAction === 'delete') {
        designs.splice(index, 1);
        this.storeCircuitDesigns(designs);
        this.renderCircuitDesignList();
      }
    });
    this.designPanel.querySelector('input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.saveCircuitDesign();
    });
    this.renderCircuitDesignList();
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'F3' || event.repeat || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      event.preventDefault();
      this.designPanel.hidden = !this.designPanel.hidden;
      if (!this.designPanel.hidden) this.renderCircuitDesignList();
    });
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyL' || !event.shiftKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      event.preventDefault();
      this.saveSelectedLibraryItem();
    });
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyB' || !event.shiftKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      event.preventDefault();
      this.sceneManager.createRightHandRuleCopperConductor();
    });
    this.circuitDock.querySelectorAll('[data-circuit]').forEach((button) => {
      button.addEventListener('click', () => this.sceneManager.createCircuitComponent(button.dataset.circuit));
    });
    this.circuitDock.querySelector('[data-circuit-demo="led"]').addEventListener('click', () => {
      this.setCircuitToolMode(null);
      this.sceneManager.createLedDemoCircuit();
    });
    this.circuitDock.querySelector('[data-circuit-delete]').addEventListener('click', () => {
      for (const object of [...this.selectionManager.selectedObjects]) this.sceneManager.removeObject(object);
      this.selectionManager.clearSelection();
    });
    this.circuitDock.querySelector('[data-circuit-save-model]').addEventListener('click', () => this.exportCircuitModel());
    this.circuitDock.querySelectorAll('[data-circuit-tool]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = this.circuitToolMode === button.dataset.circuitTool ? null : button.dataset.circuitTool;
        this.setCircuitToolMode(mode);
      });
    });
    // Listen on the viewport wrapper so clicks still reach circuit picking when
    // an overlay (such as the annotation SVG) is layered over the renderer.
    this.viewportEl.addEventListener('pointerdown', (event) => this.handleCircuitToolPointerDown(event), true);
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && this.circuitToolMode) this.setCircuitToolMode(null);
    });
    this.circuitDock.querySelector('select').addEventListener('change', (event) => this.setWorkspaceMode(event.target.value));
    this.circuitDock.querySelectorAll('.circuit-section-toggle').forEach((button) => {
      button.addEventListener('click', () => {
        const content = this.circuitDock.querySelector(`#${button.getAttribute('aria-controls')}`);
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        button.textContent = expanded ? '+' : 'âˆ’';
        button.title = `${expanded ? 'Expand' : 'Minimize'} ${button.closest('h2').querySelector('span').textContent.toLowerCase()}`;
        content.hidden = expanded;
      });
    });
    this.circuitDock.querySelector('.circuit-collapse-all').addEventListener('click', (event) => {
      const button = event.currentTarget;
      const minimized = this.circuitDock.classList.toggle('minimized');
      button.setAttribute('aria-expanded', String(!minimized));
      button.textContent = minimized ? '+' : 'âˆ’';
      button.title = minimized ? 'Expand Circuit Lab panel' : 'Minimize Circuit Lab panel';
    });
    window.addEventListener('mousemove', (e) => {
      this.lastMouseClientX = e.clientX;
      this.lastMouseClientY = e.clientY;
    });

    // Keyboard 'N' toggles sidebar
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.code === 'KeyN' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        this.toggleSidebar();
      }
    });

    // Drag and Drop 3D files into viewport
    this.viewportEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.viewportEl.classList.add('drag-over');
    });

    this.viewportEl.addEventListener('dragleave', () => {
      this.viewportEl.classList.remove('drag-over');
    });

    this.viewportEl.addEventListener('drop', (e) => {
      e.preventDefault();
      this.viewportEl.classList.remove('drag-over');
      const file = e.dataTransfer.files?.[0];
      if (file) {
        this.importModelFile(file);
      }
    });
  }

  updateHUDText() {
    const camText = this.viewportEl.querySelector('#hud-cam-text');
    const objText = this.viewportEl.querySelector('#hud-obj-text');
    if (!camText || !objText) return;

    const isOrtho = this.sceneManager.isOrtho;
    const mode = this.editModeManager.mode;

    if (mode === EditorMode.EDIT) {
      const selInfo = this.editModeManager.getSelectionInfo();
      const selModeLabel = selInfo ? selInfo.mode : 'Vertex';
      camText.textContent = `[Edit Mode â€” ${selModeLabel}] User ${isOrtho ? 'Orthographic' : 'Perspective'}`;

      const active = this.selectionManager.activeObject;
      if (active && selInfo) {
        const stats = GeometryUtils.getMeshStatistics(active);
        objText.textContent = `${active.name} | Verts: ${stats.vertices} | Faces: ${stats.faces} | ${selModeLabel} Selected: ${selInfo.count}/${selInfo.total}`;
      } else if (active) {
        objText.textContent = `Collection | ${active.name}`;
      }
    } else {
      camText.textContent = `User ${isOrtho ? 'Orthographic' : 'Perspective'}`;

      const active = this.selectionManager.activeObject;
      if (active) {
        const stats = GeometryUtils.getMeshStatistics(active);
        objText.textContent = `Collection | ${active.name} (Verts: ${stats.vertices} | Faces: ${stats.faces})`;
      } else {
        objText.textContent = 'Collection | (None selected)';
      }
    }
  }

  setSidebarVisible(visible) {
    this.sidebarVisible = Boolean(visible);
    this.root.classList.toggle('sidebar-hidden', !this.sidebarVisible);
    this.sidebarEl.style.removeProperty('display');
    this.sidebarToggle.textContent = this.sidebarVisible ? '‹' : '›';
    this.sidebarToggle.setAttribute('aria-expanded', String(this.sidebarVisible));
    this.sidebarToggle.title = this.sidebarVisible ? 'Minimize sidebar' : 'Show sidebar';
    requestAnimationFrame(() => {
      this.sceneManager.onResize();
      this.sceneManager.render();
      this.navGizmo?.render();
    });
  }

  toggleSidebar() {
    this.setSidebarVisible(!this.sidebarVisible);
  }

  toggleToolbar() {
    this.toolbar.toggle();
    this.sceneManager.onResize();
  }

  setSmoothShading(isSmooth) {
    const active = this.selectionManager.activeObject;
    if (!active || !active.isMesh) return;

    if (isSmooth) {
      active.geometry.computeVertexNormals();
      active.material.flatShading = false;
    } else {
      active.material.flatShading = true;
    }
    active.material.needsUpdate = true;
  }

  importModelFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    if (ext === 'gltf' || ext === 'glb') {
      reader.onload = (e) => {
        const loader = new GLTFLoader();
        loader.parse(e.target.result, '', (gltf) => {
          const root = gltf.scene;
          root.name = file.name.replace(/\.[^/.]+$/, '');
          this.sceneManager.addObject(root);
          this.selectionManager.select(root, false);
          this.navigation.frameSelected();
        });
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === 'obj') {
      reader.onload = (e) => {
        const loader = new OBJLoader();
        const obj = loader.parse(e.target.result);
        obj.name = file.name.replace(/\.[^/.]+$/, '');
        this.sceneManager.addObject(obj);
        this.selectionManager.select(obj, false);
        this.navigation.frameSelected();
      };
      reader.readAsText(file);
    } else if (ext === 'stl') {
      reader.onload = (e) => {
        const loader = new STLLoader();
        const geom = loader.parse(e.target.result);
        const mat = new THREE.MeshStandardMaterial({ color: 0xd4d4d4, roughness: 0.5 });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.name = file.name.replace(/\.[^/.]+$/, '');
        this.sceneManager.addObject(mesh);
        this.selectionManager.select(mesh, false);
        this.navigation.frameSelected();
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert('Unsupported file format. Please upload .gltf, .glb, .obj, or .stl');
    }
  }

  exportModel(format) {
    const exportTargets = this.sceneManager.objectsList.filter(
      (o) => !o.name.startsWith('__')
    );
    const exportGroup = new THREE.Group();
    exportTargets.forEach((o) => exportGroup.add(o.clone()));

    if (format === 'gltf') {
      const exporter = new GLTFExporter();
      exporter.parse(
        exportGroup,
        (gltf) => {
          const output = JSON.stringify(gltf, null, 2);
          this.downloadBlob(new Blob([output], { type: 'application/json' }), 'scene.gltf');
        },
        (err) => console.error(err),
        { binary: false }
      );
    } else if (format === 'obj') {
      const exporter = new OBJExporter();
      const result = exporter.parse(exportGroup);
      this.downloadBlob(new Blob([result], { type: 'text/plain' }), 'scene.obj');
    } else if (format === 'stl') {
      const exporter = new STLExporter();
      const result = exporter.parse(exportGroup, { binary: true });
      this.downloadBlob(new Blob([result], { type: 'application/octet-stream' }), 'scene.stl');
    }
  }

  exportCircuitModel() {
    this.sceneManager.updateCircuitConnections();
    this.sceneManager.updateCircuitFlow(0);
    const circuitObjects = this.sceneManager.objectsList.filter((object) => object.userData?.circuitComponent);
    if (!circuitObjects.length) {
      alert('Add a circuit component before exporting the 3D circuit.');
      return;
    }

    const exportGroup = new THREE.Group();
    exportGroup.name = 'Electro Designer Circuit';
    circuitObjects.forEach((object) => exportGroup.add(object.clone()));
    const exporter = new GLTFExporter();
    exporter.parse(
      exportGroup,
      (output) => this.downloadBlob(new Blob([output], { type: 'model/gltf-binary' }), 'electroDesigner_circuit.glb'),
      (error) => {
        console.error('Circuit GLB export failed:', error);
        alert('Could not export the circuit as a 3D model. See the console for details.');
      },
      { binary: true }
    );
  }

  setCircuitToolMode(mode) {
    if (mode) {
      this.toolbar?.selectTool('select');
      this.toolbar?.updateActiveButton('select');
    }
    this.circuitToolMode = mode;
    this.pendingCircuitNode = null;
    this.circuitDock.querySelectorAll('[data-circuit-tool]').forEach((button) => {
      button.classList.toggle('active', button.dataset.circuitTool === mode);
    });
    const status = this.circuitDock.querySelector('[data-circuit-tool-status]');
    if (!mode) status.textContent = 'Connection tools are off.';
    else if (mode === 'selectObjects') status.textContent = 'Click an object to select it. Shift-click to add or remove it from the selection. Esc exits this tool.';
    else if (mode === 'placeNode') status.textContent = 'Click a part or empty grid to place a point. Esc cancels.';
    else status.textContent = 'Click one point, then another to connect them. Esc cancels.';
  }

  handleCircuitToolPointerDown(event) {
    if (this.workspaceMode !== 'circuits' || event.button !== 0 || event.altKey) return;
    if (!this.circuitToolMode || this.circuitToolMode === 'selectObjects') {
      const canvas = this.sceneManager.renderer.domElement;
      const rect = canvas.getBoundingClientRect();
      this.sceneManager.activeCamera.updateMatrixWorld();
      if (event.shiftKey) {
        const nearestTerminal = this.sceneManager.objectsList
          .filter((object) => object.visible && object.userData?.circuitNodeId)
          .map((object) => {
            const projected = object.position.clone().project(this.sceneManager.activeCamera);
            const x = rect.left + (projected.x + 1) * rect.width / 2;
            const y = rect.top + (1 - projected.y) * rect.height / 2;
            return { object, distanceSq: (x - event.clientX) ** 2 + (y - event.clientY) ** 2, depth: projected.z };
          })
          .filter((entry) => entry.depth >= -1 && entry.depth <= 1 && entry.distanceSq <= 18 ** 2)
          .sort((a, b) => a.distanceSq - b.distanceSq)[0];
        if (nearestTerminal) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.selectionManager.select(nearestTerminal.object, true);
          return;
        }
      } else {
        const mouse = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const terminalRaycaster = new THREE.Raycaster();
        terminalRaycaster.setFromCamera(mouse, this.sceneManager.activeCamera);
        const terminals = this.sceneManager.objectsList.filter((object) =>
          object.visible && object.userData?.circuitNodeId
        );
        const terminalHit = terminalRaycaster.intersectObjects(terminals, false)[0]?.object;
        if (terminalHit) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.selectionManager.select(terminalHit, false);
          return;
        }
        const root = this.getCircuitSceneObjectAtPointer(event.clientX, event.clientY);
        if (root) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.selectionManager.select(root, false);
          return;
        }
      }
      // Let SelectionManager handle misses and ordinary empty-space deselection.
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const canvas = this.sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.sceneManager.activeCamera);

    if (this.circuitToolMode === 'placeNode') {
      const target = this.getCircuitPlacementTarget(event.clientX, event.clientY, raycaster);
      if (target) {
        const terminalData = target.owner
          ? { isUserTerminal: true, terminalLabel: 'T', terminalOwnerId: target.owner.uuid, terminalLocalOffset: target.localOffset }
          : {};
        this.sceneManager.createCircuitConnectionPoint(target.position, terminalData);
      }
      return;
    }

    const nodes = this.sceneManager.objectsList.filter((object) => object.userData?.circuitNodeId);
    const hit = raycaster.intersectObjects(nodes, false)[0]?.object;
    if (!hit) {
      const root = this.getCircuitSceneObjectAtPointer(event.clientX, event.clientY, raycaster);
      if (root) {
        this.selectionManager.select(root, event.shiftKey);
        this.circuitDock.querySelector('[data-circuit-tool-status]').textContent = `Selected ${root.name}. Click two connection points to connect, or press Esc to exit.`;
      } else {
        this.circuitDock.querySelector('[data-circuit-tool-status]').textContent = 'Click an object to select it, or click a connection point to connect.';
      }
      return;
    }
    if (!this.pendingCircuitNode) {
      this.pendingCircuitNode = hit;
      this.circuitDock.querySelector('[data-circuit-tool-status]').textContent = 'First point selected. Click the second point.';
      return;
    }
    if (this.pendingCircuitNode !== hit) this.sceneManager.createCircuitConnection(this.pendingCircuitNode, hit);
    this.pendingCircuitNode = null;
    this.circuitDock.querySelector('[data-circuit-tool-status]').textContent = 'Connected. Click two more points or press Esc.';
  }

  getCircuitSceneObjectAtPointer(clientX, clientY, raycaster = null) {
    const canvas = this.sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.sceneManager.activeCamera.updateMatrixWorld(true);
    this.sceneManager.scene.updateMatrixWorld(true);
    const activeRaycaster = raycaster || new THREE.Raycaster();
    if (!raycaster) activeRaycaster.setFromCamera(mouse, this.sceneManager.activeCamera);

    const candidates = this.sceneManager.objectsList.filter((object) =>
      object.visible && object.userData?.circuitComponent && !object.userData?.circuitNodeId && !object.name.startsWith('__')
    );
    const hit = activeRaycaster.intersectObjects(candidates, true)[0]?.object;
    if (hit) {
      let root = hit;
      while (root.parent && root.parent !== this.sceneManager.scene) root = root.parent;
      return root;
    }

    // Bounding-box fallback makes thin or finely detailed circuit parts easier to pick.
    const picks = [];
    const worldBounds = new THREE.Box3();
    const corner = new THREE.Vector3();
    for (const object of candidates) {
      worldBounds.setFromObject(object);
      if (worldBounds.isEmpty()) continue;
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      for (let x = 0; x < 2; x++) {
        for (let y = 0; y < 2; y++) {
          for (let z = 0; z < 2; z++) {
            corner.set(x ? worldBounds.max.x : worldBounds.min.x, y ? worldBounds.max.y : worldBounds.min.y, z ? worldBounds.max.z : worldBounds.min.z)
              .project(this.sceneManager.activeCamera);
            min.x = Math.min(min.x, corner.x);
            min.y = Math.min(min.y, corner.y);
            min.z = Math.min(min.z, corner.z);
            max.x = Math.max(max.x, corner.x);
            max.y = Math.max(max.y, corner.y);
            max.z = Math.max(max.z, corner.z);
          }
        }
      }
      const left = rect.left + (min.x + 1) * rect.width / 2;
      const right = rect.left + (max.x + 1) * rect.width / 2;
      const top = rect.top + (1 - max.y) * rect.height / 2;
      const bottom = rect.top + (1 - min.y) * rect.height / 2;
      if (max.z >= -1 && min.z <= 1 && clientX >= left - 6 && clientX <= right + 6 && clientY >= top - 6 && clientY <= bottom + 6) {
        const area = Math.max(1, (right - left) * (bottom - top));
        picks.push({ object, area, depth: min.z });
      }
    }
    picks.sort((a, b) => a.depth - b.depth || a.area - b.area);
    return picks[0]?.object || null;
  }

  getCircuitPlacementTarget(clientX, clientY, raycaster = null) {
    const canvas = this.sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const activeRaycaster = raycaster || new THREE.Raycaster();
    if (!raycaster) activeRaycaster.setFromCamera(mouse, this.sceneManager.activeCamera);

    const components = this.sceneManager.objectsList.filter((object) =>
      object.userData?.circuitComponent && !object.userData?.circuitNodeId && !object.userData?.circuitConnection
    );
    const hit = activeRaycaster.intersectObjects(components, true)[0];
    if (hit) {
      const normal = hit.face?.normal
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : new THREE.Vector3(0, 1, 0);
      const position = hit.point.addScaledVector(normal, 0.07);
      let owner = hit.object;
      while (owner.parent && owner.parent !== this.sceneManager.scene) owner = owner.parent;
      owner.updateMatrixWorld(true);
      return { position, owner, localOffset: owner.worldToLocal(position.clone()).toArray() };
    }

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.68);
    const position = activeRaycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return position ? { position, owner: null, localOffset: null } : null;
  }

  getSavedCircuitDesigns() {
    try {
      const parsed = JSON.parse(localStorage.getItem('electroDesigner.circuitDesigns') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  storeCircuitDesigns(designs) {
    try {
      localStorage.setItem('electroDesigner.circuitDesigns', JSON.stringify(designs));
      return true;
    } catch {
      this.designPanel.querySelector('[data-design-list]').textContent = 'Could not save to browser storage.';
      return false;
    }
  }

  startRenameSavedDesign(index, design) {
    const row = this.designPanel.querySelector(`.design-list-row button[data-design-action="rename"][data-index="${index}"]`)?.closest('.design-list-row');
    if (!row) return;
    const info = row.querySelector('.design-list-info');
    const metadata = info.querySelector('span');
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 48;
    input.className = 'design-rename-input';
    input.setAttribute('aria-label', 'New item name');
    input.value = design.name || '';
    info.replaceChildren(input, metadata);
    const actions = row.querySelector('.design-list-actions');
    actions.replaceChildren();
    for (const [action, label] of [['rename-save', 'Save'], ['rename-cancel', 'Cancel']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.designAction = action;
      button.dataset.index = String(index);
      button.textContent = label;
      actions.appendChild(button);
    }
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.commitRenameSavedDesign(index, input.value);
      if (event.key === 'Escape') this.renderCircuitDesignList();
    });
    input.focus();
    input.select();
  }

  commitRenameSavedDesign(index, value) {
    const name = String(value || '').trim();
    if (!name) return;
    const designs = this.getSavedCircuitDesigns();
    if (!designs[index]) return;
    designs[index] = { ...designs[index], name };
    if (this.storeCircuitDesigns(designs)) this.renderCircuitDesignList();
  }

  renderCircuitDesignList() {
    const list = this.designPanel.querySelector('[data-design-list]');
    list.replaceChildren();
    const designs = this.getSavedCircuitDesigns();
    if (!designs.length) {
      const empty = document.createElement('div');
      empty.className = 'design-empty';
      empty.textContent = 'No saved designs yet.';
      list.appendChild(empty);
      return;
    }
    designs.forEach((design, index) => {
      const row = document.createElement('div');
      row.className = 'design-list-row';
      const info = document.createElement('div');
      info.className = 'design-list-info';
      const name = document.createElement('strong');
      name.textContent = design.name || `Design ${index + 1}`;
      const count = document.createElement('span');
      count.textContent = design.kind === 'library-item' ? `Saved item · ${design.type || 'object'}` : `${design.items?.length || 0} items`;
      info.append(name, count);
      const actions = document.createElement('div');
      actions.className = 'design-list-actions';
      const options = design.kind === 'library-item'
        ? [['add', 'Add'], ['rename', 'Edit'], ['delete', 'Delete']]
        : [['load', 'Load'], ['rename', 'Edit'], ['delete', 'Delete']];
      for (const [action, label] of options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.designAction = action;
        button.dataset.index = String(index);
        button.textContent = label;
        actions.appendChild(button);
      }
      row.append(info, actions);
      list.appendChild(row);
    });
  }

  saveCircuitDesign() {
    const input = this.designPanel.querySelector('input');
    const items = this.sceneManager.objectsList
      .filter((object) => object.userData?.circuitComponent && !object.userData?.circuitNodeId && !object.userData?.circuitConnection)
      .map((object) => ({
        type: object.userData.circuitComponent,
        name: object.name,
        position: object.position.toArray(),
        rotation: object.rotation.toArray(),
        scale: object.scale.toArray()
      }));
    if (!items.length) {
      input.setCustomValidity('Add circuit components before saving a design.');
      input.reportValidity();
      input.setCustomValidity('');
      return;
    }
    const designs = this.getSavedCircuitDesigns();
    designs.unshift({ name: input.value.trim() || `Circuit design ${designs.length + 1}`, savedAt: Date.now(), items });
    if (this.storeCircuitDesigns(designs)) {
      input.value = '';
      this.renderCircuitDesignList();
    }
  }

  saveSelectedLibraryItem() {
    const object = this.selectionManager.activeObject;
    if (!object || object.name.startsWith('__')) return;
    const input = this.designPanel.querySelector('input');
    try {
      const designs = this.getSavedCircuitDesigns();
      designs.unshift({
        kind: 'library-item',
        name: input.value.trim() || object.name || 'Saved item',
        type: object.userData?.circuitComponent || object.type || 'object',
        savedAt: Date.now(),
        objectData: object.toJSON()
      });
      if (this.storeCircuitDesigns(designs)) {
        input.value = '';
        this.designPanel.hidden = false;
        this.renderCircuitDesignList();
      }
    } catch (error) {
      console.error('Could not save the selected design item:', error);
    }
  }

  addLibraryItem(item) {
    if (!item?.objectData) return;
    try {
      const object = new THREE.ObjectLoader().parse(item.objectData);
      object.traverse((part) => { part.uuid = THREE.MathUtils.generateUUID(); });
      object.name = item.name || object.name;
      object.position.set(0, 0, 0);
      this.sceneManager.addObject(object);
      if (this.workspaceMode === 'circuits') object.visible = Boolean(object.userData?.circuitComponent);
      this.selectionManager.select(object, false);
      this.sceneManager.render();
    } catch (error) {
      console.error('Could not add the saved design item:', error);
    }
  }

  loadCircuitDesign(design) {
    // Saved layouts contain circuit components and their transforms. Connections
    // are omitted because they refer to live terminal IDs from the source scene.
    for (const object of [...this.sceneManager.objectsList]) {
      if (object.userData?.circuitComponent) this.sceneManager.removeObject(object);
    }
    for (const item of design.items || []) {
      const object = this.sceneManager.createCircuitComponent(item.type);
      if (!object) continue;
      object.name = item.name || object.name;
      if (item.position) object.position.fromArray(item.position);
      if (item.rotation) object.rotation.fromArray(item.rotation);
      if (item.scale) object.scale.fromArray(item.scale);
    }
    this.selectionManager.clearSelection();
    this.sceneManager.render();
  }

  arrangeCircuitItems() {
    const items = this.sceneManager.objectsList.filter((object) =>
      object.userData?.circuitComponent && !object.userData?.circuitNodeId && !object.userData?.circuitConnection
    );
    if (!items.length) return;
    const maxW = Math.max(...items.map((object) => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).x));
    const maxD = Math.max(...items.map((object) => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).z));
    const columns = Math.min(3, items.length);
    const rows = Math.ceil(items.length / columns);
    const spacingX = Math.max(4, maxW + 1.5);
    const spacingZ = Math.max(4, maxD + 1.5);
    items.forEach((object, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      object.position.set((column - (columns - 1) / 2) * spacingX, 0.68, (row - (rows - 1) / 2) * spacingZ);
    });
    this.sceneManager.render();
  }

  captureScreenshot() {
    this.sceneManager.render();
    const dataUrl = this.sceneManager.renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = this.workspaceMode === 'circuits' ? 'electroDesigner_circuit.png' : 'electroDesigner_render.png';
    link.click();
  }

  downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  startLoop() {
    let previousFrame = performance.now();
    const render = (now) => {
      this.sceneManager.updateAnimations((now - previousFrame) / 1000);
      previousFrame = now;
      this.sceneManager.render();
      this.navGizmo.render();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }
}
