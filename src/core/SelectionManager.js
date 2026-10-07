import * as THREE from 'three';

export class SelectionManager {
  constructor(sceneManager, navigation, domElement) {
    this.sceneManager = sceneManager;
    this.navigation = navigation;
    this.domElement = domElement;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedObjects = new Set();
    this.activeObject = null;

    // Selection helper (Electro Designer bright orange bounding box / outline)
    this.selectionBox = new THREE.BoxHelper(new THREE.Mesh(), 0xe68523);
    this.selectionBox.visible = false;
    this.selectionBox.name = '__selectionBox';
    this.sceneManager.scene.add(this.selectionBox);

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);

    this.bindEvents();
  }

  bindEvents() {
    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  onPointerDown(e) {
    // If Alt is pressed, this is Orbit/Pan/Zoom navigation -> NEVER select!
    if (e.altKey || this.navigation.isNavigating || this.navigation.justNavigated) {
      return;
    }

    // Only left click selects
    if (e.button !== 0) return;

    // Check if transform controls is currently being hovered or dragged
    if (this.transformManager?.isDragging) return;

    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.sceneManager.activeCamera);

    // Filter candidate selectable objects
    const candidates = this.sceneManager.objectsList.filter(
      (obj) => obj.visible && !obj.name.startsWith('__')
    );

    const intersects = this.raycaster.intersectObjects(candidates, true);

    if (intersects.length > 0) {
      // Find top-level scene object
      let hit = intersects[0].object;
      while (hit.parent && hit.parent !== this.sceneManager.scene) {
        hit = hit.parent;
      }

      if (e.shiftKey) {
        // Toggle selection
        if (this.selectedObjects.has(hit)) {
          this.deselect(hit);
        } else {
          this.select(hit, true);
        }
      } else {
        this.select(hit, false);
      }
    } else {
      // Clicked empty space
      if (!e.shiftKey) {
        this.clearSelection();
      }
    }
  }

  select(obj, addToSelection = false) {
    if (!obj || obj.name.startsWith('__')) return;

    if (!addToSelection) {
      this.selectedObjects.clear();
    }

    this.selectedObjects.add(obj);
    this.activeObject = obj;
    this.sceneManager.setSelectedObject(obj);

    this.updateSelectionVisuals();

    if (this.onSelectionChange) {
      this.onSelectionChange(Array.from(this.selectedObjects), this.activeObject);
    }
  }

  deselect(obj) {
    this.selectedObjects.delete(obj);
    if (this.activeObject === obj) {
      this.activeObject = Array.from(this.selectedObjects).pop() || null;
      this.sceneManager.setSelectedObject(this.activeObject);
    }

    this.updateSelectionVisuals();

    if (this.onSelectionChange) {
      this.onSelectionChange(Array.from(this.selectedObjects), this.activeObject);
    }
  }

  clearSelection() {
    this.selectedObjects.clear();
    this.activeObject = null;
    this.sceneManager.setSelectedObject(null);

    this.updateSelectionVisuals();

    if (this.onSelectionChange) {
      this.onSelectionChange([], null);
    }
  }

  selectAll() {
    this.selectedObjects.clear();
    this.sceneManager.objectsList.forEach((obj) => {
      if (obj.visible && !obj.name.startsWith('__')) {
        this.selectedObjects.add(obj);
      }
    });

    this.activeObject = Array.from(this.selectedObjects)[0] || null;
    this.sceneManager.setSelectedObject(this.activeObject);
    this.updateSelectionVisuals();

    if (this.onSelectionChange) {
      this.onSelectionChange(Array.from(this.selectedObjects), this.activeObject);
    }
  }

  updateSelectionVisuals() {
    if (this.activeObject && this.activeObject.visible) {
      this.selectionBox.setFromObject(this.activeObject);
      this.selectionBox.visible = true;
    } else {
      this.selectionBox.visible = false;
    }
  }

  onKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      return;
    }

    // Electro Designer Shortcuts:
    // A: Select All
    // Alt + A: Deselect All
    if (e.code === 'KeyA') {
      // In edit mode, let EditModeManager handle select-all
      if (this.sceneManager.editor?.editModeManager?.mode === 'EDIT') return;
      e.preventDefault();
      if (e.altKey) {
        this.clearSelection();
      } else {
        this.selectAll();
      }
    }

    // H: Hide selected object
    // Alt + H: Unhide all objects
    if (e.code === 'KeyH') {
      e.preventDefault();
      if (e.altKey) {
        this.sceneManager.objectsList.forEach((obj) => {
          obj.visible = true;
        });
        this.updateSelectionVisuals();
      } else if (this.activeObject) {
        this.activeObject.visible = false;
        this.clearSelection();
      }
    }

    // X or Delete: Delete active object (only in Object mode)
    if (e.code === 'Delete' || e.code === 'KeyX') {
      // Don't delete object when in edit mode — EditModeManager handles element deletion
      if (this.sceneManager.editor?.editModeManager?.mode === 'EDIT') return;
      const objectsToDelete = this.selectedObjects.size
        ? Array.from(this.selectedObjects)
        : this.activeObject ? [this.activeObject] : [];
      if (objectsToDelete.length) {
        e.preventDefault();
        objectsToDelete.forEach((obj) => this.sceneManager.removeObject(obj));
        this.clearSelection();
      }
    }

    // Shift + D: Duplicate
    if (e.code === 'KeyD' && e.shiftKey) {
      e.preventDefault();
      const clone = this.sceneManager.duplicateSelectedObject();
      if (clone) {
        this.select(clone, false);
      }
    }
  }
}
