import * as THREE from 'three';

export class GeometryUtils {
  /**
   * Generates Suzanne (Electro Designer Monkey) geometry
   */
  static createMonkeyGeometry() {
    const geom = new THREE.BufferGeometry();
    
    // Stylized low-poly monkey (Suzanne) coordinates
    const vertices = new Float32Array([
      // Cranium / Forehead
      0.0, 1.2, -0.2,   -0.5, 1.0, 0.1,    0.5, 1.0, 0.1,
      0.0, 1.2, -0.2,    0.5, 1.0, 0.1,    0.7, 0.8, -0.4,
      0.0, 1.2, -0.2,   -0.7, 0.8, -0.4,  -0.5, 1.0, 0.1,
      0.0, 1.2, -0.2,    0.0, 0.9, -0.8,   0.7, 0.8, -0.4,
      0.0, 1.2, -0.2,   -0.7, 0.8, -0.4,   0.0, 0.9, -0.8,

      // Brow ridge
      -0.5, 1.0, 0.1,    0.0, 0.8, 0.4,    0.5, 1.0, 0.1,
      -0.5, 1.0, 0.1,   -0.8, 0.6, 0.3,    0.0, 0.8, 0.4,
       0.5, 1.0, 0.1,    0.0, 0.8, 0.4,    0.8, 0.6, 0.3,

      // Eyes (left and right socket & bulb)
      -0.8, 0.6, 0.3,   -0.5, 0.3, 0.5,    0.0, 0.8, 0.4,
       0.8, 0.6, 0.3,    0.0, 0.8, 0.4,    0.5, 0.3, 0.5,
       0.0, 0.8, 0.4,   -0.5, 0.3, 0.5,    0.0, 0.4, 0.6,
       0.0, 0.8, 0.4,    0.0, 0.4, 0.6,    0.5, 0.3, 0.5,

      // Snout / Nose
       0.0, 0.4, 0.6,   -0.4, -0.1, 0.8,   0.4, -0.1, 0.8,
       0.0, 0.4, 0.6,   -0.5, 0.3, 0.5,   -0.4, -0.1, 0.8,
       0.0, 0.4, 0.6,    0.4, -0.1, 0.8,   0.5, 0.3, 0.5,

      // Mouth / Chin
      -0.4, -0.1, 0.8,  -0.3, -0.5, 0.5,   0.3, -0.5, 0.5,
      -0.4, -0.1, 0.8,   0.3, -0.5, 0.5,   0.4, -0.1, 0.8,
       0.0, -0.7, 0.3,  -0.3, -0.5, 0.5,   0.3, -0.5, 0.5,

      // Cheeks & Jaw
      -0.8, 0.6, 0.3,   -0.8, -0.1, 0.1,  -0.5, 0.3, 0.5,
      -0.5, 0.3, 0.5,   -0.8, -0.1, 0.1,  -0.4, -0.1, 0.8,
      -0.4, -0.1, 0.8,  -0.8, -0.1, 0.1,  -0.3, -0.5, 0.5,

       0.8, 0.6, 0.3,    0.5, 0.3, 0.5,    0.8, -0.1, 0.1,
       0.5, 0.3, 0.5,    0.4, -0.1, 0.8,   0.8, -0.1, 0.1,
       0.4, -0.1, 0.8,   0.3, -0.5, 0.5,   0.8, -0.1, 0.1,

      // Ears (Left)
      -0.7, 0.8, -0.4,  -1.3, 0.7, -0.1,  -0.8, 0.6, 0.3,
      -0.8, 0.6, 0.3,   -1.3, 0.7, -0.1,  -1.2, 0.2, 0.0,
      -0.8, 0.6, 0.3,   -1.2, 0.2, 0.0,   -0.8, -0.1, 0.1,

      // Ears (Right)
       0.7, 0.8, -0.4,   0.8, 0.6, 0.3,    1.3, 0.7, -0.1,
       0.8, 0.6, 0.3,    1.2, 0.2, 0.0,    1.3, 0.7, -0.1,
       0.8, 0.6, 0.3,    0.8, -0.1, 0.1,   1.2, 0.2, 0.0,

      // Back of head & base
       0.0, 0.9, -0.8,   0.7, 0.8, -0.4,   0.5, 0.1, -0.7,
       0.0, 0.9, -0.8,  -0.5, 0.1, -0.7,  -0.7, 0.8, -0.4,
       0.0, 0.9, -0.8,   0.0, -0.2, -0.8,  0.5, 0.1, -0.7,
       0.0, 0.9, -0.8,  -0.5, 0.1, -0.7,   0.0, -0.2, -0.8,
       0.0, -0.7, 0.3,   0.0, -0.2, -0.8, -0.3, -0.5, 0.5,
       0.0, -0.7, 0.3,   0.3, -0.5, 0.5,   0.0, -0.2, -0.8
    ]);

    geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geom.computeVertexNormals();
    return geom;
  }

  /**
   * Get counts of vertices, edges, faces, triangles for an object or scene
   */
  static getMeshStatistics(target) {
    let vertices = 0;
    let faces = 0;
    let triangles = 0;

    target.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const geom = child.geometry;
        const pos = geom.attributes.position;
        if (pos) {
          vertices += pos.count;
          if (geom.index) {
            triangles += geom.index.count / 3;
            faces += geom.index.count / 3;
          } else {
            triangles += pos.count / 3;
            faces += pos.count / 3;
          }
        }
      }
    });

    const edges = Math.round(vertices + faces - 2); // Euler characteristic approximation
    return {
      vertices,
      edges: Math.max(0, edges),
      faces,
      triangles
    };
  }

  /**
   * Subdivide a geometry (Catmull-Clark / Loop style mid-point subdivision)
   */
  static subdivideGeometry(geometry) {
    const nonIndexed = geometry.toNonIndexed();
    const pos = nonIndexed.attributes.position;
    const vertexCount = pos.count;
    const newPositions = [];

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const mAB = new THREE.Vector3();
    const mBC = new THREE.Vector3();
    const mCA = new THREE.Vector3();

    for (let i = 0; i < vertexCount; i += 3) {
      vA.fromBufferAttribute(pos, i);
      vB.fromBufferAttribute(pos, i + 1);
      vC.fromBufferAttribute(pos, i + 2);

      // Midpoints
      mAB.addVectors(vA, vB).multiplyScalar(0.5);
      mBC.addVectors(vB, vC).multiplyScalar(0.5);
      mCA.addVectors(vC, vA).multiplyScalar(0.5);

      // Sub-triangle 1: vA, mAB, mCA
      newPositions.push(vA.x, vA.y, vA.z, mAB.x, mAB.y, mAB.z, mCA.x, mCA.y, mCA.z);
      // Sub-triangle 2: vB, mBC, mAB
      newPositions.push(vB.x, vB.y, vB.z, mBC.x, mBC.y, mBC.z, mAB.x, mAB.y, mAB.z);
      // Sub-triangle 3: vC, mCA, mBC
      newPositions.push(vC.x, vC.y, vC.z, mCA.x, mCA.y, mCA.z, mBC.x, mBC.y, mBC.z);
      // Sub-triangle 4: mAB, mBC, mCA (center)
      newPositions.push(mAB.x, mAB.y, mAB.z, mBC.x, mBC.y, mBC.z, mCA.x, mCA.y, mCA.z);
    }

    const subGeom = new THREE.BufferGeometry();
    subGeom.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    subGeom.computeVertexNormals();
    return subGeom;
  }
}
