import * as THREE from 'three';
import { GeometryUtils } from '../utils/GeometryUtils.js';

export class ModifierManager {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    // Map of object.uuid -> Array of modifiers: { id, type, name, enabled, params }
    this.modifiersMap = new Map();
  }

  getModifiers(obj) {
    if (!obj) return [];
    if (!this.modifiersMap.has(obj.uuid)) {
      this.modifiersMap.set(obj.uuid, []);
    }
    return this.modifiersMap.get(obj.uuid);
  }

  addModifier(obj, type) {
    if (!obj || !obj.isMesh) return null;

    if (!obj.userData.baseGeometry) {
      obj.userData.baseGeometry = obj.geometry.clone();
    }

    const mods = this.getModifiers(obj);
    let mod;

    switch (type) {
      case 'subdivision':
        mod = {
          id: 'mod_' + Math.random().toString(36).substr(2, 9),
          type: 'subdivision',
          name: 'Subdivision Surface',
          enabled: true,
          params: { levels: 1 }
        };
        break;
      case 'wireframe':
        mod = {
          id: 'mod_' + Math.random().toString(36).substr(2, 9),
          type: 'wireframe',
          name: 'Wireframe',
          enabled: true,
          params: { thickness: 0.05 }
        };
        break;
      case 'mirror':
        mod = {
          id: 'mod_' + Math.random().toString(36).substr(2, 9),
          type: 'mirror',
          name: 'Mirror',
          enabled: true,
          params: { axis: 'X' }
        };
        break;
      case 'array':
        mod = {
          id: 'mod_' + Math.random().toString(36).substr(2, 9),
          type: 'array',
          name: 'Array',
          enabled: true,
          params: { count: 3, offsetX: 2.2, offsetY: 0, offsetZ: 0 }
        };
        break;
      default:
        return null;
    }

    mods.push(mod);
    this.rebuildObjectGeometry(obj);
    return mod;
  }

  removeModifier(obj, modId) {
    const mods = this.getModifiers(obj);
    const idx = mods.findIndex((m) => m.id === modId);
    if (idx !== -1) {
      mods.splice(idx, 1);
      this.rebuildObjectGeometry(obj);
    }
  }

  applyModifier(obj, modId) {
    const mods = this.getModifiers(obj);
    const idx = mods.findIndex((m) => m.id === modId);
    if (idx !== -1) {
      // Rebuild geometry up to this point and save as new base
      this.rebuildObjectGeometry(obj);
      obj.userData.baseGeometry = obj.geometry.clone();
      mods.splice(idx, 1);
      this.rebuildObjectGeometry(obj);
    }
  }

  updateModifierParam(obj, modId, paramKey, value) {
    const mods = this.getModifiers(obj);
    const mod = mods.find((m) => m.id === modId);
    if (mod) {
      mod.params[paramKey] = value;
      this.rebuildObjectGeometry(obj);
    }
  }

  rebuildObjectGeometry(obj) {
    if (!obj || !obj.isMesh || !obj.userData.baseGeometry) return;

    let currentGeom = obj.userData.baseGeometry.clone();
    const mods = this.getModifiers(obj);

    mods.forEach((mod) => {
      if (!mod.enabled) return;

      if (mod.type === 'subdivision') {
        const levels = Math.min(mod.params.levels, 2);
        for (let l = 0; l < levels; l++) {
          currentGeom = GeometryUtils.subdivideGeometry(currentGeom);
        }
      } else if (mod.type === 'wireframe') {
        currentGeom = new THREE.WireframeGeometry(currentGeom);
      } else if (mod.type === 'mirror') {
        const mirrored = currentGeom.clone();
        const scale = new THREE.Vector3(
          mod.params.axis === 'X' ? -1 : 1,
          mod.params.axis === 'Y' ? -1 : 1,
          mod.params.axis === 'Z' ? -1 : 1
        );
        mirrored.scale(scale.x, scale.y, scale.z);
        // Combine geometries
        const pos1 = currentGeom.toNonIndexed().attributes.position.array;
        const pos2 = mirrored.toNonIndexed().attributes.position.array;
        const merged = new Float32Array(pos1.length + pos2.length);
        merged.set(pos1, 0);
        merged.set(pos2, pos1.length);

        const newGeom = new THREE.BufferGeometry();
        newGeom.setAttribute('position', new THREE.BufferAttribute(merged, 3));
        newGeom.computeVertexNormals();
        currentGeom = newGeom;
      } else if (mod.type === 'array') {
        const count = Math.max(1, Math.min(mod.params.count || 2, 8));
        const originalArray = currentGeom.toNonIndexed().attributes.position.array;
        const totalVerts = originalArray.length * count;
        const merged = new Float32Array(totalVerts);

        for (let c = 0; c < count; c++) {
          const shiftX = (mod.params.offsetX || 2) * c;
          const shiftY = (mod.params.offsetY || 0) * c;
          const shiftZ = (mod.params.offsetZ || 0) * c;

          for (let i = 0; i < originalArray.length; i += 3) {
            const destIdx = c * originalArray.length + i;
            merged[destIdx] = originalArray[i] + shiftX;
            merged[destIdx + 1] = originalArray[i + 1] + shiftY;
            merged[destIdx + 2] = originalArray[i + 2] + shiftZ;
          }
        }

        const newGeom = new THREE.BufferGeometry();
        newGeom.setAttribute('position', new THREE.BufferAttribute(merged, 3));
        newGeom.computeVertexNormals();
        currentGeom = newGeom;
      }
    });

    obj.geometry.dispose();
    obj.geometry = currentGeom;
  }
}
