import * as THREE from 'three';
import { Icons } from '../utils/Icons.js';

export class NavigationGizmo {
  constructor(editor, container) {
    this.editor = editor;
    this.container = container;

    this.size = 100;
    this.radius = 38;
    this.axes = [
      { name: 'X', dir: new THREE.Vector3(1, 0, 0), color: '#e63946', label: 'X', view: 'RIGHT' },
      { name: '-X', dir: new THREE.Vector3(-1, 0, 0), color: '#a02030', label: '', view: 'LEFT' },
      { name: 'Y', dir: new THREE.Vector3(0, 1, 0), color: '#2a9d8f', label: 'Y', view: 'TOP' },
      { name: '-Y', dir: new THREE.Vector3(0, -1, 0), color: '#1b635a', label: '', view: 'BOTTOM' },
      { name: 'Z', dir: new THREE.Vector3(0, 0, 1), color: '#457b9d', label: 'Z', view: 'FRONT' },
      { name: '-Z', dir: new THREE.Vector3(0, 0, -1), color: '#27475d', label: '', view: 'BACK' }
    ];

    this.initDOM();
    this.bindEvents();
    this.render();
  }

  initDOM() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'electroDesigner-nav-widget';

    // Canvas for 3D orientation axis gizmo
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size * window.devicePixelRatio;
    this.canvas.height = this.size * window.devicePixelRatio;
    this.canvas.style.width = `${this.size}px`;
    this.canvas.style.height = `${this.size}px`;
    this.canvas.className = 'nav-gizmo-canvas';
    this.ctx = this.canvas.getContext('2d');

    // Quick navigation tool buttons below the orientation gizmo
    this.toolsColumn = document.createElement('div');
    this.toolsColumn.className = 'nav-tools-column';

    // Zoom tool
    this.btnZoom = this.createToolBtn(Icons.zoom, 'Zoom View (Click & drag)', 'nav-btn-zoom');
    // Pan tool
    this.btnPan = this.createToolBtn(Icons.panHand, 'Pan View (Click & drag)', 'nav-btn-pan');
    // Camera view
    this.btnCam = this.createToolBtn(Icons.cameraIcon, 'Frame / Focus Selected (Numpad .)', 'nav-btn-cam');
    // Perspective / Ortho toggle
    this.btnOrtho = this.createToolBtn(Icons.orthoPersp, 'Toggle Orthographic / Perspective (Numpad 5)', 'nav-btn-ortho');

    this.toolsColumn.appendChild(this.btnZoom);
    this.toolsColumn.appendChild(this.btnPan);
    this.toolsColumn.appendChild(this.btnCam);
    this.toolsColumn.appendChild(this.btnOrtho);

    this.wrapper.appendChild(this.canvas);
    this.wrapper.appendChild(this.toolsColumn);
    this.container.appendChild(this.wrapper);
  }

  createToolBtn(svgIcon, title, className) {
    const btn = document.createElement('button');
    btn.className = `electroDesigner-nav-btn ${className}`;
    btn.title = title;
    btn.innerHTML = svgIcon;
    return btn;
  }

  bindEvents() {
    let isDraggingGizmo = false;
    let startX = 0;
    let startY = 0;

    this.canvas.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left - this.size / 2;
      const clickY = e.clientY - rect.top - this.size / 2;

      // Check if clicked directly on an axis dot
      const hitAxis = this.getHitAxis(clickX, clickY);
      if (hitAxis) {
        this.editor.navigation.setViewPreset(hitAxis.view);
        return;
      }

      // Otherwise drag to orbit
      isDraggingGizmo = true;
      startX = e.clientX;
      startY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });

    window.addEventListener('pointermove', (e) => {
      if (!isDraggingGizmo) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = e.clientX;
      startY = e.clientY;

      this.editor.navigation.spherical.theta -= dx * 0.01;
      this.editor.navigation.spherical.phi -= dy * 0.01;
      const EPS = 0.001;
      this.editor.navigation.spherical.phi = Math.max(
        EPS,
        Math.min(Math.PI - EPS, this.editor.navigation.spherical.phi)
      );

      const offset = new THREE.Vector3().setFromSpherical(this.editor.navigation.spherical);
      this.editor.sceneManager.activeCamera.position
        .copy(this.editor.navigation.target)
        .add(offset);
      this.editor.sceneManager.activeCamera.lookAt(this.editor.navigation.target);
      this.editor.sceneManager.onCameraMoved();
      this.render();
    });

    window.addEventListener('pointerup', () => {
      isDraggingGizmo = false;
    });

    // Tool Button Events
    // 1. Zoom drag
    let isDraggingZoom = false;
    let zoomStartY = 0;
    this.btnZoom.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      isDraggingZoom = true;
      zoomStartY = e.clientY;
      this.btnZoom.setPointerCapture(e.pointerId);
    });
    window.addEventListener('pointermove', (e) => {
      if (!isDraggingZoom) return;
      const dy = e.clientY - zoomStartY;
      zoomStartY = e.clientY;
      const factor = 1.0 + dy * 0.01;
      const eye = new THREE.Vector3()
        .copy(this.editor.sceneManager.activeCamera.position)
        .sub(this.editor.navigation.target);
      eye.multiplyScalar(factor);
      if (eye.length() > 0.1 && eye.length() < 800) {
        this.editor.sceneManager.activeCamera.position
          .copy(this.editor.navigation.target)
          .add(eye);
        this.editor.navigation.updateSphericalFromCamera();
        this.render();
      }
    });
    window.addEventListener('pointerup', () => {
      isDraggingZoom = false;
    });

    // 2. Pan drag
    let isDraggingPan = false;
    let panStartX = 0;
    let panStartY = 0;
    this.btnPan.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      isDraggingPan = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      this.btnPan.setPointerCapture(e.pointerId);
    });
    window.addEventListener('pointermove', (e) => {
      if (!isDraggingPan) return;
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      panStartX = e.clientX;
      panStartY = e.clientY;

      const cam = this.editor.sceneManager.activeCamera;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      cam.matrix.extractBasis(right, up, new THREE.Vector3());

      const factor = cam.position.distanceTo(this.editor.navigation.target) * 0.003;
      const panOffset = new THREE.Vector3()
        .addScaledVector(right, -dx * factor)
        .addScaledVector(up, dy * factor);

      cam.position.add(panOffset);
      this.editor.navigation.target.add(panOffset);
      this.render();
    });
    window.addEventListener('pointerup', () => {
      isDraggingPan = false;
    });

    // 3. Camera / Focus
    this.btnCam.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editor.navigation.frameSelected();
    });

    // 4. Perspective / Orthographic toggle
    this.btnOrtho.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editor.navigation.togglePerspectiveOrtho();
      this.render();
    });
  }

  getHitAxis(clickX, clickY) {
    const cam = this.editor.sceneManager.activeCamera;
    const invCamMat = new THREE.Matrix4().copy(cam.matrixWorldInverse);
    invCamMat.setPosition(0, 0, 0); // Only orientation

    for (const axis of this.axes) {
      const v = axis.dir.clone().applyMatrix4(invCamMat);
      const px = v.x * this.radius;
      const py = -v.y * this.radius;
      const dist = Math.hypot(clickX - px, clickY - py);
      if (dist <= 10) {
        return axis;
      }
    }
    return null;
  }

  render() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const center = (this.size / 2) * dpr;
    const radius = this.radius * dpr;

    ctx.clearRect(0, 0, this.size * dpr, this.size * dpr);

    const cam = this.editor.sceneManager.activeCamera;
    if (!cam) return;

    const invCamMat = new THREE.Matrix4().copy(cam.matrixWorldInverse);
    invCamMat.setPosition(0, 0, 0);

    // Project axes into 2D screen space
    const projected = this.axes.map((axis) => {
      const v = axis.dir.clone().applyMatrix4(invCamMat);
      return {
        ...axis,
        screenX: center + v.x * radius,
        screenY: center - v.y * radius,
        depth: v.z
      };
    });

    // Sort by depth so background axes render behind foreground
    projected.sort((a, b) => a.depth - b.depth);

    // Draw connecting lines
    ctx.lineWidth = 2 * dpr;
    projected.forEach((p) => {
      if (p.depth >= 0 || p.label) {
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.lineTo(p.screenX, p.screenY);
        ctx.strokeStyle = p.color;
        ctx.stroke();
      }
    });

    // Draw axis nodes
    projected.forEach((p) => {
      const nodeRadius = (p.label ? 8 : 4.5) * dpr;
      ctx.beginPath();
      ctx.arc(p.screenX, p.screenY, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      if (p.label) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${9 * dpr}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, p.screenX, p.screenY);
      }
    });
  }
}
