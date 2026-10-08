import { Icons } from '../utils/Icons.js';
import { ShadingMode } from '../core/SceneManager.js';
import { EditorMode } from '../core/EditModeManager.js';

export class TopHeader {
  constructor(editor, container) {
    this.editor = editor;
    this.container = container;

    this.activeMenu = null;
    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.el = document.createElement('header');
    this.el.className = 'electroDesigner-top-header';

    this.el.innerHTML = `
      <div class="header-left">
        <div class="electroDesigner-brand">
          ${Icons.electroDesignerLogo}
          <span class="brand-title">Electro Designer</span>
        </div>

        <nav class="header-menu-nav">
          <div class="menu-item" data-menu="file">File
            <div class="menu-dropdown" id="dropdown-file">
              <button data-action="new">New Scene</button>
              <div class="menu-divider"></div>
              <button data-action="import">Import (GLTF / OBJ / STL)...</button>
              <button data-action="export-gltf">Export GLTF / GLB</button>
              <button data-action="export-obj">Export OBJ</button>
              <button data-action="export-stl">Export STL</button>
              <div class="menu-divider"></div>
              <button data-action="reset-view">Reset Viewport</button>
            </div>
          </div>

          <div class="menu-item" data-menu="edit">Edit
            <div class="menu-dropdown" id="dropdown-edit">
              <button data-action="undo">Undo <span class="shortcut">Ctrl+Z</span></button>
              <button data-action="redo">Redo <span class="shortcut">Ctrl+Y</span></button>
              <div class="menu-divider"></div>
              <button data-action="preferences">Preferences (Emulate 3-Button Mouse)...</button>
            </div>
          </div>

          <div class="menu-item" data-menu="add">Add
            <div class="menu-dropdown" id="dropdown-add">
              <div class="menu-sub-header">Mesh</div>
              <button data-action="add-cube">Cube</button>
              <button data-action="add-sphere">UV Sphere</button>
              <button data-action="add-cylinder">Cylinder</button>
              <button data-action="add-cone">Cone</button>
              <button data-action="add-torus">Torus</button>
              <button data-action="add-plane">Plane</button>
              <button data-action="add-monkey">Monkey (Suzanne)</button>
              <div class="menu-divider"></div>
              <div class="menu-sub-header">Light</div>
              <button data-action="add-sun">Sun Light</button>
              <button data-action="add-point">Point Light</button>
              <button data-action="add-spot">Spot Light</button>
              <div class="menu-divider"></div>
              <div class="menu-sub-header">Electromagnetism & Science</div>
              <button data-action="add-rhr">Right-Hand Rule (Cu E-Field) <span class="shortcut">Shift+B</span></button>
            </div>
          </div>

          <div class="menu-item" data-menu="object">Object
            <div class="menu-dropdown" id="dropdown-object">
              <button data-action="duplicate">Duplicate Objects <span class="shortcut">Shift+D</span></button>
              <button data-action="delete">Delete <span class="shortcut">X</span></button>
              <div class="menu-divider"></div>
              <button data-action="shade-smooth">Shade Smooth</button>
              <button data-action="shade-flat">Shade Flat</button>
            </div>
          </div>

          <div class="menu-item" data-menu="view">View
            <div class="menu-dropdown" id="dropdown-view">
              <button data-action="frame-selected">Frame Selected <span class="shortcut">.</span></button>
              <button data-action="frame-all">Frame All <span class="shortcut">Home</span></button>
              <div class="menu-divider"></div>
              <div class="menu-sub-header">Interface panels</div>
              <button data-action="toggle-sidebar" data-view-toggle="sidebar">Properties &amp; Outliner <span class="view-check">✓</span><span class="shortcut">N</span></button>
              <button data-action="toggle-toolbar" data-view-toggle="toolbar">Tool Shelf <span class="view-check">✓</span><span class="shortcut">T</span></button>

              <button data-action="toggle-viewport-info" data-view-toggle="viewportInfo">Viewport Information <span class="view-check">✓</span></button>
              <button data-action="toggle-navigation-gizmo" data-view-toggle="navigationGizmo">Navigation Gizmo <span class="view-check">✓</span></button>
              <button data-action="toggle-circuit-tools" data-view-toggle="circuitTools">Circuit Lab Tools <span class="view-check">✓</span><span class="shortcut">F2</span></button>
              <button data-action="toggle-design-library" data-view-toggle="designLibrary">Design Library <span class="view-check">✓</span></button>
              <button data-action="toggle-board-tools" data-view-toggle="boardTools">Board Tools <span class="view-check">✓</span></button>
              <button data-action="toggle-code-editor" data-view-toggle="codeEditor">Code Editor <span class="view-check">✓</span><span class="shortcut">F4</span></button>
              <div class="menu-divider"></div>
              <button data-action="show-all-panels">Show All Panels</button>
            </div>
          </div>

          <div class="menu-item" data-menu="help">Help
            <div class="menu-dropdown" id="dropdown-help">
              <button data-action="shortcuts">Keyboard Shortcuts & Navigation <span class="shortcut">F1</span></button>
              <button data-action="about">About Electro Designer Web</button>
            </div>
          </div>
        </nav>
      </div>

      <div class="header-center">
        <div class="electroDesigner-mode-selector" title="Choose a science workspace">
          <select id="workspace-mode-select" aria-label="Workspace mode">
            <option value="atoms">Atom Lab</option>
            <option value="circuits">Circuit Lab</option>
            <option value="chips">Chip Lab</option>
            <option value="masks">Mask Lab</option>
          </select>
        </div>
        <!-- Mode Switcher -->
        <div class="electroDesigner-mode-selector">
          <select id="editor-mode-select">
            <option value="OBJECT">Object Mode</option>
            <option value="EDIT">Edit Mode (Tab)</option>
          </select>
        </div>

        <!-- Transform Orientation -->
        <div class="electroDesigner-select-group">
          <select id="transform-space-select" title="Transform Orientation">
            <option value="world">Global</option>
            <option value="local">Local</option>
          </select>
        </div>

        <!-- Snapping -->
        <button id="btn-snap" class="header-icon-btn" title="Magnet Snapping (Increments)">
          ${Icons.magnet}
        </button>
      </div>

      <div class="header-right">
        <!-- Shading Modes -->
        <div class="shading-modes-group">
          <button class="shading-btn" data-shading="WIREFRAME" title="Wireframe Shading">${Icons.shadingWireframe}</button>
          <button class="shading-btn active" data-shading="SOLID" title="Solid Workbench Shading">${Icons.shadingSolid}</button>
          <button class="shading-btn" data-shading="MATERIAL" title="Material Preview">${Icons.shadingMaterial}</button>
          <button class="shading-btn" data-shading="RENDERED" title="Rendered View">${Icons.shadingRendered}</button>
        </div>

        <button id="btn-open-settings" class="header-icon-btn" title="Preferences (Emulate 3 Button Mouse)">
          ${Icons.settings}
        </button>
      </div>
    `;

    this.container.insertBefore(this.el, this.container.firstChild);

    // Hidden file input for importing 3D models
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.gltf,.glb,.obj,.stl';
    this.fileInput.style.display = 'none';
    this.container.appendChild(this.fileInput);
  }

  bindEvents() {
    // Menu dropdown toggles
    const menuItems = this.el.querySelectorAll('.menu-item');
    menuItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('button[data-action]')) return;
        e.stopPropagation();
        const isOpen = item.classList.contains('open');
        this.closeAllMenus();
        if (!isOpen) {
          item.classList.add('open');
          this.activeMenu = item;
          if (item.dataset.menu === 'view') this.updateViewMenuState();
        }
      });

      item.addEventListener('mouseenter', () => {
        if (this.activeMenu && this.activeMenu !== item) {
          this.closeAllMenus();
          item.classList.add('open');
          this.activeMenu = item;
        }
      });
    });

    window.addEventListener('click', () => {
      this.closeAllMenus();
    });

    // Menu Action Dispatcher
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      this.handleAction(action);
      this.closeAllMenus();
    });

    // Mode Selector
    const modeSelect = this.el.querySelector('#editor-mode-select');
    modeSelect.addEventListener('change', (e) => {
      if (e.target.value === 'EDIT') {
        this.editor.editModeManager.enterEditMode();
      } else {
        this.editor.editModeManager.enterObjectMode();
      }
    });

    this.el.querySelector('#workspace-mode-select').addEventListener('change', (event) => {
      this.editor.setWorkspaceMode(event.target.value);
    });

    // Shading Mode buttons
    const shadingBtns = this.el.querySelectorAll('.shading-btn');
    shadingBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        shadingBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.editor.sceneManager.setShadingMode(btn.dataset.shading);
      });
    });

    // Transform Space
    const spaceSelect = this.el.querySelector('#transform-space-select');
    spaceSelect.addEventListener('change', (e) => {
      this.editor.transformManager.setSpace(e.target.value);
    });

    // Snap Toggle
    const snapBtn = this.el.querySelector('#btn-snap');
    snapBtn.addEventListener('click', () => {
      snapBtn.classList.toggle('active');
      this.editor.transformManager.toggleSnapping(snapBtn.classList.contains('active'));
    });

    // Settings
    const settingsBtn = this.el.querySelector('#btn-open-settings');
    settingsBtn.addEventListener('click', () => {
      this.editor.preferencesModal.open();
    });

    // File Import Input
    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        this.editor.importModelFile(file);
        this.fileInput.value = '';
      }
    });
  }

  closeAllMenus() {
    this.el.querySelectorAll('.menu-item').forEach((item) => {
      item.classList.remove('open');
    });
    this.activeMenu = null;
  }

  handleAction(action) {
    switch (action) {
      case 'new':
        if (confirm('Create new scene? Unsaved changes will be discarded.')) {
          window.location.reload();
        }
        break;
      case 'import':
        this.fileInput.click();
        break;
      case 'export-gltf':
        this.editor.exportModel('gltf');
        break;
      case 'export-obj':
        this.editor.exportModel('obj');
        break;
      case 'export-stl':
        this.editor.exportModel('stl');
        break;
      case 'reset-view':
        this.editor.navigation.animateTo(
          new THREE.Vector3(6.5, 5.0, 6.5),
          new THREE.Vector3(0, 0, 0)
        );
        break;
      case 'undo':
        this.editor.historyManager.undo();
        break;
      case 'redo':
        this.editor.historyManager.redo();
        break;
      case 'preferences':
        this.editor.preferencesModal.open();
        break;
      case 'add-cube':
        this.editor.sceneManager.createMeshPrimitive('cube');
        break;
      case 'add-sphere':
        this.editor.sceneManager.createMeshPrimitive('sphere');
        break;
      case 'add-cylinder':
        this.editor.sceneManager.createMeshPrimitive('cylinder');
        break;
      case 'add-cone':
        this.editor.sceneManager.createMeshPrimitive('cone');
        break;
      case 'add-torus':
        this.editor.sceneManager.createMeshPrimitive('torus');
        break;
      case 'add-plane':
        this.editor.sceneManager.createMeshPrimitive('plane');
        break;
      case 'add-monkey':
        this.editor.sceneManager.createMeshPrimitive('monkey');
        break;
      case 'add-sun':
        this.editor.sceneManager.createLight('sun');
        break;
      case 'add-point':
        this.editor.sceneManager.createLight('point');
        break;
      case 'add-spot':
        this.editor.sceneManager.createLight('spot');
        break;
      case 'add-rhr':
        this.editor.sceneManager.createRightHandRuleCopperConductor();
        break;
      case 'duplicate':
        this.editor.sceneManager.duplicateSelectedObject();
        break;
      case 'delete':
        if (this.editor.selectionManager.activeObject) {
          this.editor.sceneManager.removeObject(this.editor.selectionManager.activeObject);
        }
        break;
      case 'shade-smooth':
        this.editor.setSmoothShading(true);
        break;
      case 'shade-flat':
        this.editor.setSmoothShading(false);
        break;
      case 'frame-selected':
        this.editor.navigation.frameSelected();
        break;
      case 'frame-all':
        this.editor.navigation.frameAll();
        break;
      case 'toggle-sidebar':
        this.editor.toggleSidebar();
        break;
      case 'toggle-toolbar':
        this.editor.toggleToolbar();
        break;
      case 'toggle-viewport-info':
        this.editor.toggleViewportInformation();
        break;
      case 'toggle-navigation-gizmo':
        this.editor.toggleNavigationGizmo();
        break;
      case 'toggle-circuit-tools':
        this.editor.toggleCircuitTools();
        break;
      case 'toggle-design-library':
        this.editor.toggleDesignLibrary();
        break;
      case 'toggle-board-tools':
        this.editor.boardPanel.el.hidden = !this.editor.boardPanel.el.hidden;
        break;
      case 'toggle-code-editor':
        this.editor.codeEditorPanel.setOpen(this.editor.codeEditorPanel.el.hidden);
        break;
      case 'show-all-panels':
        this.editor.showAllPanels();
        break;
      case 'shortcuts':
        this.editor.shortcutsModal.open();
        break;
      case 'about':
        alert('Electro Designer Web 3D Editor\nComplete with Emulate 3-Button Mouse Navigation\nBuilt with Three.js');
        break;
    }
  }

  updateMode(mode) {
    const select = this.el.querySelector('#editor-mode-select');
    if (select) {
      select.value = mode;
    }
  }

  updateWorkspaceMode(mode) {
    const selector = this.el.querySelector('#workspace-mode-select');
    if (selector) selector.value = mode;
  }

  updateViewMenuState() {
    const visibility = {
      sidebar: this.editor.sidebarVisible,
      toolbar: this.editor.toolbar.visible,
      viewportInfo: !this.editor.infoOverlay.hidden,
      navigationGizmo: this.editor.navigationGizmoVisible,
      circuitTools: this.editor.circuitDockVisible,
      designLibrary: !this.editor.designPanel.hidden,
      boardTools: !this.editor.boardPanel.el.hidden,
      codeEditor: !this.editor.codeEditorPanel.el.hidden
    };
    this.el.querySelectorAll('[data-view-toggle]').forEach((button) => {
      const visible = visibility[button.dataset.viewToggle];
      button.setAttribute('aria-pressed', String(visible));
      button.classList.toggle('view-item-hidden', !visible);
    });
  }
}
