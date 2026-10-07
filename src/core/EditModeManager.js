import * as THREE from 'three';

export const EditorMode = {
  OBJECT: 'OBJECT',
  EDIT: 'EDIT'
};

export const SelectionMode = {
  VERTEX: 'VERTEX',
  EDGE: 'EDGE',
  FACE: 'FACE'
};

export class EditModeManager {
  constructor(editor) {
    this.editor = editor;
    this.mode = EditorMode.OBJECT;
    this.selectionMode = SelectionMode.VERTEX;
    this.activeMesh = null;

    // Selection state
    this.selectedVertexIndices = new Set();
    this.selectedEdgeKeys = new Set();   // "i-j" strings
    this.selectedFaceIndices = new Set();

    // Visual helpers
    this.vertexPoints = null;
    this.edgeLines = null;
    this.faceOverlay = null;
    this.wireframeLines = null;

    // Edge / Face derived data
    this.edgeList = [];       // [{a, b, key}, ...]
    this.faceList = [];       // [{a, b, c, center}, ...]
    this.faceCentroids = null; // THREE.Points for face picking

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 0.15;
    this.raycaster.params.Line = { threshold: 0.08 };
    this.mouse = new THREE.Vector2();

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);

    window.addEventListener('keydown', this.onKeyDown);
    this.editor.domElement.addEventListener('pointerdown', this.onPointerDown);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    this.editor.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.cleanupEditMode();
  }

  /* ======================================================================
     Mode Switching
     ====================================================================== */

  toggleMode() {
    if (this.mode === EditorMode.OBJECT) {
      this.enterEditMode();
    } else {
      this.enterObjectMode();
    }
  }

  enterEditMode() {
    const active = this.editor.selectionManager.activeObject;
    if (!active || !active.isMesh) {
      console.warn('Cannot enter Edit Mode without an active mesh selected.');
      return;
    }

    this.mode = EditorMode.EDIT;
    this.activeMesh = active;
    this.clearAllSelections();

    // Ensure geometry has index buffer for edge/face operations
    this._ensureIndexed();

    this.buildHelpers();

    if (this.editor.onModeChanged) {
      this.editor.onModeChanged(this.mode);
    }
  }

  enterObjectMode() {
    this.cleanupEditMode();
    this.mode = EditorMode.OBJECT;
    this.activeMesh = null;

    if (this.editor.onModeChanged) {
      this.editor.onModeChanged(this.mode);
    }
  }

  setSelectionMode(mode) {
    if (this.selectionMode === mode) return;
    this.selectionMode = mode;
    this.clearAllSelections();
    this.updateAllVisuals();

    if (this.editor.onSelectionModeChanged) {
      this.editor.onSelectionModeChanged(mode);
    }
  }

  clearAllSelections() {
    this.selectedVertexIndices.clear();
    this.selectedEdgeKeys.clear();
    this.selectedFaceIndices.clear();
  }

  /* ======================================================================
     Geometry Helpers — ensure indexed, derive edges/faces
     ====================================================================== */

  _ensureIndexed() {
    const geom = this.activeMesh.geometry;
    if (!geom.index) {
      // Non-indexed → generate trivial index
      const pos = geom.attributes.position;
      const indices = [];
      for (let i = 0; i < pos.count; i++) indices.push(i);
      geom.setIndex(indices);
    }
  }

  _deriveTopology() {
    const geom = this.activeMesh.geometry;
    const idx = geom.index;
    const pos = geom.attributes.position;

    // --- Edges ---
    const edgeSet = new Set();
    this.edgeList = [];
    const triCount = idx.count / 3;

    for (let t = 0; t < triCount; t++) {
      const a = idx.getX(t * 3);
      const b = idx.getX(t * 3 + 1);
      const c = idx.getX(t * 3 + 2);

      const pairs = [[a, b], [b, c], [c, a]];
      for (const [p, q] of pairs) {
        const lo = Math.min(p, q);
        const hi = Math.max(p, q);
        const key = `${lo}-${hi}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          this.edgeList.push({ a: lo, b: hi, key });
        }
      }
    }

    // --- Faces ---
    this.faceList = [];
    for (let t = 0; t < triCount; t++) {
      const a = idx.getX(t * 3);
      const b = idx.getX(t * 3 + 1);
      const c = idx.getX(t * 3 + 2);

      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
      const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
      const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;

      this.faceList.push({ a, b, c, center: new THREE.Vector3(cx, cy, cz) });
    }
  }

  /* ======================================================================
     Build Visual Helpers
     ====================================================================== */

  buildHelpers() {
    this.cleanupEditMode();
    if (!this.activeMesh) return;

    this._deriveTopology();

    const worldMat = this.activeMesh.matrixWorld;

    // 1) Vertex points
    this._buildVertexPoints(worldMat);

    // 2) Edge line segments
    this._buildEdgeLines(worldMat);

    // 3) Wireframe overlay
    this._buildWireframe(worldMat);

    // 4) Face centroid points (for picking) + face overlay mesh
    this._buildFaceHelpers(worldMat);

    this.updateAllVisuals();
  }

  _buildVertexPoints(worldMat) {
    const geom = this.activeMesh.geometry;
    const pos = geom.attributes.position;

    const pointsGeom = new THREE.BufferGeometry();
    pointsGeom.setAttribute('position', pos.clone());

    const colors = new Float32Array(pos.count * 3);
    pointsGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      sizeAttenuation: true,
      depthTest: false,
      transparent: true
    });

    this.vertexPoints = new THREE.Points(pointsGeom, mat);
    this.vertexPoints.name = '__editModeVertices';
    this.vertexPoints.renderOrder = 999;
    this.vertexPoints.matrixAutoUpdate = false;
    this.vertexPoints.matrix.copy(worldMat);

    this.editor.sceneManager.scene.add(this.vertexPoints);
  }

  _buildEdgeLines(worldMat) {
    const geom = this.activeMesh.geometry;
    const pos = geom.attributes.position;

    // Build line segments: 2 vertices per edge
    const linePos = new Float32Array(this.edgeList.length * 6);
    const lineCol = new Float32Array(this.edgeList.length * 6);

    for (let i = 0; i < this.edgeList.length; i++) {
      const { a, b } = this.edgeList[i];
      const offset = i * 6;
      linePos[offset]     = pos.getX(a);
      linePos[offset + 1] = pos.getY(a);
      linePos[offset + 2] = pos.getZ(a);
      linePos[offset + 3] = pos.getX(b);
      linePos[offset + 4] = pos.getY(b);
      linePos[offset + 5] = pos.getZ(b);
    }

    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    lineGeom.setAttribute('color', new THREE.BufferAttribute(lineCol, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
      transparent: true,
      linewidth: 1
    });

    this.edgeLines = new THREE.LineSegments(lineGeom, lineMat);
    this.edgeLines.name = '__editModeEdges';
    this.edgeLines.renderOrder = 998;
    this.edgeLines.matrixAutoUpdate = false;
    this.edgeLines.matrix.copy(worldMat);

    this.editor.sceneManager.scene.add(this.edgeLines);
  }

  _buildWireframe(worldMat) {
    const geom = this.activeMesh.geometry;
    const wireGeom = new THREE.WireframeGeometry(geom);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x333333,
      depthTest: true,
      transparent: true,
      opacity: 0.4
    });

    this.wireframeLines = new THREE.LineSegments(wireGeom, wireMat);
    this.wireframeLines.name = '__editModeWireframe';
    this.wireframeLines.renderOrder = 990;
    this.wireframeLines.matrixAutoUpdate = false;
    this.wireframeLines.matrix.copy(worldMat);

    this.editor.sceneManager.scene.add(this.wireframeLines);
  }

  _buildFaceHelpers(worldMat) {
    const geom = this.activeMesh.geometry;
    const pos = geom.attributes.position;
    const idx = geom.index;

    // Face centroids for picking
    const centroidPos = new Float32Array(this.faceList.length * 3);
    const centroidCol = new Float32Array(this.faceList.length * 3);

    for (let i = 0; i < this.faceList.length; i++) {
      const fc = this.faceList[i].center;
      centroidPos[i * 3] = fc.x;
      centroidPos[i * 3 + 1] = fc.y;
      centroidPos[i * 3 + 2] = fc.z;
    }

    const centGeom = new THREE.BufferGeometry();
    centGeom.setAttribute('position', new THREE.BufferAttribute(centroidPos, 3));
    centGeom.setAttribute('color', new THREE.BufferAttribute(centroidCol, 3));

    const centMat = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      sizeAttenuation: true,
      depthTest: false,
      transparent: true,
      opacity: 0.8
    });

    this.faceCentroids = new THREE.Points(centGeom, centMat);
    this.faceCentroids.name = '__editModeFaceCentroids';
    this.faceCentroids.renderOrder = 997;
    this.faceCentroids.matrixAutoUpdate = false;
    this.faceCentroids.matrix.copy(worldMat);

    this.editor.sceneManager.scene.add(this.faceCentroids);

    // Face overlay: a mesh with per-face color for highlighting selected faces
    const overlayGeom = new THREE.BufferGeometry();
    const overlayPos = new Float32Array(this.faceList.length * 9); // 3 verts × 3 components
    const overlayCol = new Float32Array(this.faceList.length * 9);

    for (let i = 0; i < this.faceList.length; i++) {
      const { a, b, c } = this.faceList[i];
      const off = i * 9;
      overlayPos[off]     = pos.getX(a); overlayPos[off + 1] = pos.getY(a); overlayPos[off + 2] = pos.getZ(a);
      overlayPos[off + 3] = pos.getX(b); overlayPos[off + 4] = pos.getY(b); overlayPos[off + 5] = pos.getZ(b);
      overlayPos[off + 6] = pos.getX(c); overlayPos[off + 7] = pos.getY(c); overlayPos[off + 8] = pos.getZ(c);
    }

    overlayGeom.setAttribute('position', new THREE.BufferAttribute(overlayPos, 3));
    overlayGeom.setAttribute('color', new THREE.BufferAttribute(overlayCol, 3));

    const overlayMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthTest: false
    });

    this.faceOverlay = new THREE.Mesh(overlayGeom, overlayMat);
    this.faceOverlay.name = '__editModeFaceOverlay';
    this.faceOverlay.renderOrder = 996;
    this.faceOverlay.matrixAutoUpdate = false;
    this.faceOverlay.matrix.copy(worldMat);

    this.editor.sceneManager.scene.add(this.faceOverlay);
  }

  /* ======================================================================
     Visual Update
     ====================================================================== */

  updateAllVisuals() {
    this._updateVertexColors();
    this._updateEdgeColors();
    this._updateFaceColors();
    this._updateHelperVisibility();
  }

  _updateHelperVisibility() {
    // Vertex points always visible but size changes
    if (this.vertexPoints) {
      this.vertexPoints.material.size = this.selectionMode === SelectionMode.VERTEX ? 0.12 : 0.06;
      this.vertexPoints.material.opacity = this.selectionMode === SelectionMode.VERTEX ? 1.0 : 0.4;
    }
    // Edge lines always visible
    if (this.edgeLines) {
      this.edgeLines.material.opacity = this.selectionMode === SelectionMode.EDGE ? 1.0 : 0.3;
    }
    // Face overlay only visible in face mode
    if (this.faceOverlay) {
      this.faceOverlay.visible = this.selectionMode === SelectionMode.FACE;
    }
    if (this.faceCentroids) {
      this.faceCentroids.visible = this.selectionMode === SelectionMode.FACE;
    }
  }

  _updateVertexColors() {
    if (!this.vertexPoints) return;
    const colors = this.vertexPoints.geometry.attributes.color;
    if (!colors) return;

    for (let i = 0; i < colors.count; i++) {
      if (this.selectedVertexIndices.has(i)) {
        // Electro Designer orange selected
        colors.setXYZ(i, 0.9, 0.5, 0.1);
      } else {
        // Unselected
        colors.setXYZ(i, 0.15, 0.15, 0.15);
      }
    }
    colors.needsUpdate = true;
  }

  _updateEdgeColors() {
    if (!this.edgeLines) return;
    const colors = this.edgeLines.geometry.attributes.color;
    if (!colors) return;

    for (let i = 0; i < this.edgeList.length; i++) {
      const edge = this.edgeList[i];
      const selected = this.selectedEdgeKeys.has(edge.key);
      const r = selected ? 0.9 : 0.25;
      const g = selected ? 0.5 : 0.25;
      const b = selected ? 0.1 : 0.25;

      const off = i * 2;
      colors.setXYZ(off, r, g, b);
      colors.setXYZ(off + 1, r, g, b);
    }
    colors.needsUpdate = true;
  }

  _updateFaceColors() {
    // Update face overlay colors
    if (!this.faceOverlay) return;
    const colors = this.faceOverlay.geometry.attributes.color;
    if (!colors) return;

    for (let i = 0; i < this.faceList.length; i++) {
      const selected = this.selectedFaceIndices.has(i);
      const r = selected ? 0.9 : 0.0;
      const g = selected ? 0.5 : 0.0;
      const b = selected ? 0.1 : 0.0;

      const off = i * 3;
      colors.setXYZ(off, r, g, b);
      colors.setXYZ(off + 1, r, g, b);
      colors.setXYZ(off + 2, r, g, b);
    }
    colors.needsUpdate = true;

    // Update face centroid dot colors
    if (!this.faceCentroids) return;
    const cColors = this.faceCentroids.geometry.attributes.color;
    for (let i = 0; i < this.faceList.length; i++) {
      const selected = this.selectedFaceIndices.has(i);
      cColors.setXYZ(i, selected ? 1.0 : 0.3, selected ? 0.6 : 0.3, selected ? 0.2 : 0.3);
    }
    cColors.needsUpdate = true;
  }

  /* ======================================================================
     Cleanup
     ====================================================================== */

  cleanupEditMode() {
    const scene = this.editor.sceneManager.scene;

    const removeHelper = (obj) => {
      if (obj) {
        scene.remove(obj);
        obj.geometry?.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      }
    };

    removeHelper(this.vertexPoints);
    removeHelper(this.edgeLines);
    removeHelper(this.wireframeLines);
    removeHelper(this.faceOverlay);
    removeHelper(this.faceCentroids);

    this.vertexPoints = null;
    this.edgeLines = null;
    this.wireframeLines = null;
    this.faceOverlay = null;
    this.faceCentroids = null;

    this.clearAllSelections();
    this.edgeList = [];
    this.faceList = [];
  }

  /* ======================================================================
     Pointer Handling — selection picking
     ====================================================================== */

  onPointerDown(e) {
    if (this.mode !== EditorMode.EDIT) return;
    if (e.altKey || this.editor.navigation.isNavigating) return;
    if (e.button !== 0) return;

    const rect = this.editor.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.editor.sceneManager.activeCamera);

    switch (this.selectionMode) {
      case SelectionMode.VERTEX: this._pickVertex(e); break;
      case SelectionMode.EDGE:   this._pickEdge(e);   break;
      case SelectionMode.FACE:   this._pickFace(e);   break;
    }
  }

  _pickVertex(e) {
    if (!this.vertexPoints) return;
    const intersects = this.raycaster.intersectObject(this.vertexPoints);

    if (intersects.length > 0) {
      const idx = intersects[0].index;
      if (e.shiftKey) {
        if (this.selectedVertexIndices.has(idx)) {
          this.selectedVertexIndices.delete(idx);
        } else {
          this.selectedVertexIndices.add(idx);
        }
      } else {
        this.selectedVertexIndices.clear();
        this.selectedVertexIndices.add(idx);
      }
    } else if (!e.shiftKey) {
      this.selectedVertexIndices.clear();
    }
    this.updateAllVisuals();
    this._fireSelectionInfo();
  }

  _pickEdge(e) {
    if (!this.edgeLines) return;
    const intersects = this.raycaster.intersectObject(this.edgeLines);

    if (intersects.length > 0) {
      // faceIndex for LineSegments is the line segment index
      const segIdx = intersects[0].faceIndex ?? Math.floor(intersects[0].index / 2);
      if (segIdx >= 0 && segIdx < this.edgeList.length) {
        const edge = this.edgeList[segIdx];
        if (e.shiftKey) {
          if (this.selectedEdgeKeys.has(edge.key)) {
            this.selectedEdgeKeys.delete(edge.key);
          } else {
            this.selectedEdgeKeys.add(edge.key);
          }
        } else {
          this.selectedEdgeKeys.clear();
          this.selectedEdgeKeys.add(edge.key);
        }
      }
    } else if (!e.shiftKey) {
      this.selectedEdgeKeys.clear();
    }
    this.updateAllVisuals();
    this._fireSelectionInfo();
  }

  _pickFace(e) {
    if (!this.activeMesh) return;

    // Raycast against the actual mesh to find exact face
    const intersects = this.raycaster.intersectObject(this.activeMesh);
    if (intersects.length > 0) {
      const faceIdx = intersects[0].faceIndex;
      if (faceIdx !== undefined && faceIdx >= 0 && faceIdx < this.faceList.length) {
        if (e.shiftKey) {
          if (this.selectedFaceIndices.has(faceIdx)) {
            this.selectedFaceIndices.delete(faceIdx);
          } else {
            this.selectedFaceIndices.add(faceIdx);
          }
        } else {
          this.selectedFaceIndices.clear();
          this.selectedFaceIndices.add(faceIdx);
        }
      }
    } else if (!e.shiftKey) {
      this.selectedFaceIndices.clear();
    }
    this.updateAllVisuals();
    this._fireSelectionInfo();
  }

  _fireSelectionInfo() {
    if (this.editor.onEditSelectionChanged) {
      this.editor.onEditSelectionChanged({
        mode: this.selectionMode,
        vertices: this.selectedVertexIndices.size,
        edges: this.selectedEdgeKeys.size,
        faces: this.selectedFaceIndices.size
      });
    }
  }

  /* ======================================================================
     Selection Info
     ====================================================================== */

  getSelectionInfo() {
    switch (this.selectionMode) {
      case SelectionMode.VERTEX:
        return { mode: 'Vertex', count: this.selectedVertexIndices.size, total: this.vertexPoints?.geometry?.attributes?.position?.count ?? 0 };
      case SelectionMode.EDGE:
        return { mode: 'Edge', count: this.selectedEdgeKeys.size, total: this.edgeList.length };
      case SelectionMode.FACE:
        return { mode: 'Face', count: this.selectedFaceIndices.size, total: this.faceList.length };
    }
  }

  /* ======================================================================
     Edit Operations
     ====================================================================== */

  extrudeSelected(pushHistory = true) {
    if (this.mode !== EditorMode.EDIT || !this.activeMesh) return;
    const geom = this.activeMesh.geometry;
    const pos = geom.attributes.position;
    if (!pos) return;

    const oldArray = Float32Array.from(pos.array);

    geom.computeVertexNormals();
    const normals = geom.attributes.normal;

    let indices;
    if (this.selectionMode === SelectionMode.VERTEX) {
      indices = this.selectedVertexIndices.size > 0
        ? Array.from(this.selectedVertexIndices)
        : Array.from({ length: pos.count }, (_, i) => i);
    } else if (this.selectionMode === SelectionMode.EDGE) {
      const vertSet = new Set();
      for (const key of this.selectedEdgeKeys) {
        const [a, b] = key.split('-').map(Number);
        vertSet.add(a);
        vertSet.add(b);
      }
      indices = vertSet.size > 0 ? Array.from(vertSet) : Array.from({ length: pos.count }, (_, i) => i);
    } else if (this.selectionMode === SelectionMode.FACE) {
      const vertSet = new Set();
      for (const fi of this.selectedFaceIndices) {
        if (fi < this.faceList.length) {
          const face = this.faceList[fi];
          vertSet.add(face.a);
          vertSet.add(face.b);
          vertSet.add(face.c);
        }
      }
      indices = vertSet.size > 0 ? Array.from(vertSet) : Array.from({ length: pos.count }, (_, i) => i);
    }

    const extrudeAmount = 0.4;
    for (const idx of indices) {
      const nx = normals.getX(idx);
      const ny = normals.getY(idx);
      const nz = normals.getZ(idx);
      pos.setXYZ(idx, pos.getX(idx) + nx * extrudeAmount, pos.getY(idx) + ny * extrudeAmount, pos.getZ(idx) + nz * extrudeAmount);
    }

    pos.needsUpdate = true;
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    geom.computeBoundingBox();
    this.buildHelpers();

    const newArray = Float32Array.from(pos.array);
    if (pushHistory && this.editor?.historyManager) {
      const modeLabel = this.selectionMode.charAt(0) + this.selectionMode.slice(1).toLowerCase();
      this.editor.historyManager.pushState(`Extrude ${modeLabel}`, () => {
        pos.array.set(oldArray);
        pos.needsUpdate = true;
        geom.computeVertexNormals();
        this.buildHelpers();
      }, () => {
        pos.array.set(newArray);
        pos.needsUpdate = true;
        geom.computeVertexNormals();
        this.buildHelpers();
      });
    }
  }

  subdivideMesh(pushHistory = true) {
    if (this.mode !== EditorMode.EDIT || !this.activeMesh) return;
    const prevGeom = this.activeMesh.geometry.clone();
    const newGeom = this.editor.geometryUtils.subdivideGeometry(this.activeMesh.geometry);
    this.activeMesh.geometry.dispose();
    this.activeMesh.geometry = newGeom;
    this._ensureIndexed();
    this.buildHelpers();

    if (pushHistory && this.editor?.historyManager) {
      this.editor.historyManager.pushState('Subdivide Mesh', () => {
        this.activeMesh.geometry.dispose();
        this.activeMesh.geometry = prevGeom.clone();
        this._ensureIndexed();
        this.buildHelpers();
      }, () => {
        this.activeMesh.geometry.dispose();
        this.activeMesh.geometry = newGeom.clone();
        this._ensureIndexed();
        this.buildHelpers();
      });
    }
  }

  deleteSelected(pushHistory = true) {
    if (this.mode !== EditorMode.EDIT || !this.activeMesh) return;
    const geom = this.activeMesh.geometry;
    const pos = geom.attributes.position;
    const idx = geom.index;
    if (!idx) return;

    const oldPosArray = Float32Array.from(pos.array);
    const oldIdxArray = Uint32Array.from(idx.array);
    const triCount = idx.count / 3;

    let facesToRemove = new Set();

    if (this.selectionMode === SelectionMode.FACE) {
      facesToRemove = new Set(this.selectedFaceIndices);
    } else if (this.selectionMode === SelectionMode.EDGE) {
      // Remove faces that contain any selected edge
      for (let t = 0; t < triCount; t++) {
        const a = idx.getX(t * 3);
        const b = idx.getX(t * 3 + 1);
        const c = idx.getX(t * 3 + 2);
        const pairs = [[a, b], [b, c], [c, a]];
        for (const [p, q] of pairs) {
          const lo = Math.min(p, q);
          const hi = Math.max(p, q);
          const key = `${lo}-${hi}`;
          if (this.selectedEdgeKeys.has(key)) {
            facesToRemove.add(t);
            break;
          }
        }
      }
    } else if (this.selectionMode === SelectionMode.VERTEX) {
      // Remove faces that contain any selected vertex
      for (let t = 0; t < triCount; t++) {
        const a = idx.getX(t * 3);
        const b = idx.getX(t * 3 + 1);
        const c = idx.getX(t * 3 + 2);
        if (this.selectedVertexIndices.has(a) || this.selectedVertexIndices.has(b) || this.selectedVertexIndices.has(c)) {
          facesToRemove.add(t);
        }
      }
    }

    if (facesToRemove.size === 0) return;

    // Build new index buffer without removed faces
    const newIndices = [];
    for (let t = 0; t < triCount; t++) {
      if (!facesToRemove.has(t)) {
        newIndices.push(idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2));
      }
    }

    geom.setIndex(newIndices);
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    geom.computeBoundingBox();

    this.clearAllSelections();
    this.buildHelpers();

    if (pushHistory && this.editor?.historyManager) {
      const modeLabel = this.selectionMode.charAt(0) + this.selectionMode.slice(1).toLowerCase();
      this.editor.historyManager.pushState(`Delete ${modeLabel}`, () => {
        pos.array.set(oldPosArray);
        pos.needsUpdate = true;
        geom.setIndex(Array.from(oldIdxArray));
        geom.computeVertexNormals();
        this.buildHelpers();
      }, () => {
        geom.setIndex(newIndices);
        geom.computeVertexNormals();
        this.buildHelpers();
      });
    }
  }

  insetFaces(pushHistory = true) {
    if (this.mode !== EditorMode.EDIT || !this.activeMesh) return;
    if (this.selectionMode !== SelectionMode.FACE || this.selectedFaceIndices.size === 0) return;

    const geom = this.activeMesh.geometry;
    const pos = geom.attributes.position;
    const idx = geom.index;
    if (!idx) return;

    // Save state for undo
    const oldPosArray = Float32Array.from(pos.array);
    const oldIdxArray = Array.from(idx.array);

    const insetAmount = 0.3; // inset toward centroid

    // For each selected face, create an inner triangle and 3 connecting quads
    const newPositions = Array.from(pos.array);
    const newIndices = Array.from(idx.array);

    // Process selected faces in reverse to not mess up indices
    const selectedFaces = Array.from(this.selectedFaceIndices).sort((a, b) => b - a);

    for (const fi of selectedFaces) {
      if (fi >= this.faceList.length) continue;
      const face = this.faceList[fi];
      const vA = new THREE.Vector3(pos.getX(face.a), pos.getY(face.a), pos.getZ(face.a));
      const vB = new THREE.Vector3(pos.getX(face.b), pos.getY(face.b), pos.getZ(face.b));
      const vC = new THREE.Vector3(pos.getX(face.c), pos.getY(face.c), pos.getZ(face.c));

      const center = new THREE.Vector3().addVectors(vA, vB).add(vC).divideScalar(3);

      // New inner vertices (lerp toward center)
      const iA = new THREE.Vector3().lerpVectors(vA, center, insetAmount);
      const iB = new THREE.Vector3().lerpVectors(vB, center, insetAmount);
      const iC = new THREE.Vector3().lerpVectors(vC, center, insetAmount);

      // Add 3 new vertices
      const baseIdx = newPositions.length / 3;
      newPositions.push(iA.x, iA.y, iA.z);
      newPositions.push(iB.x, iB.y, iB.z);
      newPositions.push(iC.x, iC.y, iC.z);

      const idxIA = baseIdx;
      const idxIB = baseIdx + 1;
      const idxIC = baseIdx + 2;

      // Replace original face with inner face
      const faceStart = fi * 3;
      newIndices[faceStart]     = idxIA;
      newIndices[faceStart + 1] = idxIB;
      newIndices[faceStart + 2] = idxIC;

      // Add 3 connecting quads (each as 2 triangles)
      // Quad 1: A, B, iB, iA
      newIndices.push(face.a, face.b, idxIB);
      newIndices.push(face.a, idxIB, idxIA);

      // Quad 2: B, C, iC, iB
      newIndices.push(face.b, face.c, idxIC);
      newIndices.push(face.b, idxIC, idxIB);

      // Quad 3: C, A, iA, iC
      newIndices.push(face.c, face.a, idxIA);
      newIndices.push(face.c, idxIA, idxIC);
    }

    // Apply
    const newPosArray = new Float32Array(newPositions);
    geom.setAttribute('position', new THREE.BufferAttribute(newPosArray, 3));
    geom.setIndex(newIndices);
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    geom.computeBoundingBox();

    this.clearAllSelections();
    this._ensureIndexed();
    this.buildHelpers();

    if (pushHistory && this.editor?.historyManager) {
      this.editor.historyManager.pushState('Inset Faces', () => {
        geom.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(oldPosArray), 3));
        geom.setIndex(Array.from(oldIdxArray));
        geom.computeVertexNormals();
        this._ensureIndexed();
        this.buildHelpers();
      }, () => {
        geom.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(newPosArray), 3));
        geom.setIndex(Array.from(newIndices));
        geom.computeVertexNormals();
        this._ensureIndexed();
        this.buildHelpers();
      });
    }
  }

  /* ======================================================================
     Keyboard
     ====================================================================== */

  onKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      return;
    }

    // Tab key toggles Object / Edit mode
    if (e.code === 'Tab') {
      e.preventDefault();
      this.toggleMode();
    }

    // Only handle the rest in Edit Mode
    if (this.mode !== EditorMode.EDIT) return;

    // 1 / 2 / 3 = Vertex / Edge / Face mode (Electro Designer convention)
    if (e.code === 'Digit1' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      this.setSelectionMode(SelectionMode.VERTEX);
    }
    if (e.code === 'Digit2' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      this.setSelectionMode(SelectionMode.EDGE);
    }
    if (e.code === 'Digit3' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      this.setSelectionMode(SelectionMode.FACE);
    }

    // E = Extrude
    if (e.code === 'KeyE' && !e.shiftKey) {
      e.preventDefault();
      this.extrudeSelected();
    }

    // X / Delete = Delete selected elements
    if (e.code === 'KeyX' || e.code === 'Delete') {
      const hasSelection =
        this.selectedVertexIndices.size > 0 ||
        this.selectedEdgeKeys.size > 0 ||
        this.selectedFaceIndices.size > 0;

      if (hasSelection) {
        e.preventDefault();
        e.stopPropagation();
        this.deleteSelected();
      }
    }

    // I = Inset Faces (only in face mode)
    if (e.code === 'KeyI' && this.selectionMode === SelectionMode.FACE) {
      if (this.selectedFaceIndices.size > 0) {
        e.preventDefault();
        this.insetFaces();
      }
    }

    // A = Select All / Alt+A = Deselect All (in edit mode)
    if (e.code === 'KeyA') {
      e.preventDefault();
      if (e.altKey) {
        this.clearAllSelections();
      } else {
        this._selectAll();
      }
      this.updateAllVisuals();
      this._fireSelectionInfo();
    }
  }

  _selectAll() {
    switch (this.selectionMode) {
      case SelectionMode.VERTEX: {
        const count = this.vertexPoints?.geometry?.attributes?.position?.count ?? 0;
        for (let i = 0; i < count; i++) this.selectedVertexIndices.add(i);
        break;
      }
      case SelectionMode.EDGE: {
        for (const edge of this.edgeList) this.selectedEdgeKeys.add(edge.key);
        break;
      }
      case SelectionMode.FACE: {
        for (let i = 0; i < this.faceList.length; i++) this.selectedFaceIndices.add(i);
        break;
      }
    }
  }
}
