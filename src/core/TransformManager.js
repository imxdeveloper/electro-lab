import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

export const TransformMode = {
  SELECT: 'select',
  TRANSLATE: 'translate',
  ROTATE: 'rotate',
  SCALE: 'scale'
};

export class TransformManager {
  constructor(sceneManager, navigation, selectionManager, domElement, hudElement, editor = null) {
    this.sceneManager = sceneManager;
    this.navigation = navigation;
    this.selectionManager = selectionManager;
    this.domElement = domElement;
    this.hudElement = hudElement;
    this.editor = editor;

    this.isDragging = false;
    this.activeTool = TransformMode.SELECT;
    this.snappingEnabled = false;
    this.snapTranslation = 0.5;
    this.snapRotation = THREE.MathUtils.degToRad(15);

    // Pre-drag snapshot for gizmo undo/redo
    this.preGizmoPos = new THREE.Vector3();
    this.preGizmoRot = new THREE.Euler();
    this.preGizmoScale = new THREE.Vector3();
    this.preGizmoTarget = null;

    // Modal transform state (G, R, S)
    this.isModalTransform = false;
    this.modalType = null; // 'grab', 'rotate', 'scale'
    this.modalAxisLock = null; // null, 'X', 'Y', 'Z', 'SHIFT_X', 'SHIFT_Y', 'SHIFT_Z'
    this.modalInitialPos = new THREE.Vector3();
    this.modalInitialRot = new THREE.Euler();
    this.modalInitialScale = new THREE.Vector3();
    this.modalStartMouse = new THREE.Vector2();
    this.modalTarget = null;

    this.initGizmo();
    this.bindEvents();
  }

  initGizmo() {
    this.gizmo = new TransformControls(this.sceneManager.activeCamera, this.domElement);
    this.gizmo.size = 0.85;
    this.gizmo.space = 'world'; // 'world' or 'local'
    this.gizmo.enabled = false;
    this.gizmo.visible = false;
    this.sceneManager.scene.add(this.gizmo.getHelper());

    // Prevent navigation while gizmo is being dragged & push history on completion
    this.gizmo.addEventListener('dragging-changed', (event) => {
      this.isDragging = event.value;
      if (this.navigation) {
        this.navigation.isNavigating = false;
      }

      const target = this.selectionManager?.activeObject;

      if (event.value) {
        // Drag started: take transform snapshot
        if (target) {
          this.preGizmoPos.copy(target.position);
          this.preGizmoRot.copy(target.rotation);
          this.preGizmoScale.copy(target.scale);
          this.preGizmoTarget = target;
        }
      } else {
        // Drag ended: push undo state if modified
        if (this.preGizmoTarget && this.editor?.historyManager) {
          const t = this.preGizmoTarget;
          const oldPos = this.preGizmoPos.clone();
          const oldRot = this.preGizmoRot.clone();
          const oldScale = this.preGizmoScale.clone();
          const newPos = t.position.clone();
          const newRot = t.rotation.clone();
          const newScale = t.scale.clone();

          if (!oldPos.equals(newPos) || !oldRot.equals(newRot) || !oldScale.equals(newScale)) {
            const toolName = this.activeTool.charAt(0).toUpperCase() + this.activeTool.slice(1);
            this.editor.historyManager.pushState(`${toolName} ${t.name}`, () => {
              t.position.copy(oldPos);
              t.rotation.copy(oldRot);
              t.scale.copy(oldScale);
              this.selectionManager.updateSelectionVisuals();
              this.editor.propertiesPanel?.update();
            }, () => {
              t.position.copy(newPos);
              t.rotation.copy(newRot);
              t.scale.copy(newScale);
              this.selectionManager.updateSelectionVisuals();
              this.editor.propertiesPanel?.update();
            });
          }
        }
        this.preGizmoTarget = null;

        if (this.onTransformEnd) {
          this.onTransformEnd();
        }
      }
    });

    this.gizmo.addEventListener('change', () => {
      if (this.selectionManager) {
        this.selectionManager.updateSelectionVisuals();
      }
      if (this.onTransformChange) {
        this.onTransformChange();
      }
    });

    // Update gizmo camera on camera projection switch
    this.sceneManager.onCameraChanged = (cam) => {
      this.gizmo.camera = cam;
    };
  }

  bindEvents() {
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerdown', this.onPointerDown);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    this.gizmo.dispose();
  }

  setTool(tool) {
    this.activeTool = tool;

    if (tool === TransformMode.SELECT || !this.selectionManager.activeObject) {
      this.gizmo.detach();
      this.gizmo.enabled = false;
      this.gizmo.visible = false;
    } else {
      this.gizmo.attach(this.selectionManager.activeObject);
      this.gizmo.setMode(tool);
      this.gizmo.enabled = true;
      this.gizmo.visible = true;
    }
  }

  updateAttachedObject(obj) {
    if (!obj || this.activeTool === TransformMode.SELECT) {
      this.gizmo.detach();
      this.gizmo.enabled = false;
      this.gizmo.visible = false;
    } else {
      this.gizmo.attach(obj);
      this.gizmo.enabled = true;
      this.gizmo.visible = true;
    }
  }

  setSpace(space) {
    this.gizmo.setSpace(space); // 'world' or 'local'
  }

  toggleSnapping(enabled) {
    this.snappingEnabled = enabled;
    this.gizmo.setTranslationSnap(enabled ? this.snapTranslation : null);
    this.gizmo.setRotationSnap(enabled ? this.snapRotation : null);
    this.gizmo.setScaleSnap(enabled ? 0.25 : null);
  }

  // Electro Designer Modal Transforms: G (Grab), R (Rotate), S (Scale)
  startModalTransform(type, startX, startY) {
    const target = this.selectionManager.activeObject;
    if (!target) return;

    this.isModalTransform = true;
    this.modalType = type;
    this.modalTarget = target;
    this.modalAxisLock = null;

    this.modalInitialPos.copy(target.position);
    this.modalInitialRot.copy(target.rotation);
    this.modalInitialScale.copy(target.scale);
    this.modalStartMouse.set(startX, startY);

    this.gizmo.enabled = false;
    this.gizmo.visible = false;
    this.updateHUD();
  }

  confirmModalTransform() {
    if (!this.isModalTransform) return;

    if (this.modalTarget && this.editor?.historyManager) {
      const t = this.modalTarget;
      const oldPos = this.modalInitialPos.clone();
      const oldRot = this.modalInitialRot.clone();
      const oldScale = this.modalInitialScale.clone();
      const newPos = t.position.clone();
      const newRot = t.rotation.clone();
      const newScale = t.scale.clone();

      if (!oldPos.equals(newPos) || !oldRot.equals(newRot) || !oldScale.equals(newScale)) {
        const actionLabel =
          this.modalType === 'grab' ? 'Move' :
          this.modalType === 'rotate' ? 'Rotate' : 'Scale';

        this.editor.historyManager.pushState(`${actionLabel} ${t.name}`, () => {
          t.position.copy(oldPos);
          t.rotation.copy(oldRot);
          t.scale.copy(oldScale);
          this.selectionManager.updateSelectionVisuals();
          this.editor.propertiesPanel?.update();
        }, () => {
          t.position.copy(newPos);
          t.rotation.copy(newRot);
          t.scale.copy(newScale);
          this.selectionManager.updateSelectionVisuals();
          this.editor.propertiesPanel?.update();
        });
      }
    }

    this.isModalTransform = false;
    this.clearHUD();

    if (this.onTransformEnd) {
      this.onTransformEnd();
    }

    if (this.activeTool !== TransformMode.SELECT) {
      this.setTool(this.activeTool);
    }
  }

  cancelModalTransform() {
    if (!this.isModalTransform) return;
    if (this.modalTarget) {
      this.modalTarget.position.copy(this.modalInitialPos);
      this.modalTarget.rotation.copy(this.modalInitialRot);
      this.modalTarget.scale.copy(this.modalInitialScale);
    }

    this.isModalTransform = false;
    this.clearHUD();
    this.selectionManager.updateSelectionVisuals();

    if (this.activeTool !== TransformMode.SELECT) {
      this.setTool(this.activeTool);
    }
  }

  onPointerDown(e) {
    if (this.isModalTransform) {
      if (e.button === 0) {
        // Left click confirms
        e.preventDefault();
        e.stopPropagation();
        this.confirmModalTransform();
      } else if (e.button === 2) {
        // Right click cancels
        e.preventDefault();
        e.stopPropagation();
        this.cancelModalTransform();
      }
    }
  }

  onPointerMove(e) {
    if (!this.isModalTransform || !this.modalTarget) return;

    const deltaX = e.clientX - this.modalStartMouse.x;
    const deltaY = e.clientY - this.modalStartMouse.y;

    const camera = this.sceneManager.activeCamera;
    const dist = camera.position.distanceTo(this.modalInitialPos) || 10;
    const sensitivity = (dist * 0.0015);

    if (this.modalType === 'grab') {
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      camera.matrix.extractBasis(right, up, new THREE.Vector3());

      const moveVec = new THREE.Vector3()
        .addScaledVector(right, deltaX * sensitivity)
        .addScaledVector(up, -deltaY * sensitivity);

      const newPos = new THREE.Vector3().copy(this.modalInitialPos).add(moveVec);

      // Apply axis constraints
      if (this.modalAxisLock === 'X') {
        newPos.y = this.modalInitialPos.y;
        newPos.z = this.modalInitialPos.z;
      } else if (this.modalAxisLock === 'Y') {
        newPos.x = this.modalInitialPos.x;
        newPos.z = this.modalInitialPos.z;
      } else if (this.modalAxisLock === 'Z') {
        newPos.x = this.modalInitialPos.x;
        newPos.y = this.modalInitialPos.y;
      } else if (this.modalAxisLock === 'SHIFT_X') {
        newPos.x = this.modalInitialPos.x;
      } else if (this.modalAxisLock === 'SHIFT_Y') {
        newPos.y = this.modalInitialPos.y;
      } else if (this.modalAxisLock === 'SHIFT_Z') {
        newPos.z = this.modalInitialPos.z;
      }

      if (this.snappingEnabled) {
        newPos.x = Math.round(newPos.x / this.snapTranslation) * this.snapTranslation;
        newPos.y = Math.round(newPos.y / this.snapTranslation) * this.snapTranslation;
        newPos.z = Math.round(newPos.z / this.snapTranslation) * this.snapTranslation;
      }

      this.modalTarget.position.copy(newPos);
    } else if (this.modalType === 'rotate') {
      const angle = (deltaX - deltaY) * 0.01;
      const newRot = this.modalInitialRot.clone();

      if (this.modalAxisLock === 'X') {
        newRot.x += angle;
      } else if (this.modalAxisLock === 'Y') {
        newRot.y += angle;
      } else if (this.modalAxisLock === 'Z') {
        newRot.z += angle;
      } else {
        // Rotate around camera viewing axis
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const q = new THREE.Quaternion().setFromAxisAngle(camDir, -angle);
        const origQ = new THREE.Quaternion().setFromEuler(this.modalInitialRot);
        origQ.premultiply(q);
        newRot.setFromQuaternion(origQ);
      }

      this.modalTarget.rotation.copy(newRot);
    } else if (this.modalType === 'scale') {
      const scaleFactor = Math.max(0.01, 1.0 + (deltaX - deltaY) * 0.005);
      const newScale = this.modalInitialScale.clone();

      if (this.modalAxisLock === 'X') {
        newScale.x *= scaleFactor;
      } else if (this.modalAxisLock === 'Y') {
        newScale.y *= scaleFactor;
      } else if (this.modalAxisLock === 'Z') {
        newScale.z *= scaleFactor;
      } else {
        newScale.multiplyScalar(scaleFactor);
      }

      this.modalTarget.scale.copy(newScale);
    }

    this.selectionManager.updateSelectionVisuals();
    this.updateHUD();

    if (this.onTransformChange) {
      this.onTransformChange();
    }
  }

  onKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      return;
    }

    // Modal active keys
    if (this.isModalTransform) {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.cancelModalTransform();
        return;
      }
      if (e.code === 'Enter') {
        e.preventDefault();
        this.confirmModalTransform();
        return;
      }

      // Axis Lock toggles: X, Y, Z
      if (e.code === 'KeyX') {
        e.preventDefault();
        this.modalAxisLock = e.shiftKey ? 'SHIFT_X' : 'X';
        this.updateHUD();
        return;
      }
      if (e.code === 'KeyY') {
        e.preventDefault();
        this.modalAxisLock = e.shiftKey ? 'SHIFT_Y' : 'Y';
        this.updateHUD();
        return;
      }
      if (e.code === 'KeyZ') {
        e.preventDefault();
        this.modalAxisLock = e.shiftKey ? 'SHIFT_Z' : 'Z';
        this.updateHUD();
        return;
      }
    }

    // Start Modal shortcuts: G, R, S (Electro Designer standards)
    if (this.selectionManager.activeObject) {
      if (e.code === 'KeyG' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        this.startModalTransform('grab', window.innerWidth / 2, window.innerHeight / 2);
      } else if (e.code === 'KeyR' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        this.startModalTransform('rotate', window.innerWidth / 2, window.innerHeight / 2);
      } else if (e.code === 'KeyS' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        this.startModalTransform('scale', window.innerWidth / 2, window.innerHeight / 2);
      }
    }
  }

  updateHUD() {
    if (!this.hudElement) return;
    if (!this.isModalTransform) {
      this.hudElement.style.display = 'none';
      return;
    }

    const typeName =
      this.modalType === 'grab' ? 'Grab / Move' :
      this.modalType === 'rotate' ? 'Rotate' : 'Scale';

    const axis = this.modalAxisLock ? ` [Lock: ${this.modalAxisLock}]` : ' [Global View]';

    this.hudElement.style.display = 'flex';
    this.hudElement.innerHTML = `
      <span class="hud-tag">${typeName}</span>
      <span class="hud-axis">${axis}</span>
      <span class="hud-hints">Press <b>X / Y / Z</b> to lock axis | <b>Enter / LMB</b> confirm | <b>Esc / RMB</b> cancel</span>
    `;
  }

  clearHUD() {
    if (this.hudElement) {
      this.hudElement.style.display = 'none';
      this.hudElement.innerHTML = '';
    }
  }
}
