import * as THREE from 'three';

export const NavMode = {
  NONE: 'NONE',
  ORBIT: 'ORBIT',
  PAN: 'PAN',
  DOLLY: 'DOLLY'
};

export class Navigation {
  constructor(camera, domElement, sceneManager) {
    this.camera = camera;
    this.domElement = domElement;
    this.sceneManager = sceneManager;

    // Target pivot point (like Electro Designer's orbit center)
    this.target = new THREE.Vector3(0, 0, 0);

    // Emulate 3 Button Mouse setting (ENABLED by default per user request)
    this.emulate3ButtonMouse = true;
    this.emulateNumpad = true;

    // Sensitivities
    this.orbitSpeed = 0.005;
    this.panSpeed = 0.002;
    this.zoomSpeed = 0.003;

    // State tracking
    this.mode = NavMode.NONE;
    this.isNavigating = false;
    this.justNavigated = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;

    // Spherical coordinates representation
    this.spherical = new THREE.Spherical();
    this.updateSphericalFromCamera();

    // Smooth animation state
    this.isAnimating = false;
    this.animStartTime = 0;
    this.animDuration = 280; // ms
    this.startCamPos = new THREE.Vector3();
    this.targetCamPos = new THREE.Vector3();
    this.startTarget = new THREE.Vector3();
    this.destTarget = new THREE.Vector3();

    // Event listeners
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);

    this.bindEvents();
  }

  bindEvents() {
    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.domElement.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.domElement.removeEventListener('wheel', this.onWheel);
    this.domElement.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  onContextMenu(e) {
    // If navigation happened or Alt was pressed, prevent default browser context menu
    if (this.isNavigating || e.altKey) {
      e.preventDefault();
    }
  }

  updateSphericalFromCamera() {
    const offset = new THREE.Vector3().copy(this.camera.position).sub(this.target);
    this.spherical.setFromVector3(offset);
  }

  onPointerDown(e) {
    if (this.isAnimating) return;

    // Check Emulate 3 Button Mouse:
    // Alt + Left Mouse Button (button === 0)
    // OR Middle Mouse Button (button === 1)
    const isEmulated = this.emulate3ButtonMouse && e.altKey && e.button === 0;
    const isMiddleMouse = e.button === 1;

    if (isEmulated || isMiddleMouse) {
      e.preventDefault();
      e.stopPropagation();

      if (e.shiftKey) {
        // Shift + Alt + LMB = Pan
        this.mode = NavMode.PAN;
        this.domElement.style.cursor = 'move';
      } else if (e.ctrlKey) {
        // Ctrl + Alt + LMB = Dolly / Smooth Zoom
        this.mode = NavMode.DOLLY;
        this.domElement.style.cursor = 'ns-resize';
      } else {
        // Alt + LMB = Orbit
        this.mode = NavMode.ORBIT;
        this.domElement.style.cursor = 'grabbing';
      }

      this.isNavigating = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.updateSphericalFromCamera();

      try {
        this.domElement.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture fails
      }
    }
  }

  onPointerMove(e) {
    if (!this.isNavigating || this.mode === NavMode.NONE) return;

    const deltaX = e.clientX - this.lastPointerX;
    const deltaY = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    if (deltaX === 0 && deltaY === 0) return;

    if (this.mode === NavMode.ORBIT) {
      // Orbiting around pivot point
      this.spherical.theta -= deltaX * this.orbitSpeed;
      this.spherical.phi -= deltaY * this.orbitSpeed;

      // Prevent flipping at poles
      const EPS = 0.001;
      this.spherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, this.spherical.phi));

      const offset = new THREE.Vector3().setFromSpherical(this.spherical);
      this.camera.position.copy(this.target).add(offset);
      this.camera.lookAt(this.target);
    } else if (this.mode === NavMode.PAN) {
      // Panning parallel to camera screen plane
      const eye = new THREE.Vector3().copy(this.camera.position).sub(this.target);
      const distance = eye.length();
      const factor = distance * this.panSpeed;

      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      this.camera.matrix.extractBasis(right, up, new THREE.Vector3());

      const panOffset = new THREE.Vector3()
        .addScaledVector(right, -deltaX * factor)
        .addScaledVector(up, deltaY * factor);

      this.camera.position.add(panOffset);
      this.target.add(panOffset);
    } else if (this.mode === NavMode.DOLLY) {
      // Smooth zoom (moving up zooms in, moving down zooms out)
      const factor = 1.0 + deltaY * this.zoomSpeed;
      const eye = new THREE.Vector3().copy(this.camera.position).sub(this.target);
      const currentDist = eye.length();
      const newDist = currentDist * factor;

      if (newDist > 0.1 && newDist < 800) {
        eye.multiplyScalar(factor);
        this.camera.position.copy(this.target).add(eye);
        this.spherical.radius = newDist;
      }
    }

    if (this.sceneManager) {
      this.sceneManager.onCameraMoved();
    }
  }

  onPointerUp(e) {
    if (this.isNavigating) {
      this.isNavigating = false;
      this.mode = NavMode.NONE;
      this.domElement.style.cursor = 'default';

      // Set a brief flag so clicking to release navigation doesn't trigger object selection
      this.justNavigated = true;
      setTimeout(() => {
        this.justNavigated = false;
      }, 50);

      try {
        this.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  }

  onWheel(e) {
    e.preventDefault();
    if (this.isAnimating) return;

    // Mouse scroll step zoom
    const zoomFactor = Math.pow(0.999, -e.deltaY * 1.5);
    const eye = new THREE.Vector3().copy(this.camera.position).sub(this.target);
    const currentDist = eye.length();
    const newDist = currentDist * zoomFactor;

    if (newDist > 0.1 && newDist < 800) {
      eye.multiplyScalar(zoomFactor);
      this.camera.position.copy(this.target).add(eye);
      this.updateSphericalFromCamera();

      if (this.sceneManager) {
        this.sceneManager.onCameraMoved();
      }
    }
  }

  onKeyDown(e) {
    // If user is typing in an input or textarea, ignore editor shortcuts
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      return;
    }

    // Emulate Numpad or standard Numpad:
    // 1: Front (Ctrl+1: Back)
    // 3: Right (Ctrl+3: Left)
    // 7: Top   (Ctrl+7: Bottom)
    // 5: Ortho / Persp toggle
    // . / F: Focus selected object
    const code = e.code;
    const isNum1 = code === 'Numpad1' || (this.emulateNumpad && (code === 'Digit1' || e.key === '1'));
    const isNum3 = code === 'Numpad3' || (this.emulateNumpad && (code === 'Digit3' || e.key === '3'));
    const isNum7 = code === 'Numpad7' || (this.emulateNumpad && (code === 'Digit7' || e.key === '7'));
    const isNum5 = code === 'Numpad5' || (this.emulateNumpad && (code === 'Digit5' || e.key === '5'));
    const isDot = code === 'NumpadDecimal' || code === 'Period' || code === 'KeyF';
    const isHome = code === 'Home';

    if (isNum1) {
      e.preventDefault();
      this.setViewPreset(e.ctrlKey ? 'BACK' : 'FRONT');
    } else if (isNum3) {
      e.preventDefault();
      this.setViewPreset(e.ctrlKey ? 'LEFT' : 'RIGHT');
    } else if (isNum7) {
      e.preventDefault();
      this.setViewPreset(e.ctrlKey ? 'BOTTOM' : 'TOP');
    } else if (isNum5) {
      e.preventDefault();
      this.togglePerspectiveOrtho();
    } else if (isDot) {
      e.preventDefault();
      this.frameSelected();
    } else if (isHome) {
      e.preventDefault();
      this.frameAll();
    }
  }

  /**
   * Snaps or smoothly animates to standard Electro Designer orthogonal/perspective presets
   */
  setViewPreset(viewType) {
    const dist = this.camera.position.distanceTo(this.target) || 10;
    const newPos = new THREE.Vector3();

    switch (viewType) {
      case 'FRONT': // Front view (Looking at -Z)
        newPos.set(this.target.x, this.target.y, this.target.z + dist);
        break;
      case 'BACK':  // Back view (Looking at +Z)
        newPos.set(this.target.x, this.target.y, this.target.z - dist);
        break;
      case 'RIGHT': // Right view (Looking at -X)
        newPos.set(this.target.x + dist, this.target.y, this.target.z);
        break;
      case 'LEFT':  // Left view (Looking at +X)
        newPos.set(this.target.x - dist, this.target.y, this.target.z);
        break;
      case 'TOP':   // Top view (Looking down from +Y)
        newPos.set(this.target.x, this.target.y + dist, this.target.z + 0.0001);
        break;
      case 'BOTTOM':// Bottom view (Looking up from -Y)
        newPos.set(this.target.x, this.target.y - dist, this.target.z + 0.0001);
        break;
      default:
        return;
    }

    this.animateTo(newPos, this.target);
  }

  /**
   * Toggle Perspective and Orthographic view modes
   */
  togglePerspectiveOrtho() {
    if (this.sceneManager) {
      this.sceneManager.toggleCameraProjection();
    }
  }

  /**
   * Focus / Frame selected object (like Numpad . or F in Electro Designer)
   */
  frameSelected() {
    if (!this.sceneManager) return;
    const selected = this.sceneManager.getSelectedObject();
    if (!selected) {
      this.frameAll();
      return;
    }

    const box = new THREE.Box3().setFromObject(selected);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1.0);
    const dist = maxDim * 2.5;

    const dir = new THREE.Vector3().copy(this.camera.position).sub(this.target).normalize();
    if (dir.lengthSq() < 0.1) dir.set(1, 1, 1).normalize();

    const newPos = new THREE.Vector3().copy(center).addScaledVector(dir, dist);
    this.animateTo(newPos, center);
  }

  /**
   * Frame all objects in the scene (Electro Designer 'Home' key)
   */
  frameAll() {
    if (!this.sceneManager) return;
    const box = new THREE.Box3();
    let hasObjects = false;

    this.sceneManager.scene.traverse((obj) => {
      if (obj.isMesh && obj.visible && !obj.isHelper && !obj.name.startsWith('__')) {
        box.expandByObject(obj);
        hasObjects = true;
      }
    });

    if (!hasObjects || box.isEmpty()) {
      box.set(new THREE.Vector3(-2, -2, -2), new THREE.Vector3(2, 2, 2));
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 2.0);
    const dist = maxDim * 2.2;

    const dir = new THREE.Vector3().copy(this.camera.position).sub(this.target).normalize();
    if (dir.lengthSq() < 0.1) dir.set(1, 0.8, 1).normalize();

    const newPos = new THREE.Vector3().copy(center).addScaledVector(dir, dist);
    this.animateTo(newPos, center);
  }

  /**
   * Smoothly animates camera position and target
   */
  animateTo(destCamPos, destTarget, duration = 280) {
    this.isAnimating = true;
    this.animDuration = duration;
    this.animStartTime = performance.now();

    this.startCamPos.copy(this.camera.position);
    this.targetCamPos.copy(destCamPos);
    this.startTarget.copy(this.target);
    this.destTarget.copy(destTarget);

    const step = (time) => {
      const elapsed = time - this.animStartTime;
      const progress = Math.min(1.0, elapsed / this.animDuration);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);

      this.camera.position.lerpVectors(this.startCamPos, this.targetCamPos, ease);
      this.target.lerpVectors(this.startTarget, this.destTarget, ease);
      this.camera.lookAt(this.target);

      if (this.sceneManager) {
        this.sceneManager.onCameraMoved();
      }

      if (progress < 1.0) {
        requestAnimationFrame(step);
      } else {
        this.isAnimating = false;
        this.updateSphericalFromCamera();
      }
    };

    requestAnimationFrame(step);
  }
}
