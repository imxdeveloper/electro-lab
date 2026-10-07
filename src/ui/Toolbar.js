import * as THREE from 'three';
import { Icons } from '../utils/Icons.js';
import { TransformMode } from '../core/TransformManager.js';
import { EditorMode, SelectionMode } from '../core/EditModeManager.js';

export class Toolbar {
  constructor(editor, container) {
    this.editor = editor;
    this.container = container;
    this.activeTool = 'select';
    this.visible = true;

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.el = document.createElement('aside');
    this.el.className = 'electroDesigner-toolbar';

    this.el.innerHTML = `
      <button class="toolbar-collapse-btn" type="button" data-toolbar-collapse aria-expanded="true" title="Minimize tools">‹</button>
      <div class="toolbar-section main-tools">
        <button class="tool-btn active" data-tool="select" title="Select Box (W)">
          ${Icons.selectBox}
        </button>
        <button class="tool-btn" data-tool="cursor" title="3D Cursor (Shift + Right Click)">
          ${Icons.cursor}
        </button>
        <button class="tool-btn" data-tool="translate" title="Move (G)">
          ${Icons.move}
        </button>
        <button class="tool-btn" data-tool="rotate" title="Rotate (R)">
          ${Icons.rotate}
        </button>
        <button class="tool-btn" data-tool="scale" title="Scale (S)">
          ${Icons.scale}
        </button>
        <button class="tool-btn" data-tool="transform" title="Transform">
          ${Icons.transform}
        </button>
        <button class="tool-btn" data-tool="annotatePen" title="Annotate Pen">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m14.5 6.5 3 3M4 20l4.3-.9L20 7.4 16.6 4 4.9 15.7 4 20Z"/><path d="M13 7.9 16.1 11"/>
          </svg>
        </button>
        <button class="tool-btn" data-tool="annotateEraser" title="Annotate Eraser">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m7.2 15.8-3-3a2 2 0 0 1 0-2.8l6.7-6.7a2 2 0 0 1 2.8 0l6.8 6.8a2 2 0 0 1 0 2.8L14 19.4H8.8l-1.6-3.6Z"/><path d="m8.6 8.5 6.9 6.9M14 19.4h6"/>
          </svg>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <!-- Edit Mode: Selection Mode Toggle -->
      <div class="toolbar-section edit-mode-selection" style="display: none;">
        <div class="selection-mode-label">Select</div>
        <div class="selection-mode-group">
          <button class="tool-btn sel-mode-btn active" data-selmode="VERTEX" title="Vertex Select (1)">
            ${Icons.selectVertex}
          </button>
          <button class="tool-btn sel-mode-btn" data-selmode="EDGE" title="Edge Select (2)">
            ${Icons.selectEdge}
          </button>
          <button class="tool-btn sel-mode-btn" data-selmode="FACE" title="Face Select (3)">
            ${Icons.selectFace}
          </button>
        </div>
      </div>

      <div class="toolbar-divider edit-mode-divider" style="display: none;"></div>

      <!-- Edit Mode tools -->
      <div class="toolbar-section edit-mode-tools" style="display: none;">
        <button class="tool-btn" data-action="extrude" title="Extrude (E)">
          ${Icons.extrude}
        </button>
        <button class="tool-btn" data-action="inset" title="Inset Faces (I)">
          ${Icons.inset}
        </button>
        <button class="tool-btn" data-action="subdivide" title="Subdivide Mesh">
          ${Icons.subdivide}
        </button>
        <button class="tool-btn" data-action="delete" title="Delete Selected (X)">
          ${Icons.trash}
        </button>
      </div>
    `;

    this.container.appendChild(this.el);

    this.annotationSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.annotationSvg.classList.add('annotation-overlay');
    this.annotationCapture = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    this.annotationCapture.setAttribute('fill', 'transparent');
    this.annotationCapture.setAttribute('pointer-events', 'all');
    this.annotationSvg.appendChild(this.annotationCapture);
    this.editor.domElement.appendChild(this.annotationSvg);
    this.annotationStroke = null;
    this.annotationPoints = [];
    this.annotationResizeObserver = new ResizeObserver(() => this.syncAnnotationSurface());
    this.annotationResizeObserver.observe(this.editor.domElement);
    this.syncAnnotationSurface();
  }

  bindEvents() {
    const collapseButton = this.el.querySelector('[data-toolbar-collapse]');
    collapseButton.addEventListener('click', () => {
      const collapsed = this.el.classList.toggle('toolbar-collapsed');
      collapseButton.textContent = collapsed ? '›' : '‹';
      collapseButton.setAttribute('aria-expanded', String(!collapsed));
      collapseButton.title = collapsed ? 'Expand tools' : 'Minimize tools';
    });

    const buttons = this.el.querySelectorAll('.tool-btn[data-tool]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectTool(btn.dataset.tool);
      });
    });

    this.annotationSvg.addEventListener('pointerdown', (event) => {
      const isNavigationGesture = event.button === 1 || (event.button === 0 && event.altKey);
      if (isNavigationGesture) {
        event.preventDefault();
        event.stopPropagation();
        this.editor.navigation.onPointerDown(event);
        return;
      }
      if (!['annotatePen', 'annotateEraser'].includes(this.activeTool) || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.annotationSvg.setPointerCapture(event.pointerId);
      if (this.activeTool === 'annotatePen') this.beginAnnotation(event);
      else this.eraseAnnotationAt(event);
    });
    this.annotationSvg.addEventListener('pointermove', (event) => {
      if (this.activeTool === 'annotatePen' && this.annotationStroke) this.extendAnnotation(event);
      else if (this.activeTool === 'annotateEraser' && (event.buttons & 1)) this.eraseAnnotationAt(event);
    });
    this.annotationSvg.addEventListener('pointerup', () => this.finishAnnotation());
    this.annotationSvg.addEventListener('pointercancel', () => this.finishAnnotation());
    this.annotationSvg.addEventListener('wheel', (event) => {
      this.editor.navigation.onWheel(event);
    }, { passive: false });

    // Selection mode buttons
    const selModeButtons = this.el.querySelectorAll('.sel-mode-btn');
    selModeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        selModeButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.selmode;
        this.editor.editModeManager.setSelectionMode(SelectionMode[mode]);
      });
    });

    // Edit action buttons
    const editActions = this.el.querySelectorAll('.tool-btn[data-action]');
    editActions.forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'extrude') {
          this.editor.editModeManager.extrudeSelected();
        } else if (action === 'subdivide') {
          this.editor.editModeManager.subdivideMesh();
        } else if (action === 'inset') {
          this.editor.editModeManager.insetFaces();
        } else if (action === 'delete') {
          this.editor.editModeManager.deleteSelected();
        }
      });
    });

    // Keyboard 'T' toggles toolbar
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.code === 'KeyT' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        this.toggle();
      }
      if (e.code === 'KeyW' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        this.selectTool('select');
        this.updateActiveButton('select');
      }
    });

    // 3D Cursor click on canvas if cursor tool active
    this.editor.domElement.addEventListener('pointerdown', (e) => {
      if (this.activeTool === 'cursor' && e.button === 0 && !e.altKey) {
        this.placeCursorAtMouse(e);
      } else if (e.shiftKey && e.button === 2) {
        // Shift + RMB in Electro Designer also sets 3D Cursor
        this.placeCursorAtMouse(e);
      }
    });
  }

  placeCursorAtMouse(e) {
    const rect = this.editor.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = this.editor.selectionManager.raycaster;
    raycaster.setFromCamera({ x, y }, this.editor.sceneManager.activeCamera);

    // Cast against objects or grid plane
    const candidates = this.editor.sceneManager.objectsList.filter(
      (o) => o.visible && !o.name.startsWith('__')
    );
    const hits = raycaster.intersectObjects(candidates, true);

    if (hits.length > 0) {
      const p = hits[0].point;
      this.editor.sceneManager.set3DCursorPosition(p.x, p.y, p.z);
    } else {
      // Intersect with ground plane y=0
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const target = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, target)) {
        this.editor.sceneManager.set3DCursorPosition(target.x, target.y, target.z);
      }
    }
  }

  selectTool(tool) {
    this.activeTool = tool;
    const annotate = tool === 'annotatePen' || tool === 'annotateEraser';
    this.annotationSvg.classList.toggle('active', annotate);
    this.editor.domElement.classList.toggle('annotate-active', annotate);

    switch (tool) {
      case 'select':
      case 'cursor':
      case 'annotatePen':
      case 'annotateEraser':
        this.editor.transformManager.setTool(TransformMode.SELECT);
        break;
      case 'translate':
        this.editor.transformManager.setTool(TransformMode.TRANSLATE);
        break;
      case 'rotate':
        this.editor.transformManager.setTool(TransformMode.ROTATE);
        break;
      case 'scale':
        this.editor.transformManager.setTool(TransformMode.SCALE);
        break;
      case 'transform':
        this.editor.transformManager.setTool(TransformMode.TRANSLATE);
        break;
    }
  }

  syncAnnotationSurface() {
    const rect = this.editor.domElement.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.annotationSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.annotationSvg.setAttribute('width', `${width}`);
    this.annotationSvg.setAttribute('height', `${height}`);
    this.annotationCapture.setAttribute('width', `${width}`);
    this.annotationCapture.setAttribute('height', `${height}`);
  }

  annotationPoint(event) {
    const rect = this.annotationSvg.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  beginAnnotation(event) {
    this.annotationPoints = [this.annotationPoint(event)];
    this.annotationStroke = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    this.annotationStroke.classList.add('viewport-annotation-stroke');
    this.annotationStroke.setAttribute('points', this.annotationPoints[0].join(','));
    this.annotationStroke.setAttribute('fill', 'none');
    this.annotationStroke.setAttribute('stroke', '#ffb74d');
    this.annotationStroke.setAttribute('stroke-width', '3');
    this.annotationStroke.setAttribute('stroke-linecap', 'round');
    this.annotationStroke.setAttribute('stroke-linejoin', 'round');
    this.annotationStroke.setAttribute('pointer-events', 'none');
    this.annotationSvg.appendChild(this.annotationStroke);
  }

  extendAnnotation(event) {
    const point = this.annotationPoint(event);
    const previous = this.annotationPoints[this.annotationPoints.length - 1];
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 1.5) return;
    this.annotationPoints.push(point);
    this.annotationStroke.setAttribute('points', this.annotationPoints.map((entry) => entry.join(',')).join(' '));
  }

  finishAnnotation() {
    this.annotationStroke = null;
    this.annotationPoints = [];
  }

  eraseAnnotationAt(event) {
    const [x, y] = this.annotationPoint(event);
    const eraseRadius = 12;
    const strokes = this.annotationSvg.querySelectorAll('.viewport-annotation-stroke');
    for (const stroke of strokes) {
      const length = stroke.getTotalLength();
      const steps = Math.max(1, Math.ceil(length / 4));
      for (let step = 0; step <= steps; step++) {
        const point = stroke.getPointAtLength((length * step) / steps);
        if (Math.hypot(point.x - x, point.y - y) <= eraseRadius) {
          stroke.remove();
          break;
        }
      }
    }
  }

  updateActiveButton(tool) {
    const buttons = this.el.querySelectorAll('.tool-btn[data-tool]');
    buttons.forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
  }

  setMode(mode) {
    const editSelection = this.el.querySelector('.edit-mode-selection');
    const editTools = this.el.querySelector('.edit-mode-tools');
    const editDivider = this.el.querySelector('.edit-mode-divider');
    const isEdit = mode === EditorMode.EDIT;

    if (editSelection) editSelection.style.display = isEdit ? 'flex' : 'none';
    if (editTools) editTools.style.display = isEdit ? 'flex' : 'none';
    if (editDivider) editDivider.style.display = isEdit ? 'block' : 'none';
  }

  updateSelectionModeButton(selMode) {
    const selModeButtons = this.el.querySelectorAll('.sel-mode-btn');
    selModeButtons.forEach((b) => {
      b.classList.toggle('active', b.dataset.selmode === selMode);
    });
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'flex' : 'none';
  }
}
