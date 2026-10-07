import * as THREE from 'three';
import { GeometryUtils } from '../utils/GeometryUtils.js';

const ORBITAL_FILL_ORDER = [
  [1, 's', 2], [2, 's', 2], [2, 'p', 6], [3, 's', 2], [3, 'p', 6],
  [4, 's', 2], [3, 'd', 10], [4, 'p', 6], [5, 's', 2], [4, 'd', 10],
  [5, 'p', 6], [6, 's', 2], [4, 'f', 14], [5, 'd', 10]
];
const ELECTROSTATIC_K = 0.65;
const ELECTROSTATIC_SOFTENING_SQ = 0.0025;
const NUCLEAR_SPRING_K = 2.0;
const NUCLEON_REST_DISTANCE = 0.28;
const NUCLEON_DAMPING = 1.2;
const COMPOUND_BOND_SCALE = 0.25;

const MOLECULE_MODELS = {
  water: {
    name: 'Water', formula: 'H2O', atoms: [['O', 0, 0, 0]], bonds: []
  },
  oxygen: {
    name: 'Oxygen', formula: 'O2', atoms: [['O', -0.6, 0, 0], ['O', 0.6, 0, 0]], bonds: [[0, 1, 2]]
  },
  carbonDioxide: {
    name: 'Carbon Dioxide', formula: 'CO2',
    atoms: [['O', -1.2, 0, 0], ['C', 0, 0, 0], ['O', 1.2, 0, 0]], bonds: [[0, 1, 2], [1, 2, 2]]
  },
  methane: {
    name: 'Methane', formula: 'CH4', atoms: [['C', 0, 0, 0]], bonds: []
  },
  ethanol: {
    name: 'Ethanol', formula: 'C2H6O',
    atoms: [['C', -0.65, 0, 0], ['C', 0.65, 0, 0], ['O', 1.55, 0.55, 0]], bonds: [[0, 1, 1], [1, 2, 1]]
  },
  glycine: {
    name: 'Glycine', formula: 'C2H5NO2',
    atoms: [['N', -1.25, 0.15, 0], ['C', -0.15, -0.35, 0], ['C', 1.05, 0.2, 0], ['O', 2.0, 0.9, 0], ['O', 1.15, 1.35, 0]],
    bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 2], [2, 4, 1]]
  },
  alanine: {
    name: 'Alanine', formula: 'C3H7NO2',
    atoms: [['N', -1.3, 0.2, 0], ['C', -0.15, -0.35, 0], ['C', 1.05, 0.2, 0], ['O', 2.0, 0.9, 0], ['O', 1.15, 1.35, 0], ['C', -0.2, -1.65, 0.25]],
    bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 2], [2, 4, 1], [1, 5, 1]]
  },
  glucose: {
    name: 'Glucose', formula: 'C6H12O6',
    atoms: [
      ['C', 0, 1.1, 0], ['C', 1.05, 0.45, 0], ['C', 0.75, -0.75, 0],
      ['C', -0.55, -0.9, 0], ['C', -1.15, 0.2, 0], ['O', -0.8, 1.25, 0],
      ['C', 0.3, 2.35, 0.2], ['O', 1.75, 0.85, 0.15], ['O', 1.25, -1.55, 0],
      ['O', -0.95, -1.95, 0], ['O', -2.35, 0.25, 0], ['O', 0.1, 3.45, 0.2]
    ],
    bonds: [[0,1,1],[1,2,1],[2,3,1],[3,4,1],[4,5,1],[5,0,1],[0,6,1],[1,7,1],[2,8,1],[3,9,1],[4,10,1],[6,11,1]]
  }
};

function createGrapheneModel(columns = 5, rows = 4) {
  const atomPositions = [];
  const atomIndices = new Map();
  const cellLength = Math.sqrt(3);

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = cellLength * column + (cellLength / 2) * row;
      const y = 1.5 * row;
      atomIndices.set(`A:${column}:${row}`, atomPositions.length);
      atomPositions.push([x, y, 0]);
      atomIndices.set(`B:${column}:${row}`, atomPositions.length);
      atomPositions.push([x, y + 1, 0]);
    }
  }

  const bonds = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const atom = atomIndices.get(`A:${column}:${row}`);
      bonds.push([atom, atomIndices.get(`B:${column}:${row}`), 1]);
      if (row > 0) {
        bonds.push([atom, atomIndices.get(`B:${column}:${row - 1}`), 1]);
        if (column + 1 < columns) {
          bonds.push([atom, atomIndices.get(`B:${column + 1}:${row - 1}`), 1]);
        }
      }
    }
  }

  const xValues = atomPositions.map(([x]) => x);
  const yValues = atomPositions.map(([, y]) => y);
  const centerX = (Math.min(...xValues) + Math.max(...xValues)) / 2;
  const centerY = (Math.min(...yValues) + Math.max(...yValues)) / 2;
  const atoms = atomPositions.map(([x, y, z]) => ['C', x - centerX, y - centerY, z]);
  const count = atoms.length;
  return {
    name: `Graphene Sheet (${count} Carbon Atoms)`,
    formula: `C${count}`,
    atoms,
    bonds
  };
}

function getElectronOrbitalSlots(electronCount, atomicNumber, nucleusOuterRadius) {
  let remaining = electronCount;
  const configuration = new Map();

  for (const [shell, type, capacity] of ORBITAL_FILL_ORDER) {
    if (remaining <= 0) break;
    const occupancy = Math.min(remaining, capacity);
    configuration.set(`${shell}${type}`, occupancy);
    remaining -= occupancy;
  }

  // Observed neutral ground-state exceptions in the first 60 elements (NIST).
  const groundStateOverrides = {
    24: { '3d': 5, '4s': 1 },
    29: { '3d': 10, '4s': 1 },
    41: { '4d': 4, '5s': 1 },
    42: { '4d': 5, '5s': 1 },
    44: { '4d': 7, '5s': 1 },
    45: { '4d': 8, '5s': 1 },
    46: { '4d': 10, '5s': 0 },
    47: { '4d': 10, '5s': 1 },
    79: { '5d': 10, '6s': 1 },
    57: { '4f': 0, '5d': 1, '6s': 2 },
    58: { '4f': 1, '5d': 1, '6s': 2 }
  };
  for (const [subshell, occupancy] of Object.entries(groundStateOverrides[atomicNumber] || {})) {
    configuration.set(subshell, occupancy);
  }
  const configuredElectronCount = [...configuration.values()].reduce((sum, occupancy) => sum + occupancy, 0);
  if (configuredElectronCount !== electronCount) {
    throw new Error(`Electron configuration for ${atomicNumber} does not contain ${electronCount} electrons.`);
  }

  const slots = [];
  for (const [subshell, occupancy] of configuration) {
    const shell = Number.parseInt(subshell, 10);
    const type = subshell.slice(-1);
    const orbitalCount = type === 's' ? 1 : type === 'p' ? 3 : type === 'd' ? 5 : 7;
    const orientationVectors = {
      s: [new THREE.Vector3(1, 2, 3).normalize()],
      p: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
      d: [
        new THREE.Vector3(1, 1, 0).normalize(), new THREE.Vector3(1, -1, 0).normalize(),
        new THREE.Vector3(1, 0, 1).normalize(), new THREE.Vector3(1, 0, -1).normalize(),
        new THREE.Vector3(0, 1, 1).normalize()
      ],
      f: Array.from({ length: 7 }, (_, index) => {
        const angle = (index / 7) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle), Math.sin(angle), index % 2 ? 0.65 : -0.65).normalize();
      })
    }[type];

    const pairedOrbitalCount = Math.max(0, occupancy - orbitalCount);
    for (let orbital = 0; orbital < orbitalCount && orbital < occupancy; orbital++) {
      const direction = orientationVectors[orbital];
      const radius = nucleusOuterRadius + 0.5 + (shell - 1) * 0.45;
      const electronPairCount = orbital < pairedOrbitalCount ? 2 : 1;
      for (let pairIndex = 0; pairIndex < electronPairCount; pairIndex++) {
        // Paired display dots sit on opposite lobes of the same orbital.
        const firstElectronSign = orbital % 2 === 0 ? 1 : -1;
        const sign = pairIndex === 1 ? -firstElectronSign : firstElectronSign;
        slots.push(direction.clone().multiplyScalar(radius * sign));
      }
    }
  }

  for (let first = 0; first < slots.length; first++) {
    for (let second = first + 1; second < slots.length; second++) {
      if (slots[first].distanceToSquared(slots[second]) < 1e-10) {
        throw new Error(`Electron positions overlap for element ${atomicNumber}.`);
      }
    }
  }

  return slots;
}

export const ShadingMode = {
  WIREFRAME: 'WIREFRAME',
  SOLID: 'SOLID',
  MATERIAL: 'MATERIAL',
  RENDERED: 'RENDERED'
};

export class SceneManager {
  constructor(container, editor = null) {
    this.container = container;
    this.editor = editor;
    this.width = container.clientWidth || window.innerWidth;
    this.height = container.clientHeight || window.innerHeight;

    this.shadingMode = ShadingMode.SOLID;
    this.isOrtho = false;
    this.selectedObject = null;
    this.objectsList = [];
    this.animatedAtoms = [];
    this.electrolysisAnimations = [];

    this.initScene();
    this.initCameras();
    this.initRenderer();
    this.initLights();
    this.initGridAndAxes();
    this.init3DCursor();
    this.initDefaultObjects();

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x282828); // Electro Designer dark charcoal viewport
  }

  updateWorkspaceBackground() {
    const circuitMode = this.editor?.workspaceMode === 'circuits';
    const backgrounds = circuitMode
      ? { wireframe: 0x282828, solid: 0x1c1d20, material: 0x151619 }
      : { wireframe: 0x353535, solid: 0x282828, material: 0x202020 };
    const key = this.shadingMode === ShadingMode.WIREFRAME
      ? 'wireframe'
      : this.shadingMode === ShadingMode.SOLID ? 'solid' : 'material';
    this.scene.background.set(backgrounds[key]);
  }

  initCameras() {
    const aspect = this.width / this.height;

    // Perspective Camera
    this.perspCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.perspCamera.position.set(6.5, 5.0, 6.5);
    this.perspCamera.lookAt(0, 0, 0);

    // Orthographic Camera
    const frustumSize = 10;
    this.orthoCamera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      1000
    );
    this.orthoCamera.position.copy(this.perspCamera.position);
    this.orthoCamera.lookAt(0, 0, 0);

    this.activeCamera = this.perspCamera;
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.container.appendChild(this.renderer.domElement);
  }

  initLights() {
    // Ambient / Fill light (Studio feel)
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(this.ambientLight);

    // Key Directional / Sun Light
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sunLight.position.set(5, 10, 7);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 50;
    const d = 10;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Secondary Rim / Fill Light
    this.rimLight = new THREE.DirectionalLight(0x7090b0, 0.4);
    this.rimLight.position.set(-5, 4, -5);
    this.scene.add(this.rimLight);
  }

  initGridAndAxes() {
    // Electro Designer Floor Grid
    this.gridHelper = new THREE.GridHelper(30, 30, 0x474747, 0x333333);
    this.gridHelper.position.y = -0.001; // Avoid z-fighting
    this.gridHelper.name = '__grid';
    this.scene.add(this.gridHelper);

    // Distinct Electro Designer Red (X) and Green (Z/Y) center axis lines
    const lineMatX = new THREE.LineBasicMaterial({ color: 0xcc2229, linewidth: 2 });
    const lineGeomX = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-15, 0, 0),
      new THREE.Vector3(15, 0, 0)
    ]);
    this.axisLineX = new THREE.Line(lineGeomX, lineMatX);
    this.axisLineX.name = '__axisX';
    this.scene.add(this.axisLineX);

    const lineMatY = new THREE.LineBasicMaterial({ color: 0x228b22, linewidth: 2 });
    const lineGeomY = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -15),
      new THREE.Vector3(0, 0, 15)
    ]);
    this.axisLineY = new THREE.Line(lineGeomY, lineMatY);
    this.axisLineY.name = '__axisY';
    this.scene.add(this.axisLineY);
  }

  init3DCursor() {
    this.cursorGroup = new THREE.Group();
    this.cursorGroup.name = '__3dCursor';

    // Dashed red-and-white circle
    const circlePoints = [];
    const segments = 32;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      circlePoints.push(new THREE.Vector3(Math.cos(theta) * 0.4, 0, Math.sin(theta) * 0.4));
    }

    const circleGeom = new THREE.BufferGeometry().setFromPoints(circlePoints);
    const circleMat = new THREE.LineDashedMaterial({
      color: 0xee3322,
      dashSize: 0.08,
      gapSize: 0.08
    });
    const circle = new THREE.Line(circleGeom, circleMat);
    circle.computeLineDistances();
    this.cursorGroup.add(circle);

    // Crosshairs
    const crossPoints = [
      new THREE.Vector3(-0.6, 0, 0), new THREE.Vector3(0.6, 0, 0),
      new THREE.Vector3(0, -0.6, 0), new THREE.Vector3(0, 0.6, 0),
      new THREE.Vector3(0, 0, -0.6), new THREE.Vector3(0, 0, 0.6)
    ];
    const crossGeom = new THREE.BufferGeometry().setFromPoints(crossPoints);
    const crossMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const cross = new THREE.LineSegments(crossGeom, crossMat);
    this.cursorGroup.add(cross);

    this.scene.add(this.cursorGroup);
    this.cursorPosition = new THREE.Vector3(0, 0, 0);
  }

  set3DCursorPosition(x, y, z) {
    this.cursorPosition.set(x, y, z);
    this.cursorGroup.position.copy(this.cursorPosition);
  }

  get3DCursorPosition() {
    return this.cursorPosition.clone();
  }

  initDefaultObjects() {
    // The classic Electro Designer default scene: Cube, Light, Camera
    const cubeGeom = new THREE.BoxGeometry(2, 2, 2);
    const cubeMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d4,
      roughness: 0.5,
      metalness: 0.1
    });

    const defaultCube = new THREE.Mesh(cubeGeom, cubeMat);
    defaultCube.name = 'Cube';
    defaultCube.position.set(0, 1, 0);
    defaultCube.castShadow = true;
    defaultCube.receiveShadow = true;
    this.addObject(defaultCube);

    // Default Point Light
    const pointLight = new THREE.PointLight(0xfff3e0, 25, 20);
    pointLight.position.set(4, 5, 4);
    pointLight.castShadow = true;
    pointLight.name = 'Point Light';
    const lightHelper = new THREE.PointLightHelper(pointLight, 0.4, 0xffcc00);
    lightHelper.name = '__helper_' + pointLight.id;
    this.scene.add(lightHelper);
    pointLight.userData.helper = lightHelper;
    this.addObject(pointLight);

    // Default Camera dummy representation
    const camHelperGeom = new THREE.ConeGeometry(0.3, 0.6, 4);
    camHelperGeom.rotateX(Math.PI / 2);
    const camHelperMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, wireframe: true });
    const cameraRep = new THREE.Mesh(camHelperGeom, camHelperMat);
    cameraRep.name = 'Camera';
    cameraRep.position.set(6, 4, 6);
    cameraRep.lookAt(0, 1, 0);
    this.addObject(cameraRep);

    this.setSelectedObject(defaultCube);
  }

  addObject(obj) {
    this.scene.add(obj);
    this.objectsList.push(obj);

    if (this.onSceneChanged) {
      this.onSceneChanged();
    }
    return obj;
  }

  removeObject(obj) {
    if (!obj || obj.name.startsWith('__')) return;

    const removedNodeId = obj.userData?.circuitNodeId;
    const removedTerminalOwnerId = obj.userData?.circuitComponent && !removedNodeId ? obj.uuid : null;
    if (removedTerminalOwnerId) {
      const attachedTerminals = this.objectsList.filter((candidate) => candidate.userData?.terminalOwnerId === removedTerminalOwnerId);
      attachedTerminals.forEach((terminal) => this.removeObject(terminal));
    }
    if (removedNodeId) {
      const attachedConnections = this.objectsList.filter((candidate) =>
        candidate.userData?.circuitConnection &&
        (candidate.userData.startNodeId === removedNodeId || candidate.userData.endNodeId === removedNodeId)
      );
      attachedConnections.forEach((connection) => this.removeObject(connection));
    }

    if (obj.userData?.helper) {
      this.scene.remove(obj.userData.helper);
      obj.userData.helper.dispose?.();
    }

    this.scene.remove(obj);
    this.animatedAtoms = this.animatedAtoms.filter((animated) => animated !== obj);
    this.electrolysisAnimations = this.electrolysisAnimations.filter((animated) => animated !== obj);
    const index = this.objectsList.indexOf(obj);
    if (index !== -1) {
      this.objectsList.splice(index, 1);
    }

    if (this.selectedObject === obj) {
      this.setSelectedObject(null);
    }

    if (this.onSceneChanged) {
      this.onSceneChanged();
    }
  }

  duplicateSelectedObject() {
    if (!this.selectedObject || this.selectedObject.name.startsWith('__')) return null;

    let clone;
    if (this.selectedObject.isMesh) {
      clone = new THREE.Mesh(
        this.selectedObject.geometry.clone(),
        this.selectedObject.material.clone()
      );
    } else {
      clone = this.selectedObject.clone();
    }

    // Offset slightly in X
    clone.position.copy(this.selectedObject.position).add(new THREE.Vector3(1, 0, 0));
    clone.rotation.copy(this.selectedObject.rotation);
    clone.scale.copy(this.selectedObject.scale);
    clone.name = `${this.selectedObject.name}.001`;
    clone.castShadow = true;
    clone.receiveShadow = true;

    this.addObject(clone);
    if (clone.userData.electronOrbitModel) this.animatedAtoms.push(clone);
    this.setSelectedObject(clone);
    return clone;
  }

  createMeshPrimitive(type) {
    let geom;
    let name = 'Object';
    const cursor = this.get3DCursorPosition();

    switch (type.toLowerCase()) {
      case 'cube':
        geom = new THREE.BoxGeometry(2, 2, 2);
        name = 'Cube';
        break;
      case 'sphere':
        geom = new THREE.SphereGeometry(1, 32, 24);
        name = 'Sphere';
        break;
      case 'cylinder':
        geom = new THREE.CylinderGeometry(1, 1, 2, 32);
        name = 'Cylinder';
        break;
      case 'cone':
        geom = new THREE.ConeGeometry(1, 2, 32);
        name = 'Cone';
        break;
      case 'torus':
        geom = new THREE.TorusGeometry(1, 0.4, 16, 48);
        name = 'Torus';
        break;
      case 'plane':
        geom = new THREE.PlaneGeometry(3, 3);
        geom.rotateX(-Math.PI / 2);
        name = 'Plane';
        break;
      case 'monkey':
      case 'suzanne':
        geom = GeometryUtils.createMonkeyGeometry();
        name = 'Suzanne';
        break;
      default:
        geom = new THREE.BoxGeometry(1, 1, 1);
        name = 'Mesh';
    }

    const mat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d4,
      roughness: 0.5,
      metalness: 0.1
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = name;
    mesh.position.copy(cursor);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.addObject(mesh);
    this.setSelectedObject(mesh);
    return mesh;
  }

  createCircuitComponent(type) {
    if ([
      'cmosInverter', 'cmosNand', 'cmosNor', 'cmosAnd', 'cmosOr', 'cmosXor', 'cmosXnor',
      'cmosBuffer', 'cmosNand3', 'cmosNor3', 'cmosAnd3', 'cmosOr3'
    ].includes(type)) return null;

    const group = new THREE.Group();
    const cursor = this.get3DCursorPosition();
    const materials = {
      body: new THREE.MeshStandardMaterial({ color: 0x273449, roughness: 0.42, metalness: 0.25 }),
      resistor: new THREE.MeshStandardMaterial({ color: 0xd5a653, roughness: 0.62 }),
      metal: new THREE.MeshStandardMaterial({ color: 0xb8c3d1, metalness: 0.8, roughness: 0.25 }),
      red: new THREE.MeshStandardMaterial({ color: 0xf04452, emissive: 0x4a080d }),
      green: new THREE.MeshStandardMaterial({ color: 0x24c78e, emissive: 0x073b29 }),
      pmos: new THREE.MeshStandardMaterial({ color: 0xa78bfa, emissive: 0x211247, roughness: 0.38 }),
      gate: new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.55, roughness: 0.3 }),
      drain: new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.55, roughness: 0.3 }),
      board: new THREE.MeshStandardMaterial({ color: 0x135a42, roughness: 0.72 })
    };
    const mesh = (geometry, material, x = 0, y = 0, z = 0) => {
      const part = new THREE.Mesh(geometry, material);
      part.position.set(x, y, z);
      part.castShadow = true;
      part.receiveShadow = true;
      group.add(part);
      return part;
    };
    const rod = (x1, x2, y = 0, radius = 0.035) => {
      const part = mesh(new THREE.CylinderGeometry(radius, radius, Math.abs(x2 - x1), 10), materials.metal, (x1 + x2) / 2, y);
      part.rotation.z = Math.PI / 2;
    };
    const pinBetween = (x1, y1, x2, y2, material, radius = 0.045, z = 0) => {
      const start = new THREE.Vector3(x1, y1, z);
      const end = new THREE.Vector3(x2, y2, z);
      const direction = end.clone().sub(start);
      const pin = mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 10), material,
        (x1 + x2) / 2, (y1 + y2) / 2);
      pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    };

    if (type === 'voltageSource') {
      group.name = 'Voltage Source (5 V)';
      group.userData.voltageSource = true;
      group.userData.voltage = 5;
      this._voltageSourceSequence = (this._voltageSourceSequence || 0) + 1;
      group.userData.circuitSourceId = `source-${Date.now()}-${this._voltageSourceSequence}`;
      const symbol = mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.14, 32), materials.body);
      symbol.rotation.x = Math.PI / 2;
      rod(-1.12, -0.52, 0, 0.045);
      rod(0.52, 1.12, 0, 0.045);
      mesh(new THREE.BoxGeometry(0.42, 0.07, 0.1), materials.red, -0.14, 0, 0.1);
      mesh(new THREE.BoxGeometry(0.07, 0.42, 0.1), materials.red, -0.14, 0, 0.1);
      mesh(new THREE.BoxGeometry(0.42, 0.07, 0.1), materials.metal, 0.16, 0, 0.1);
    } else if (type === 'battery') {
      group.name = 'Battery';
      const body = mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.25, 24), materials.body);
      body.rotation.z = Math.PI / 2;
      rod(-0.85, -0.55); rod(0.55, 0.85);
      mesh(new THREE.BoxGeometry(0.08, 0.24, 0.12), materials.red, 0.85);
      mesh(new THREE.BoxGeometry(0.08, 0.12, 0.12), materials.metal, -0.85);
    } else if (type === 'resistor') {
      group.name = 'Resistor';
      group.userData.resistanceOhms = 220;
      group.userData.circuitPortLayout = [
        { label: 'A', position: [-1.45, 0, 0.13] },
        { label: 'B', position: [1.45, 0, 0.13] }
      ];
      rod(-1.45, -0.55); rod(0.55, 1.45);
      const body = mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.1, 18), materials.resistor);
      body.rotation.z = Math.PI / 2;
      [-0.28, 0, 0.28].forEach((x, i) => {
        const band = mesh(new THREE.CylinderGeometry(0.258, 0.258, 0.08, 18), i === 1 ? materials.body : materials.red, x);
        band.rotation.z = Math.PI / 2;
      });
    } else if (type === 'led') {
      group.name = 'LED';
      rod(-0.12, -0.75, -0.16, 0.025); rod(0.12, 0.75, -0.16, 0.025);
      const bulb = mesh(new THREE.SphereGeometry(0.34, 20, 16), materials.green, 0, 0.17);
      bulb.scale.set(0.82, 1, 0.82);
      bulb.userData.ledEmitter = true;
      mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.16, 18), materials.body, 0, -0.12);
    } else if (type === 'switch') {
      group.name = 'Switch';
      mesh(new THREE.BoxGeometry(1.25, 0.22, 0.65), materials.body);
      rod(-1.45, -0.62); rod(0.62, 1.45);
      const lever = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.92, 12), materials.metal, 0, 0.42);
      lever.rotation.z = -0.55;
    } else if (type === 'wire') {
      group.name = 'Wire';
      const wire = mesh(new THREE.CylinderGeometry(0.045, 0.045, 2, 12), materials.red);
      wire.rotation.z = Math.PI / 2;
      mesh(new THREE.SphereGeometry(0.07, 12, 8), materials.metal, -1);
      mesh(new THREE.SphereGeometry(0.07, 12, 8), materials.metal, 1);
    } else if (type === 'capacitor') {
      group.name = 'Capacitor';
      rod(-1.35, -0.12); rod(0.12, 1.35);
      mesh(new THREE.BoxGeometry(0.08, 0.82, 0.12), materials.metal, -0.06);
      mesh(new THREE.BoxGeometry(0.08, 0.82, 0.12), materials.red, 0.06);
    } else if (type === 'diode') {
      group.name = 'Diode';
      rod(-1.35, -0.38); rod(0.38, 1.35);
      const diodeBody = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.82, 18), materials.body);
      diodeBody.rotation.z = Math.PI / 2;
      const cathodeBand = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.09, 18), materials.red, 0.23);
      cathodeBand.rotation.z = Math.PI / 2;
    } else if (type === 'inductor') {
      group.name = 'Inductor';
      rod(-1.45, -0.52); rod(0.52, 1.45);
      for (let index = 0; index < 5; index++) {
        const coil = mesh(new THREE.TorusGeometry(0.2, 0.055, 10, 20), materials.drain, -0.4 + index * 0.2);
        coil.rotation.y = Math.PI / 2;
      }
    } else if (type === 'ground') {
      group.name = 'Ground';
      pinBetween(0, 0.65, 0, 0.08, materials.metal);
      pinBetween(-0.55, 0.05, 0.55, 0.05, materials.metal);
      pinBetween(-0.36, -0.14, 0.36, -0.14, materials.metal);
      pinBetween(-0.17, -0.33, 0.17, -0.33, materials.metal);
      mesh(new THREE.SphereGeometry(0.075, 12, 8), materials.green, 0, 0.65);
      group.userData.circuitPortLayout = [
        { label: '−', role: 'ground', polarity: 'negative', position: [0, 0.65, 0.16] }
      ];
    } else if (type === 'npnTransistor') {
      group.name = 'NPN Transistor';
      mesh(new THREE.SphereGeometry(0.34, 18, 14), materials.body);
      pinBetween(-1.35, 0, -0.3, 0, materials.gate);
      pinBetween(0.1, 0.25, 0.72, 1.15, materials.drain);
      pinBetween(0.1, -0.25, 0.72, -1.15, materials.red);
      mesh(new THREE.SphereGeometry(0.085, 12, 8), materials.gate, -1.35);
      mesh(new THREE.SphereGeometry(0.085, 12, 8), materials.drain, 0.72, 1.15);
      mesh(new THREE.SphereGeometry(0.085, 12, 8), materials.red, 0.72, -1.15);
    } else if (type === 'pmosMosfet' || type === 'nmosMosfet') {
      const isPChannel = type === 'pmosMosfet';
      group.name = isPChannel ? 'P-Channel MOSFET (PMOS)' : 'N-Channel MOSFET (NMOS)';
      // Compact three-terminal FET: gate on the left, drain above, source below.
      const channelMaterial = isPChannel ? materials.pmos : materials.body;
      pinBetween(-0.88, 0, -0.25, 0, materials.gate);
      pinBetween(0.25, 0.38, 0.25, 0.78, materials.drain);
      pinBetween(0.25, -0.38, 0.25, -0.78, materials.green);
      pinBetween(0.25, 0.38, 0.25, -0.38, channelMaterial);
      pinBetween(-0.25, 0, -0.25, 0.38, channelMaterial);
      pinBetween(-0.25, 0, -0.25, -0.38, channelMaterial);
      mesh(new THREE.SphereGeometry(0.06, 12, 8), materials.gate, -0.88, 0, 0.04);
      mesh(new THREE.SphereGeometry(0.06, 12, 8), materials.drain, 0.25, 0.78, 0.04);
      mesh(new THREE.SphereGeometry(0.06, 12, 8), materials.green, 0.25, -0.78, 0.04);
      group.userData.circuitPortLayout = [
        { label: 'Gate', role: 'gate', position: [-0.88, 0, 0.16] },
        { label: 'Drain', role: 'drain', position: [0.25, 0.78, 0.16] },
        { label: 'Source', role: 'source', position: [0.25, -0.78, 0.16] }
      ];
    } else if (type === 'cmosInverter') {
      group.name = 'CMOS Inverter (PMOS + NMOS)';
      group.userData.logicCircuit = 'NOT';
      group.userData.transistorCount = 2;
      mesh(new THREE.BoxGeometry(4.7, 4.8, 0.12), materials.board, 0, 0, -0.12);

      // A PMOS above an NMOS; both gates share IN and both drains meet at OUT.
      mesh(new THREE.BoxGeometry(0.78, 0.62, 0.2), materials.pmos, 0, 1.2, 0.08);
      mesh(new THREE.BoxGeometry(0.78, 0.62, 0.2), materials.body, 0, -1.2, 0.08);
      pinBetween(-1.2, -1.2, -1.2, 1.2, materials.gate);
      pinBetween(-2.1, 0, -1.2, 0, materials.gate);
      pinBetween(-1.2, 1.2, -0.4, 1.2, materials.gate);
      pinBetween(-1.2, -1.2, -0.4, -1.2, materials.gate);

      pinBetween(0.4, 1.2, 1.12, 0.48, materials.drain);
      pinBetween(0.4, -1.2, 1.12, -0.48, materials.drain);
      pinBetween(1.12, -0.48, 1.12, 0.48, materials.drain);
      pinBetween(1.12, 0, 2.05, 0, materials.drain);

      pinBetween(0, 1.51, 0, 2.05, materials.red);
      pinBetween(0, -1.51, 0, -2.05, materials.green);
      pinBetween(-0.42, 2.05, 0.42, 2.05, materials.red);
      pinBetween(-0.42, -2.12, 0.42, -2.12, materials.green);
      pinBetween(-0.29, -2.29, 0.29, -2.29, materials.green);
      pinBetween(-0.15, -2.46, 0.15, -2.46, materials.green);

      pinBetween(-2.1, 0, -2.58, 0, materials.gate, 0.055, 0.18);
      pinBetween(2.05, 0, 2.58, 0, materials.drain, 0.055, 0.18);
      pinBetween(0, 2.05, 0, 2.55, materials.red, 0.055, 0.18);
      pinBetween(0, -2.46, 0, -2.95, materials.green, 0.055, 0.18);
      group.userData.circuitPortLayout = [
        { label: 'IN', role: 'input', position: [-2.58, 0, 0.2] },
        { label: 'OUT', role: 'output', position: [2.58, 0, 0.2] },
        { label: 'VDD', role: 'power', position: [0, 2.55, 0.2] },
        { label: 'GND', role: 'ground', position: [0, -2.95, 0.2] }
      ];

      const addLabel = (text, x, y, color) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 48;
        const context = canvas.getContext('2d');
        context.fillStyle = '#101722';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = color;
        context.font = 'bold 26px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
        sprite.position.set(x, y, 0.2);
        sprite.scale.set(0.62, 0.24, 1);
        group.add(sprite);
      };
      addLabel('PMOS', 0, 1.2, '#d6c8ff');
      addLabel('NMOS', 0, -1.2, '#c7d6e5');
      addLabel('IN', -2.05, -0.25, '#38bdf8');
      addLabel('OUT', 1.72, 0.25, '#fbbf24');
      addLabel('VDD', 0.66, 2.04, '#fca5a5');
      addLabel('GND', 0.65, -2.25, '#86efac');
    } else if (['cmosBuffer', 'cmosNand3', 'cmosNor3', 'cmosAnd3', 'cmosOr3'].includes(type)) {
      const gateInfo = {
        cmosBuffer: { name: 'Buffer', inputs: 1, count: 4, topology: 'Two cascaded CMOS inverters' },
        cmosNand3: { name: '3-Input NAND', inputs: 3, count: 6, topology: 'PMOS parallel · NMOS series' },
        cmosNor3: { name: '3-Input NOR', inputs: 3, count: 6, topology: 'PMOS series · NMOS parallel' },
        cmosAnd3: { name: '3-Input AND', inputs: 3, count: 8, topology: '3-input NAND + inverter' },
        cmosOr3: { name: '3-Input OR', inputs: 3, count: 8, topology: '3-input NOR + inverter' }
      }[type];
      group.name = `CMOS ${gateInfo.name} Gate`;
      group.userData.logicCircuit = gateInfo.name;
      group.userData.transistorCount = gateInfo.count;
      const boardWidth = 8.6;
      const boardHeight = 6;
      mesh(new THREE.BoxGeometry(boardWidth, boardHeight, 0.12), materials.board, 0, 0, -0.12);
      const label = (text, x, y, color, width = 1) => {
        const canvas = document.createElement('canvas');
        canvas.width = 180;
        canvas.height = 48;
        const context = canvas.getContext('2d');
        context.fillStyle = '#101722';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = color;
        context.font = 'bold 24px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
        sprite.position.set(x, y, 0.24);
        sprite.scale.set(width, 0.24, 1);
        group.add(sprite);
      };
      label(`CMOS ${gateInfo.name}`, 0, 2.45, '#f8fafc', 1.8);
      label(`${gateInfo.count} MOSFETs · ${gateInfo.topology}`, 0, -2.48, '#a7f3d0', 4.2);

      const columns = 4;
      for (let index = 0; index < gateInfo.count; index++) {
        const isPmos = index < gateInfo.count / 2;
        const stageIndex = index % (gateInfo.count / 2);
        const col = stageIndex % columns;
        const row = Math.floor(stageIndex / columns);
        const x = (col - (Math.min(columns, gateInfo.count / 2) - 1) / 2) * 1.4;
        const y = isPmos ? 1.15 - row * 0.65 : -0.55 - row * 0.65;
        mesh(new THREE.BoxGeometry(0.62, 0.42, 0.2), isPmos ? materials.pmos : materials.body, x, y, 0.08);
        pinBetween(x - 0.42, y, x - 0.31, y, materials.gate, 0.035, 0.18);
        pinBetween(x + 0.31, y, x + 0.42, y, materials.drain, 0.035, 0.18);
        label(`${isPmos ? 'P' : 'N'}${String.fromCharCode(65 + stageIndex % gateInfo.inputs)}`, x, y, isPmos ? '#e9ddff' : '#dbeafe', 0.38);
      }

      const inputX = -boardWidth / 2 - 0.55;
      const outputX = boardWidth / 2 + 0.55;
      const inputYs = gateInfo.inputs === 1 ? [0] : [1, 0, -1];
      const vddY = boardHeight / 2 + 0.55;
      const gndY = -boardHeight / 2 - 0.55;
      inputYs.forEach((y) => pinBetween(inputX, y, -boardWidth / 2, y, materials.gate, 0.055, 0.18));
      pinBetween(boardWidth / 2, 0, outputX, 0, materials.drain, 0.055, 0.18);
      pinBetween(0, boardHeight / 2, 0, vddY, materials.red, 0.055, 0.18);
      pinBetween(0, -boardHeight / 2, 0, gndY, materials.green, 0.055, 0.18);
      group.userData.circuitPortLayout = [
        ...inputYs.map((y, index) => ({ label: gateInfo.inputs === 1 ? 'IN' : String.fromCharCode(65 + index), role: 'input', position: [inputX, y, 0.2] })),
        { label: 'OUT', role: 'output', position: [outputX, 0, 0.2] },
        { label: 'VDD', role: 'power', position: [0, vddY, 0.2] },
        { label: 'GND', role: 'ground', position: [0, gndY, 0.2] }
      ];
    } else if (['cmosNand', 'cmosNor', 'cmosAnd', 'cmosOr', 'cmosXor', 'cmosXnor'].includes(type)) {
      const name = ({ cmosNand: 'NAND', cmosNor: 'NOR', cmosAnd: 'AND', cmosOr: 'OR', cmosXor: 'XOR', cmosXnor: 'XNOR' })[type];
      const inverted = type === 'cmosAnd' || type === 'cmosOr';
      const xorFamily = type === 'cmosXor' || type === 'cmosXnor';
      group.name = `CMOS ${name} Gate`;
      group.userData.logicCircuit = name;

      const label = (text, x, y, color = '#f8fafc', width = 0.56) => {
        const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 48;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#101722'; ctx.fillRect(0, 0, 160, 48);
        ctx.fillStyle = color; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 80, 24);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
        sprite.position.set(x, y, 0.24); sprite.scale.set(width, 0.22, 1); group.add(sprite);
      };
      const wire = (x1, y1, x2, y2, mat = materials.metal, radius = 0.035) => pinBetween(x1, y1, x2, y2, mat, radius);
      const mos = (x, y, isP, input, scale = 1) => {
        mesh(new THREE.BoxGeometry(0.52 * scale, 0.34 * scale, 0.18), isP ? materials.pmos : materials.body, x, y, 0.08);
        wire(x, y + 0.17 * scale, x, y + 0.35 * scale, materials.metal, 0.03 * scale);
        wire(x, y - 0.17 * scale, x, y - 0.35 * scale, materials.metal, 0.03 * scale);
        wire(x - 0.26 * scale, y, x - 0.42 * scale, y, materials.gate, 0.03 * scale);
        label(`${isP ? 'P' : 'N'}${input}`, x - 0.59 * scale, y, isP ? '#e9ddff' : '#dbeafe', 0.38 * scale);
        return { top: [x, y + 0.35 * scale], bottom: [x, y - 0.35 * scale] };
      };
      const drawNand = (cx, cy, s, gateLabels = true) => {
        const w = (x1, y1, x2, y2, m) => wire(cx + x1 * s, cy + y1 * s, cx + x2 * s, cy + y2 * s, m);
        const d = (x, y, p, input) => mos(cx + x * s, cy + y * s, p, gateLabels ? input : '', s);
        w(-0.95, 1.45, 0.95, 1.45, materials.red);
        w(-0.95, -1.45, 0.95, -1.45, materials.green);
        const pa = d(-0.48, 0.82, true, 'A'), pb = d(0.48, 0.82, true, 'B');
        w(-0.48, 1.17, -0.48, 1.45, materials.red); w(0.48, 1.17, 0.48, 1.45, materials.red);
        w(pa.bottom[0] - cx, pa.bottom[1] - cy, -0.48, 0, materials.drain);
        w(-0.48, 0, 0.48, 0, materials.drain);
        w(pb.bottom[0] - cx, pb.bottom[1] - cy, 0.48, 0, materials.drain);
        const na = d(0, -0.43, false, 'A'), nb = d(0, -1.0, false, 'B');
        w(0, 0, na.top[0] - cx, na.top[1] - cy, materials.drain);
        w(0, na.bottom[1] - cy, 0, nb.top[1] - cy);
        w(0, nb.bottom[1] - cy, 0, -1.45, materials.green);
        w(0.48, 0, 1.15, 0, materials.drain);
        return { x: cx + 1.15 * s, y: cy };
      };
      const drawNor = (cx, cy, s) => {
        const w = (x1, y1, x2, y2, m) => wire(cx + x1 * s, cy + y1 * s, cx + x2 * s, cy + y2 * s, m);
        const d = (x, y, p, input) => mos(cx + x * s, cy + y * s, p, input, s);
        w(-0.95, 1.45, 0.95, 1.45, materials.red); w(-0.95, -1.45, 0.95, -1.45, materials.green);
        const pa = d(0, 0.99, true, 'A'), pb = d(0, 0.28, true, 'B');
        w(0, 1.45, 0, pa.top[1] - cy, materials.red);
        w(0, pa.bottom[1] - cy, 0, pb.top[1] - cy);
        w(0, pb.bottom[1] - cy, 0, 0, materials.drain);
        const na = d(-0.48, -0.82, false, 'A'), nb = d(0.48, -0.82, false, 'B');
        w(-0.48, 0, -0.48, na.top[1] - cy, materials.drain); w(0.48, 0, 0.48, nb.top[1] - cy, materials.drain);
        w(-0.48, na.bottom[1] - cy, -0.48, -1.45, materials.green); w(0.48, nb.bottom[1] - cy, 0.48, -1.45, materials.green);
        w(0, 0, 1.15, 0, materials.drain);
        return { x: cx + 1.15 * s, y: cy };
      };

      const boardW = xorFamily ? 11 : inverted ? 9 : 6;
      const boardH = xorFamily ? 6.5 : 5;
      const leftPortX = -boardW / 2 - 0.55;
      const rightPortX = boardW / 2 + 0.55;
      const inputYs = xorFamily ? [0.8, -1.2] : [0.72, -0.72];
      const topPortY = boardH / 2 + 0.55;
      const bottomPortY = -boardH / 2 - 0.55;
      pinBetween(leftPortX, inputYs[0], -boardW / 2, inputYs[0], materials.gate, 0.055, 0.18);
      pinBetween(leftPortX, inputYs[1], -boardW / 2, inputYs[1], materials.gate, 0.055, 0.18);
      pinBetween(boardW / 2, 0, rightPortX, 0, materials.drain, 0.055, 0.18);
      pinBetween(0, boardH / 2, 0, topPortY, materials.red, 0.055, 0.18);
      pinBetween(0, -boardH / 2, 0, bottomPortY, materials.green, 0.055, 0.18);
      group.userData.circuitPortLayout = [
        { label: 'A', role: 'input', position: [leftPortX, inputYs[0], 0.2] },
        { label: 'B', role: 'input', position: [leftPortX, inputYs[1], 0.2] },
        { label: 'OUT', role: 'output', position: [rightPortX, 0, 0.2] },
        { label: 'VDD', role: 'power', position: [0, topPortY, 0.2] },
        { label: 'GND', role: 'ground', position: [0, bottomPortY, 0.2] }
      ];
      mesh(new THREE.BoxGeometry(boardW, boardH, 0.12), materials.board, 0, 0, -0.12);
      label(`CMOS ${name}`, 0, boardH / 2 - 0.32, '#ffffff', 1.3);

      if (!xorFamily) {
        const useNor = type === 'cmosNor' || type === 'cmosOr';
        const drawBase = useNor ? drawNor : drawNand;
        if (!inverted) {
          const out = drawBase(-0.05, -0.05, 0.88);
          wire(out.x, out.y, 2.35, out.y, materials.drain);
          label('OUT', 2.15, 0.24, '#fbbf24', 0.5);
          group.userData.transistorCount = 4;
        } else {
          const out = drawBase(-2.05, -0.05, 0.62);
          // The base gate output directly drives both gates of the CMOS inverter.
          wire(out.x, out.y, 0.55, 0, materials.gate);
          const p = mos(1.2, 0.78, true, 'X'), n = mos(1.2, -0.78, false, 'X');
          wire(1.2, 1.13, 1.2, 1.45, materials.red); wire(1.2, -1.13, 1.2, -1.45, materials.green);
          wire(1.2, p.bottom[1], 1.2, 0, materials.drain); wire(1.2, 0, 1.2, n.top[1], materials.drain);
          wire(0.55, 0, 0.78, 0, materials.gate); wire(0.78, 0, 0.78, 0.78, materials.gate); wire(0.78, 0.78, 0.94, 0.78, materials.gate);
          wire(0.78, 0, 0.78, -0.78, materials.gate); wire(0.78, -0.78, 0.94, -0.78, materials.gate);
          wire(1.2, 0, 2.4, 0, materials.drain); label('OUT', 2.2, 0.27, '#fbbf24', 0.5);
          wire(-0.9, 1.45, 1.2, 1.45, materials.red); wire(-0.9, -1.45, 1.2, -1.45, materials.green);
          group.userData.transistorCount = 6;
        }
      } else {
        // XOR = NAND(A,B), NAND(A,N1), NAND(B,N1), then NAND(N2,N3).
        const cells = [[-3.15, 0.8], [-0.95, 0.8], [-0.95, -1.2], [1.25, -0.2]];
        const outs = cells.map(([x, y]) => drawNand(x, y, 0.36, false));
        label('A', -4.35, 1.55, '#38bdf8', 0.3); label('B', -4.35, -0.7, '#38bdf8', 0.3);
        // Shared input fanout and the three NAND intermediate nets.
        wire(-4.15, 0.8, -3.55, 0.8, materials.gate); wire(-4.15, -1.2, -3.55, -1.2, materials.gate);
        wire(outs[0].x, outs[0].y, -1.35, 0.8, materials.drain);
        wire(-1.35, 0.8, -1.35, 0.8, materials.gate); wire(-1.35, 0.8, -1.1, 0.8, materials.gate);
        wire(-1.35, 0.8, -1.35, -1.2, materials.drain); wire(-1.35, -1.2, -1.1, -1.2, materials.gate);
        wire(-1.35, 0.8, -0.95, 0.8, materials.drain); wire(-1.35, -1.2, -0.95, -1.2, materials.drain);
        wire(outs[1].x, outs[1].y, 0.65, 0.8, materials.drain); wire(outs[2].x, outs[2].y, 0.65, -1.2, materials.drain);
        wire(0.65, 0.8, 0.65, -0.2, materials.drain); wire(0.65, -1.2, 0.65, -0.2, materials.drain); wire(0.65, -0.2, 0.89, -0.2, materials.gate);
        if (type === 'cmosXor') {
          wire(outs[3].x, outs[3].y, 4.0, -0.2, materials.drain); label('OUT', 3.8, 0.1, '#fbbf24', 0.5);
          group.userData.transistorCount = 16;
        } else {
          const p = mos(3.45, 0.48, true, 'X'), n = mos(3.45, -0.92, false, 'X');
          wire(outs[3].x, outs[3].y, 2.65, -0.2, materials.gate); wire(2.65, -0.2, 2.65, 0.48, materials.gate); wire(2.65, 0.48, 3.03, 0.48, materials.gate);
          wire(2.65, -0.2, 2.65, -0.92, materials.gate); wire(2.65, -0.92, 3.03, -0.92, materials.gate);
          wire(3.45, 0.83, 3.45, 1.45, materials.red); wire(3.45, -1.27, 3.45, -1.45, materials.green);
          wire(3.45, p.bottom[1], 3.45, 0, materials.drain); wire(3.45, 0, 3.45, n.top[1], materials.drain);
          wire(3.45, 0, 4.4, 0, materials.drain); label('OUT', 4.15, 0.25, '#fbbf24', 0.5);
          group.userData.transistorCount = 18;
        }
        wire(-3.65, 1.45, 3.45, 1.45, materials.red); wire(-3.65, -1.45, 3.45, -1.45, materials.green);
        label('4 connected CMOS NAND stages', 0, -2.8, '#a7f3d0', 2.5);
      }
    } else if (['cmosNand', 'cmosNor', 'cmosAnd', 'cmosOr', 'cmosXor', 'cmosXnor'].includes(type)) {
      const gates = {
        cmosNand: { name: 'NAND', count: 4, description: 'PMOS parallel · NMOS series' },
        cmosNor: { name: 'NOR', count: 4, description: 'PMOS series · NMOS parallel' },
        cmosAnd: { name: 'AND', count: 6, description: 'NAND network + inverter' },
        cmosOr: { name: 'OR', count: 6, description: 'NOR network + inverter' },
        cmosXor: { name: 'XOR', count: 12, description: 'Complementary transmission gate' },
        cmosXnor: { name: 'XNOR', count: 14, description: 'XOR network + inverter' }
      };
      const gate = gates[type];
      group.name = `CMOS ${gate.name} Gate`;
      group.userData.logicCircuit = gate.name;
      group.userData.transistorCount = gate.count;
      const columns = 4;
      const rows = Math.ceil(gate.count / columns);
      const boardWidth = 5.2;
      const boardHeight = Math.max(3.5, rows * 0.9 + 1.5);
      mesh(new THREE.BoxGeometry(boardWidth, boardHeight, 0.12), materials.board, 0, 0, -0.12);

      const addLabel = (text, x, y, color, width = 0.9) => {
        const canvas = document.createElement('canvas');
        canvas.width = 192;
        canvas.height = 48;
        const context = canvas.getContext('2d');
        context.fillStyle = '#101722';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = color;
        context.font = 'bold 24px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
        sprite.position.set(x, y, 0.22);
        sprite.scale.set(width, 0.24, 1);
        group.add(sprite);
      };

      // Show the gate's MOSFET devices and terminals as one selectable component.
      addLabel(`CMOS ${gate.name}`, 0, boardHeight / 2 - 0.42, '#f8fafc', 1.7);
      addLabel(`${gate.count} MOSFETs · ${gate.description}`, 0, -boardHeight / 2 + 0.36, '#a7f3d0', 4.2);
      const inputs = type.includes('Xor') || type.includes('Xnor') ? ['A', 'B'] : ['A', 'B'];
      for (let index = 0; index < gate.count; index++) {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = (col - (columns - 1) / 2) * 1.12;
        const y = boardHeight / 2 - 1.15 - row * 0.9;
        const isPmos = index < gate.count / 2;
        const material = isPmos ? materials.pmos : materials.body;
        mesh(new THREE.BoxGeometry(0.68, 0.48, 0.2), material, x, y, 0.08);
        pinBetween(x - 0.46, y, x - 0.34, y, materials.gate, 0.035);
        pinBetween(x + 0.34, y, x + 0.46, y, materials.drain, 0.035);
        addLabel(`${isPmos ? 'P' : 'N'}${inputs[index % inputs.length]}`, x, y, isPmos ? '#e9ddff' : '#dbeafe', 0.34);
      }
      // Rail and output stubs make the gate's supply, ground, and output terminals clear.
      const topY = boardHeight / 2 - 0.85;
      const bottomY = -boardHeight / 2 + 0.82;
      pinBetween(-1.8, topY, 1.8, topY, materials.red, 0.04);
      pinBetween(-1.8, bottomY, 1.8, bottomY, materials.green, 0.04);
      addLabel('VDD', 2.05, topY, '#fca5a5', 0.48);
      addLabel('GND', 2.05, bottomY, '#86efac', 0.48);
      pinBetween(boardWidth / 2 - 0.72, 0, boardWidth / 2 - 0.18, 0, materials.drain, 0.04);
      addLabel('OUT', boardWidth / 2 - 0.43, 0.28, '#fbbf24', 0.52);
      addLabel('A   B', -boardWidth / 2 + 0.5, 0.28, '#38bdf8', 0.72);
    } else if (type === 'sramArray') {
      // A 4 × 4 SRAM array: each bit cell has two cross-coupled inverters
      // (four MOSFETs) and two word-line access MOSFETs (six total).
      const columns = 4;
      const rows = 4;
      const cellW = 2.35;
      const cellH = 1.85;
      const boardW = columns * cellW + 2.6;
      const boardH = rows * cellH + 2.8;
      const left = -((columns - 1) * cellW) / 2;
      const top = ((rows - 1) * cellH) / 2;
      group.name = '4×4 SRAM Array (96T)';
      group.userData.memoryType = 'SRAM';
      group.userData.rows = rows;
      group.userData.columns = columns;
      group.userData.transistorCount = rows * columns * 6;
      mesh(new THREE.BoxGeometry(boardW, boardH, 0.12), materials.board, 0, 0, -0.12);

      const addLabel = (text, x, y, color, width = 0.72) => {
        const canvas = document.createElement('canvas');
        canvas.width = 192;
        canvas.height = 48;
        const context = canvas.getContext('2d');
        context.fillStyle = '#101722';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = color;
        context.font = 'bold 25px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
        sprite.position.set(x, y, 1.02);
        sprite.scale.set(width, 0.25, 1);
        group.add(sprite);
      };

      // Vertical differential bit lines shared by each column.
      for (let col = 0; col < columns; col++) {
        const x = left + col * cellW;
        pinBetween(x - 0.26, boardH / 2 - 0.55, x - 0.26, -boardH / 2 + 0.45, materials.drain, 0.045, 0.85);
        pinBetween(x + 0.26, boardH / 2 - 0.55, x + 0.26, -boardH / 2 + 0.45, materials.gate, 0.045, 0.85);
        addLabel(`BL${col}`, x - 0.26, boardH / 2 - 0.26, '#fbbf24', 0.58);
        addLabel(`BL̅${col}`, x + 0.26, boardH / 2 - 0.26, '#38bdf8', 0.62);
      }

      // Each horizontal WL selects the two access FETs in one row.
      for (let row = 0; row < rows; row++) {
        const y = top - row * cellH;
        pinBetween(-boardW / 2 + 0.42, y, boardW / 2 - 0.42, y, materials.red, 0.045, 0.92);
        addLabel(`WL${row}`, -boardW / 2 + 0.35, y + 0.2, '#fca5a5', 0.65);
      }

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          const cx = left + col * cellW;
          const cy = top - row * cellH;
          // Storage latch: two CMOS inverter pairs with crossed feedback nets.
          const transistor = (x, y, pmos, name) => {
            // Raised, solid MOSFET package with three metal terminals.
            mesh(new THREE.BoxGeometry(0.47, 0.3, 0.62), pmos ? materials.pmos : materials.body, x, y, 0.31);
            pinBetween(x - 0.34, y, x - 0.24, y, materials.gate, 0.035, 0.64);
            pinBetween(x + 0.24, y, x + 0.34, y, materials.drain, 0.035, 0.64);
            addLabel(name, x, y, pmos ? '#e9ddff' : '#dbeafe', 0.35);
          };
          transistor(cx - 0.49, cy + 0.42, true, 'P');
          transistor(cx - 0.49, cy - 0.42, false, 'N');
          transistor(cx + 0.49, cy + 0.42, true, 'P');
          transistor(cx + 0.49, cy - 0.42, false, 'N');
          // Access FETs sit at the cell edge on the selected word line.
          transistor(cx - 0.49, cy, false, 'A');
          transistor(cx + 0.49, cy, false, 'A');
          addLabel(`M${row}${col}`, cx, cy - 0.72, '#a7f3d0', 0.66);
          // Cross-coupled storage nodes and local access stubs.
          pinBetween(cx - 0.23, cy + 0.42, cx + 0.23, cy + 0.42, materials.drain, 0.035, 0.69);
          pinBetween(cx + 0.23, cy - 0.42, cx - 0.23, cy - 0.42, materials.gate, 0.035, 0.69);
          pinBetween(cx - 0.49, cy + 0.12, cx - 0.49, cy - 0.12, materials.gate, 0.035, 0.69);
          pinBetween(cx + 0.49, cy + 0.12, cx + 0.49, cy - 0.12, materials.gate, 0.035, 0.69);
        }
      }
      addLabel('4 × 4 SRAM · 16 bits · 96 transistors', 0, -boardH / 2 + 0.2, '#a7f3d0', 3.8);
    } else return null;

    group.rotation.x = -Math.PI / 2;
    if (type === 'cmosInverter') group.scale.setScalar(1.5);
    group.position.copy(cursor);
    group.position.y += 0.45;
    group.userData.circuitComponent = type;
    this.addObject(group);
    if (type === 'voltageSource') {
      const sourceId = group.userData.circuitSourceId;
      group.updateMatrixWorld(true);
      const positive = this.createCircuitConnectionPoint(group.localToWorld(new THREE.Vector3(-1.12, 0, 0.13)), {
        polarity: 'positive', sourceId, terminalOwnerId: group.uuid, terminalLocalOffset: [-1.12, 0, 0.13]
      });
      positive.name = 'V+ Terminal';
      const negative = this.createCircuitConnectionPoint(group.localToWorld(new THREE.Vector3(1.12, 0, 0.13)), {
        polarity: 'negative', sourceId, terminalOwnerId: group.uuid, terminalLocalOffset: [1.12, 0, 0.13]
      });
      negative.name = 'V− Terminal';
    } else if (type === 'wire') {
      group.updateMatrixWorld(true);
      const terminalA = this.createCircuitConnectionPoint(group.localToWorld(new THREE.Vector3(-1, 0, 0.13)), {
        terminalOwnerId: group.uuid, terminalLocalOffset: [-1, 0, 0.13], terminalIndex: 0
      });
      terminalA.name = 'Wire Terminal A';
      const terminalB = this.createCircuitConnectionPoint(group.localToWorld(new THREE.Vector3(1, 0, 0.13)), {
        terminalOwnerId: group.uuid, terminalLocalOffset: [1, 0, 0.13], terminalIndex: 1
      });
      terminalB.name = 'Wire Terminal B';
    } else if (type === 'led') {
      group.updateMatrixWorld(true);
      const anode = this.createCircuitConnectionPoint(group.localToWorld(new THREE.Vector3(-0.75, -0.16, 0.13)), {
        terminalOwnerId: group.uuid, terminalLocalOffset: [-0.75, -0.16, 0.13], terminalIndex: 0, terminalLabel: '+'
      });
      anode.name = 'LED + Terminal';
      const cathode = this.createCircuitConnectionPoint(group.localToWorld(new THREE.Vector3(0.75, -0.16, 0.13)), {
        terminalOwnerId: group.uuid, terminalLocalOffset: [0.75, -0.16, 0.13], terminalIndex: 1, terminalLabel: '−'
      });
      cathode.name = 'LED − Terminal';
    } else if (Array.isArray(group.userData.circuitPortLayout)) {
      group.updateMatrixWorld(true);
      group.userData.circuitPortLayout.forEach((port, terminalIndex) => {
        const terminal = this.createCircuitConnectionPoint(
          group.localToWorld(new THREE.Vector3(...port.position)),
          {
            terminalOwnerId: group.uuid,
            terminalLocalOffset: port.position,
            terminalIndex,
            terminalLabel: port.label,
            terminalRole: port.role,
            polarity: port.polarity
          }
        );
        terminal.name = `${group.name} ${port.label} Terminal`;
      });
    }
    this.setSelectedObject(group);
    return group;
  }

  createLedDemoCircuit() {
    const source = this.createCircuitComponent('voltageSource');
    const led = this.createCircuitComponent('led');
    if (!source || !led) return null;

    source.position.set(0, 0.45, -2);
    led.position.set(0, 0.45, 2);
    this.updateCircuitConnections();

    const nodes = this.objectsList.filter((object) => object.userData?.circuitNodeId);
    const sourceTerminals = nodes.filter((node) => node.userData.terminalOwnerId === source.uuid);
    const ledTerminals = nodes.filter((node) => node.userData.terminalOwnerId === led.uuid);
    const positive = sourceTerminals.find((node) => node.userData.polarity === 'positive');
    const negative = sourceTerminals.find((node) => node.userData.polarity === 'negative');
    const anode = ledTerminals.find((node) => node.userData.terminalIndex === 0);
    const cathode = ledTerminals.find((node) => node.userData.terminalIndex === 1);
    if (!positive || !negative || !anode || !cathode) return null;

    this.createCircuitConnection(positive, anode);
    this.createCircuitConnection(cathode, negative);
    this.updateCircuitConnections();
    this.editor?.selectionManager?.select(led, false);
    return { source, led };
  }

  createCircuitConnectionPoint(position, terminalData = {}) {
    this._circuitNodeSequence = (this._circuitNodeSequence || 0) + 1;
    const isTerminal = Boolean(terminalData.terminalOwnerId || terminalData.isUserTerminal);
    const terminalColor = terminalData.polarity === 'positive'
      ? 0xef5350
      : terminalData.polarity === 'negative' ? 0x60a5fa : 0xfbbf24;
    const point = new THREE.Mesh(
      isTerminal ? new THREE.CylinderGeometry(0.12, 0.15, 0.12, 20) : new THREE.SphereGeometry(0.14, 18, 12),
      new THREE.MeshStandardMaterial({
        color: isTerminal ? terminalColor : 0xf59e0b,
        emissive: isTerminal ? terminalColor : 0x5c3200,
        emissiveIntensity: isTerminal ? 0.2 : 1,
        metalness: isTerminal ? 0.62 : 0.35,
        roughness: 0.3
      })
    );
    point.name = isTerminal ? 'Wire Terminal' : `Connection Point ${this._circuitNodeSequence}`;
    point.position.copy(position);
    point.userData.circuitComponent = 'connectionPoint';
    point.userData.circuitNodeId = `node-${Date.now()}-${this._circuitNodeSequence}`;
    Object.assign(point.userData, terminalData);
    if (isTerminal) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.145, 0.022, 8, 20),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.22 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.045;
      point.add(ring);

      const labelText = terminalData.polarity === 'positive'
        ? '+'
        : terminalData.polarity === 'negative' ? '−' : terminalData.terminalLabel || (terminalData.terminalIndex === 0 ? 'A' : 'B');
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 48;
      const context = canvas.getContext('2d');
      context.fillStyle = '#101722';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = terminalData.polarity === 'positive' ? '#fca5a5' : terminalData.polarity === 'negative' ? '#93c5fd' : '#fde68a';
      context.font = 'bold 24px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(labelText, canvas.width / 2, canvas.height / 2);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
      tag.position.set(0, 0.22, 0);
      tag.scale.set(0.56, 0.17, 1);
      point.add(tag);
    }
    point.castShadow = true;
    point.receiveShadow = true;
    this.addObject(point);
    this.setSelectedObject(point);
    return point;
  }

  createCircuitConnection(startNode, endNode) {
    const startNodeId = startNode?.userData?.circuitNodeId;
    const endNodeId = endNode?.userData?.circuitNodeId;
    if (!startNodeId || !endNodeId || startNodeId === endNodeId) return null;
    const duplicate = this.objectsList.some((object) => object.userData?.circuitConnection &&
      ((object.userData.startNodeId === startNodeId && object.userData.endNodeId === endNodeId) ||
       (object.userData.startNodeId === endNodeId && object.userData.endNodeId === startNodeId)));
    if (duplicate) return null;

    const connection = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0225, 0.0225, 1, 14),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0x402600, metalness: 0.55, roughness: 0.28, transparent: true, opacity: 0.25 })
    );
    connection.name = `Wire ${startNode.name} to ${endNode.name}`;
    connection.userData.circuitComponent = 'connectionWire';
    connection.userData.circuitConnection = true;
    connection.userData.startNodeId = startNodeId;
    connection.userData.endNodeId = endNodeId;
    const currentBadge = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.createCircuitCurrentTexture(''),
      transparent: true,
      depthTest: false,
      depthWrite: false
    }));
    currentBadge.name = 'Current readout';
    currentBadge.userData.currentBadge = true;
    currentBadge.position.set(0, 0, 0.12);
    currentBadge.scale.set(1.05, 0.3, 1);
    currentBadge.visible = false;
    connection.add(currentBadge);
    for (let index = 0; index < 3; index++) {
      const electron = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0xff8a00, emissive: 0xff5900, emissiveIntensity: 1.4, roughness: 0.24 })
      );
      electron.name = `Current Flow Ball ${index + 1}`;
      electron.userData.flowParticleIndex = index;
      electron.visible = false;
      electron.position.y = -0.36 + index * 0.36;
      connection.add(electron);
    }
    this.addObject(connection);
    this.updateCircuitConnections();
    this.setSelectedObject(connection);
    return connection;
  }

  updateCircuitConnections() {
    const nodes = new Map(this.objectsList.filter((object) => object.userData?.circuitNodeId)
      .map((object) => [object.userData.circuitNodeId, object]));
    const owners = new Map(this.objectsList.map((object) => [object.uuid, object]));
    for (const node of nodes.values()) {
      const owner = owners.get(node.userData.terminalOwnerId);
      const localOffset = node.userData.terminalLocalOffset;
      if (!owner || !Array.isArray(localOffset)) continue;
      owner.updateMatrixWorld(true);
      node.position.copy(owner.localToWorld(new THREE.Vector3().fromArray(localOffset)));
    }
    for (const connection of this.objectsList.filter((object) => object.userData?.circuitConnection)) {
      const start = nodes.get(connection.userData.startNodeId);
      const end = nodes.get(connection.userData.endNodeId);
      if (!start || !end) continue;
      const delta = end.position.clone().sub(start.position);
      const length = delta.length();
      connection.position.copy(start.position).add(end.position).multiplyScalar(0.5);
      connection.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      connection.scale.set(1, length, 1);
      connection.children.forEach((electron) => {
        if (!Number.isInteger(electron.userData.flowParticleIndex)) return;
        electron.scale.y = length > 1e-6 ? 1 / length : 1;
      });
    }
  }

  updateCircuitFlow(deltaSeconds = 0) {
    this._circuitFlowClock = ((this._circuitFlowClock || 0) + Math.max(0, deltaSeconds) * 0.32) % 1;
    const nodes = this.objectsList.filter((object) => object.userData?.circuitNodeId);
    const wires = this.objectsList.filter((object) => object.userData?.circuitConnection);
    const leds = this.objectsList.filter((object) => object.userData?.circuitComponent === 'led');
    const resistors = this.objectsList.filter((object) => object.userData?.resistanceOhms > 0);
    const conductiveEdges = wires.map((wire) => ({
      startNodeId: wire.userData.startNodeId,
      endNodeId: wire.userData.endNodeId,
      wire
    }));
    for (const led of leds) {
      const terminals = nodes
        .filter((node) => node.userData.terminalOwnerId === led.uuid)
        .sort((a, b) => a.userData.terminalIndex - b.userData.terminalIndex);
      if (terminals.length >= 2) {
        conductiveEdges.push({
          startNodeId: terminals[0].userData.circuitNodeId,
          endNodeId: terminals[1].userData.circuitNodeId,
          led
        });
      }
    }
    for (const resistor of resistors) {
      const terminals = nodes
        .filter((node) => node.userData.terminalOwnerId === resistor.uuid)
        .sort((a, b) => a.userData.terminalIndex - b.userData.terminalIndex);
      if (terminals.length >= 2) {
        conductiveEdges.push({
          startNodeId: terminals[0].userData.circuitNodeId,
          endNodeId: terminals[1].userData.circuitNodeId,
          resistor
        });
      }
    }
    const activeWires = new Map();
    const activeLeds = new Set();

    for (const source of this.objectsList.filter((object) => object.userData?.voltageSource)) {
      const terminals = nodes.filter((node) => node.userData.sourceId === source.userData.circuitSourceId);
      const positive = terminals.find((node) => node.userData.polarity === 'positive');
      const negative = terminals.find((node) => node.userData.polarity === 'negative');
      if (!positive || !negative) continue;

      const previous = new Map([[positive.userData.circuitNodeId, null]]);
      const queue = [positive.userData.circuitNodeId];
      while (queue.length && !previous.has(negative.userData.circuitNodeId)) {
        const current = queue.shift();
        for (const edge of conductiveEdges) {
          let next = null;
          if (edge.startNodeId === current) next = edge.endNodeId;
          else if (edge.endNodeId === current) next = edge.startNodeId;
          if (next && !previous.has(next)) {
            previous.set(next, { nodeId: current, edge });
            queue.push(next);
          }
        }
      }

      let cursor = negative.userData.circuitNodeId;
      if (!previous.has(cursor)) continue;
      const path = [];
      while (cursor !== positive.userData.circuitNodeId) {
        const step = previous.get(cursor);
        if (!step) break;
        const edge = step.edge;
        const direction = edge.startNodeId === step.nodeId ? 1 : -1;
        if (edge.wire) path.push({ wire: edge.wire, direction });
        if (edge.led && direction === 1) activeLeds.add(edge.led.uuid);
        path.push({ edge });
        cursor = step.nodeId;
      }

      const pathEdges = path.filter((part) => part.edge).map((part) => part.edge);
      const resistance = pathEdges.reduce((sum, edge) => sum + Number(edge.resistor?.userData.resistanceOhms || 0), 0);
      const hasLed = pathEdges.some((edge) => edge.led);
      const voltage = Math.abs(Number(source.userData.voltage ?? 5));
      // LEDs use a nominal 20 mA model; resistive paths use Ohm's law.
      const currentA = resistance > 0
        ? Math.max(0, (voltage - (hasLed ? 2 : 0)) / resistance)
        : hasLed
          ? Math.min(0.02 * voltage / 5, 0.1)
          : Math.min(voltage / 0.1, 1);
      const isShort = resistance <= 0 && !hasLed;
      path.filter((part) => part.wire).forEach(({ wire, direction }) => {
        activeWires.set(wire.uuid, { direction, currentA, isShort });
      });
    }

    for (const wire of wires) {
      const flow = activeWires.get(wire.uuid);
      const direction = flow?.direction || 0;
      const isActive = Boolean(flow && flow.currentA > 0);
      wire.material.color.setHex(isActive ? 0xff8a24 : 0xfbbf24);
      wire.material.emissive.setHex(isActive ? 0xff4a08 : 0x402600);
      wire.material.emissiveIntensity = isActive ? 2.8 : 0.5;
      wire.material.opacity = isActive ? 0.95 : 0.25;
      const length = Math.max(wire.scale.y, 1e-6);
      const badge = wire.children.find((child) => child.userData.currentBadge);
      if (badge) {
        badge.visible = isActive;
        if (isActive) {
          this.updateCircuitCurrentBadge(badge, flow.currentA, flow.isShort);
          badge.scale.y = 0.34 / length;
        }
      }
      for (const electron of wire.children) {
        const index = electron.userData.flowParticleIndex;
        if (!Number.isInteger(index)) continue;
        electron.visible = isActive;
        if (!isActive) continue;
        const progress = ((index / 3 + this._circuitFlowClock * direction) % 1 + 1) % 1;
        electron.position.y = (progress - 0.5) * 0.78;
        electron.scale.y = 1 / length;
      }
    }

    for (const led of leds) {
      const isOn = activeLeds.has(led.uuid);
      if (led.userData.ledOn === isOn) continue;
      led.userData.ledOn = isOn;
      led.traverse((part) => {
        if (!part.userData.ledEmitter || !part.material?.emissive) return;
        part.material.emissive.setHex(isOn ? 0x39ff85 : 0x073b29);
        part.material.emissiveIntensity = isOn ? 2.2 : 0.2;
      });
    }
  }

  createCircuitCurrentTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(8, 18, 24, 0.92)';
    context.strokeStyle = '#58f0ae';
    context.lineWidth = 6;
    context.beginPath();
    context.roundRect(5, 5, 502, 118, 28);
    context.fill();
    context.stroke();
    context.fillStyle = '#9cffc9';
    context.font = 'bold 46px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  updateCircuitCurrentBadge(badge, currentA, isShort) {
    const value = isShort
      ? 'I > 1.00 A · SHORT'
      : `I ≈ ${currentA >= 1 ? `${currentA.toFixed(2)} A` : `${(currentA * 1000).toFixed(1)} mA`}`;
    if (badge.userData.currentText === value) return;
    badge.userData.currentText = value;
    badge.material.map?.dispose();
    badge.material.map = this.createCircuitCurrentTexture(value);
    badge.material.needsUpdate = true;
    badge.scale.set(value.length > 14 ? 1.55 : 1.12, 0.34, 1);
  }

  createAtom(protons = 6, neutrons = 6, electrons = 6, elementName = 'Carbon') {
    // Counts are configurable for other atoms; the Add menu creates carbon.
    protons = Math.max(1, Math.floor(Number(protons) || 0));
    neutrons = Math.max(0, Math.floor(Number(neutrons) || 0));
    electrons = Math.max(0, Math.floor(Number(electrons) || 0));

    const origin = this.get3DCursorPosition();
    const compound = this.createCompoundGroup(`${elementName} Atom`, origin);
    const nucleonRadius = 0.22;
    const electronRadius = 0.13;
    const nucleonCount = protons + neutrons;
    const nucleusRadius = nucleonCount > 1
      ? Math.max(0.55, 0.16 * Math.sqrt(nucleonCount))
      : 0;
    const nucleusOuterRadius = nucleusRadius + nucleonRadius;
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    const materials = {
      proton: new THREE.MeshStandardMaterial({ color: 0xef5350, roughness: 0.35, metalness: 0.08 }),
      neutron: new THREE.MeshStandardMaterial({ color: 0x42a5f5, roughness: 0.35, metalness: 0.08 }),
      electron: new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0x8a5b00, emissiveIntensity: 0.35, roughness: 0.25 })
    };
    const nucleons = [];
    const electronMeshes = [];
    for (let i = 0; i < protons + neutrons; i++) {
      const isProton = i < protons;
      const mesh = new THREE.Mesh(sphere, materials[isProton ? 'proton' : 'neutron']);
      mesh.name = `${elementName} ${isProton ? 'Proton' : 'Neutron'} ${isProton ? i + 1 : i - protons + 1}`;
      mesh.scale.setScalar(nucleonRadius);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Fibonacci sphere distribution keeps the nucleus compact and readable.
      const y = 1 - (i / Math.max(nucleonCount - 1, 1)) * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      mesh.position.copy(new THREE.Vector3(
        Math.cos(angle) * ring * nucleusRadius,
        y * nucleusRadius,
        Math.sin(angle) * ring * nucleusRadius
      ));
      mesh.userData.atomParticle = isProton ? 'proton' : 'neutron';
      compound.add(mesh);
      nucleons.push(mesh);
    }

    const electronSlots = getElectronOrbitalSlots(electrons, protons, nucleusOuterRadius);
    for (let i = 0; i < electronSlots.length; i++) {
      const mesh = new THREE.Mesh(sphere, materials.electron);
      mesh.name = `${elementName} Electron ${i + 1}`;
      mesh.position.copy(electronSlots[i]);
      mesh.scale.setScalar(electronRadius);
      mesh.castShadow = true;
      mesh.userData.atomParticle = 'electron';
      compound.add(mesh);
      electronMeshes.push(mesh);
    }

    this.addObject(compound);
    this.selectGeneratedObject(compound);
    return {
      group: compound,
      protons: nucleons.slice(0, protons),
      neutrons: nucleons.slice(protons),
      electrons: electronMeshes
    };
  }

  createSolarCell() {
    const origin = this.get3DCursorPosition();
    const cell = this.createCompoundGroup('Solar Cell (Photovoltaic)', origin);
    cell.userData.solarCell = true;
    const makeBox = (name, size, position, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.name = name;
      mesh.position.set(...position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      cell.add(mesh);
      return mesh;
    };

    const frame = new THREE.MeshStandardMaterial({ color: 0x9aa8b8, metalness: 0.78, roughness: 0.28 });
    const back = new THREE.MeshStandardMaterial({ color: 0x253144, metalness: 0.38, roughness: 0.42 });
    const silicon = new THREE.MeshStandardMaterial({ color: 0x123c78, metalness: 0.22, roughness: 0.3, emissive: 0x071a36 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xd7e0e8, metalness: 0.85, roughness: 0.22 });

    // A single photovoltaic wafer: silicon under a glass-like top, with
    // front contacts that collect the charge produced by incoming light.
    makeBox('Solar cell backing', [2.15, 2.15, 0.12], [0, 0, -0.08], back);
    makeBox('Silicon photovoltaic wafer', [2, 2, 0.055], [0, 0, 0.01], silicon);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 2.02, 0.018),
      new THREE.MeshPhysicalMaterial({ color: 0x9bdcff, transparent: true, opacity: 0.16, roughness: 0.12, metalness: 0.05, transmission: 0.22 })
    );
    glass.name = 'Transparent protective cover';
    glass.position.z = 0.055;
    cell.add(glass);

    // Fine fingers run vertically into two busbars, as on a real cell.
    for (let i = 0; i < 11; i++) {
      const x = -0.88 + i * 0.176;
      makeBox(`Front contact finger ${i + 1}`, [0.018, 1.88, 0.012], [x, 0, 0.072], silver);
    }
    for (const [index, x] of [-0.48, 0.48].entries()) {
      makeBox(`Busbar ${index + 1}`, [0.075, 1.94, 0.018], [x, 0, 0.078], silver);
    }

    // Short positive and negative tabs make the two electrical terminals visible.
    const positiveMetal = new THREE.MeshStandardMaterial({ color: 0xe34b5b, emissive: 0x3d0710, metalness: 0.55, roughness: 0.3 });
    const negativeMetal = new THREE.MeshStandardMaterial({ color: 0x55b8ff, emissive: 0x082d50, metalness: 0.55, roughness: 0.3 });
    makeBox('Positive terminal tab (holes)', [0.24, 0.12, 0.045], [0.48, -1.13, -0.035], positiveMetal);
    makeBox('Negative terminal tab (electrons)', [0.24, 0.12, 0.045], [-0.48, -1.13, -0.035], negativeMetal);

    const addCaption = (text, position, color) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 96;
      const context = canvas.getContext('2d');
      context.font = 'bold 38px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = color;
      context.fillText(text, canvas.width / 2, canvas.height / 2);
      const caption = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
      caption.position.set(...position);
      caption.scale.set(2.45, 0.46, 1);
      cell.add(caption);
    };
    addCaption('LIGHT  →  e⁻ / hole pair', [0, 1.42, 0.18], '#fff2a8');
    addCaption('e⁻ → negative contact', [-0.52, -1.42, 0.12], '#8ed5ff');
    addCaption('hole → positive contact', [0.65, -1.42, 0.12], '#ff9eaa');

    const electronMaterial = new THREE.MeshStandardMaterial({ color: 0x71d5ff, emissive: 0x1599e6, emissiveIntensity: 1.1, roughness: 0.24 });
    const holeMaterial = new THREE.MeshStandardMaterial({ color: 0xff8f9e, emissive: 0xd81b45, emissiveIntensity: 1.0, roughness: 0.24 });
    const photonMaterial = new THREE.MeshStandardMaterial({ color: 0xffed8a, emissive: 0xffb300, emissiveIntensity: 1.8, roughness: 0.2 });
    const pairs = [];
    for (let i = 0; i < 3; i++) {
      const electron = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), electronMaterial);
      const hole = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), holeMaterial);
      electron.name = `Excited electron ${i + 1}`;
      hole.name = `Electron vacancy (hole) ${i + 1}`;
      cell.add(electron, hole);
      const photon = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), photonMaterial);
      photon.name = `Incoming light photon ${i + 1}`;
      cell.add(photon);
      pairs.push({ electron, hole, photon, phase: i / 3, y: 0.55 - i * 0.55 });
    }
    cell.userData.solarCellAnimation = { elapsed: 0, pairs };

    this.addObject(cell);
    this.selectGeneratedObject(cell);
    this.animatedAtoms.push(cell);
    return cell;
  }

  createRightHandRuleCopperConductor() {
    const origin = this.get3DCursorPosition();
    const model = this.createCompoundGroup('Right-Hand Rule & Copper E-Field (Anode → Cathode)', origin);
    model.userData.rightHandRuleSimulation = true;

    const addLabel = (text, position, color = '#f2f5f9', width = 2.4, height = 0.55) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      if (ctx.roundRect) {
        ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 16);
      } else {
        ctx.rect(8, 8, canvas.width - 16, canvas.height - 16);
      }
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthTest: false
      }));
      sprite.position.copy(position);
      sprite.scale.set(width, height, 1);
      model.add(sprite);
      return sprite;
    };

    // 1. ANODE (+) & CATHODE (-) ELECTRODES
    const terminalGeo = new THREE.BoxGeometry(0.35, 1.4, 1.4);

    // Anode (+) at x = -3.2 (Red / Warm metallic)
    const anodeMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.8,
      roughness: 0.25,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.35
    });
    const anode = new THREE.Mesh(terminalGeo, anodeMat);
    anode.name = 'Positive Anode (+)';
    anode.position.set(-3.2, 0, 0);
    model.add(anode);

    // Cathode (-) at x = +3.2 (Blue / Silver metallic)
    const cathodeMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      metalness: 0.8,
      roughness: 0.25,
      emissive: 0x1e3a8a,
      emissiveIntensity: 0.35
    });
    const cathode = new THREE.Mesh(terminalGeo, cathodeMat);
    cathode.name = 'Negative Cathode (-)';
    cathode.position.set(3.2, 0, 0);
    model.add(cathode);

    // Terminal plus / minus symbols
    const plusGeo = new THREE.BoxGeometry(0.08, 0.45, 0.08);
    const plusH = new THREE.Mesh(plusGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const plusV = plusH.clone();
    plusV.rotation.z = Math.PI / 2;
    const plusGroup = new THREE.Group();
    plusGroup.add(plusH, plusV);
    plusGroup.position.set(-3.4, 0, 0);
    model.add(plusGroup);

    const minusH = new THREE.Mesh(plusGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    minusH.rotation.z = Math.PI / 2;
    minusH.position.set(3.4, 0, 0);
    model.add(minusH);

    addLabel('Anode (+) [High V]', new THREE.Vector3(-3.2, 1.15, 0), '#ef4444', 2.0, 0.5);
    addLabel('Cathode (-) [0V]', new THREE.Vector3(3.2, 1.15, 0), '#3b82f6', 2.0, 0.5);

    // 2. TRANSPARENT COPPER WIRE / CHAMBER
    const chamberGeo = new THREE.CylinderGeometry(0.85, 0.85, 6.0, 32, 1, true);
    chamberGeo.rotateZ(Math.PI / 2);
    const chamberMat = new THREE.MeshPhysicalMaterial({
      color: 0xd97706,
      transparent: true,
      opacity: 0.14,
      roughness: 0.15,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const chamber = new THREE.Mesh(chamberGeo, chamberMat);
    chamber.name = 'Copper Conductor Sheath';
    model.add(chamber);

    // Outer guide lines / wire edges
    const wireRingMat = new THREE.LineBasicMaterial({ color: 0xb45309, transparent: true, opacity: 0.45 });
    [-3.0, 3.0].forEach((x) => {
      const ringGeo = new THREE.BufferGeometry();
      const pts = [];
      for (let i = 0; i <= 36; i++) {
        const theta = (i / 36) * Math.PI * 2;
        pts.push(new THREE.Vector3(x, Math.sin(theta) * 0.85, Math.cos(theta) * 0.85));
      }
      ringGeo.setFromPoints(pts);
      model.add(new THREE.Line(ringGeo, wireRingMat));
    });

    // 3. COPPER LATTICE WITH VALENCE HOLES (Cu⁺ cores & vacancy sites)
    const copperCores = [];
    const valenceHoles = [];
    const cuSphereGeo = new THREE.SphereGeometry(0.16, 20, 16);
    const cuMat = new THREE.MeshStandardMaterial({
      color: 0xc86432,
      metalness: 0.88,
      roughness: 0.22,
      emissive: 0x78350f,
      emissiveIntensity: 0.25
    });

    const holeTorusGeo = new THREE.TorusGeometry(0.24, 0.018, 12, 32);
    const holeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.75,
      roughness: 0.3
    });

    // 5 lattice columns along X (-2.0, -1.0, 0, 1.0, 2.0)
    // 2x2 grid in Y and Z (-0.35, +0.35) -> 20 atoms
    const xCols = [-2.0, -1.0, 0, 1.0, 2.0];
    const yRows = [-0.35, 0.35];
    const zRows = [-0.35, 0.35];

    const latticeSites = [];
    xCols.forEach((x, colIdx) => {
      yRows.forEach((y, rowIdx) => {
        zRows.forEach((z, depthIdx) => {
          const site = { x, y, z, colIdx, rowIdx, depthIdx };
          latticeSites.push(site);

          // Copper ion core
          const core = new THREE.Mesh(cuSphereGeo, cuMat);
          core.position.set(x, y, z);
          core.name = `Copper Atom Core (Col ${colIdx})`;
          model.add(core);
          copperCores.push(core);

          // Valence hole ring
          const hole = new THREE.Mesh(holeTorusGeo, holeMat.clone());
          hole.rotation.y = Math.PI / 2;
          hole.position.set(x, y, z);
          hole.name = `Cu Valence Hole (Site ${colIdx}-${rowIdx}-${depthIdx})`;
          model.add(hole);
          valenceHoles.push({ mesh: hole, site, pulse: Math.random() * Math.PI * 2 });
        });
      });
    });

    // 4. ELECTRIC FIELD VECTORS (E-Field: Anode → Cathode, +X direction)
    const eFieldArrows = [];
    const eArrowMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.85,
      roughness: 0.2
    });
    const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.2, 12);
    shaftGeo.rotateZ(-Math.PI / 2);
    const coneGeo = new THREE.ConeGeometry(0.07, 0.2, 16);
    coneGeo.rotateZ(-Math.PI / 2);

    const eFieldOffsets = [
      [-1.5, 0.6, 0.6], [0.5, 0.6, 0.6],
      [-1.5, -0.6, -0.6], [0.5, -0.6, -0.6],
      [-0.5, 0.6, -0.6], [-0.5, -0.6, 0.6]
    ];
    eFieldOffsets.forEach(([x, y, z]) => {
      const arrowGroup = new THREE.Group();
      const shaft = new THREE.Mesh(shaftGeo, eArrowMat);
      const cone = new THREE.Mesh(coneGeo, eArrowMat);
      cone.position.set(0.6, 0, 0);
      arrowGroup.add(shaft, cone);
      arrowGroup.position.set(x, y, z);
      model.add(arrowGroup);
      eFieldArrows.push(arrowGroup);
    });

    addLabel('Electric Field E (Anode → Cathode)', new THREE.Vector3(0, -1.25, 0), '#fbbf24', 2.8, 0.55);

    // 5. ANIMATED CONDUCTION ELECTRONS (Hopping between copper holes)
    const electronGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const electronMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00b4d8,
      emissiveIntensity: 1.0,
      roughness: 0.2
    });

    const hoppingElectrons = [];
    // Spawn 10 active electrons distributed across lattice sites
    for (let i = 0; i < 10; i++) {
      const elMesh = new THREE.Mesh(electronGeo, electronMat);
      model.add(elMesh);

      const rowIdx = i % 2;
      const depthIdx = Math.floor(i / 2) % 2;
      const startCol = i % 5;

      hoppingElectrons.push({
        mesh: elMesh,
        rowIdx,
        depthIdx,
        fromCol: startCol,
        toCol: (startCol + 1) % 5,
        progress: Math.random(),
        speed: 0.9 + Math.random() * 0.4
      });
    }

    addLabel('Electrons (e⁻) Hopping through Cu Holes', new THREE.Vector3(0, -1.85, 0), '#38bdf8', 3.0, 0.5);

    // 6. 3D RIGHT-HAND RULE MODEL & CONCENTRIC B-FIELD RINGS
    const rightHandGroup = new THREE.Group();
    rightHandGroup.position.set(0, 1.75, 0);

    const handMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.7,
      roughness: 0.28
    });
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.85,
      roughness: 0.2
    });

    // Forearm / Wrist
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.85, 16), handMat);
    forearm.rotation.x = Math.PI / 2;
    forearm.position.set(-0.2, 0, -0.6);
    rightHandGroup.add(forearm);

    // Palm base
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.5), handMat);
    palm.position.set(-0.1, 0, -0.15);
    rightHandGroup.add(palm);

    // Thumb pointing along +X (Conventional Current direction!)
    const thumbJoint = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), jointMat);
    thumbJoint.position.set(0.18, 0.12, -0.05);
    rightHandGroup.add(thumbJoint);

    const thumbPhalanx1 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.35, 16), handMat);
    thumbPhalanx1.rotation.z = -Math.PI / 2;
    thumbPhalanx1.position.set(0.35, 0.12, -0.05);
    rightHandGroup.add(thumbPhalanx1);

    const thumbTip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 16), jointMat);
    thumbTip.rotation.z = -Math.PI / 2;
    thumbTip.position.set(0.62, 0.12, -0.05);
    rightHandGroup.add(thumbTip);

    // Current vector arrow along thumb
    const currentArrowMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.95
    });
    const iShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 12), currentArrowMat);
    iShaft.rotation.z = -Math.PI / 2;
    iShaft.position.set(0.95, 0.12, -0.05);
    const iCone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 16), currentArrowMat);
    iCone.rotation.z = -Math.PI / 2;
    iCone.position.set(1.45, 0.12, -0.05);
    rightHandGroup.add(iShaft, iCone);

    // Curled 4 fingers (Index, Middle, Ring, Pinky) curling around the wire (counter-clockwise)
    const fingerOffsets = [-0.25, -0.12, 0.01, 0.14];
    fingerOffsets.forEach((fx) => {
      const fingerGroup = new THREE.Group();
      fingerGroup.position.set(fx, 0.08, 0.1);

      // Proximal (upward + forward)
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.28, 12), handMat);
      p1.rotation.x = -Math.PI / 4;
      p1.position.set(0, 0.1, 0.1);

      // Middle (curling down and around)
      const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.26, 12), handMat);
      p2.rotation.x = -Math.PI * 0.65;
      p2.position.set(0, 0.15, 0.28);

      // Distal (curled tuck back toward palm)
      const p3 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 12), jointMat);
      p3.rotation.x = -Math.PI * 1.05;
      p3.position.set(0, -0.02, 0.36);

      fingerGroup.add(p1, p2, p3);
      rightHandGroup.add(fingerGroup);
    });

    model.add(rightHandGroup);

    // Magnetic field concentric loops (B-Field encircling conductor)
    const bFieldRings = [];
    const bMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.9,
      roughness: 0.25
    });
    const bRingTorusGeo = new THREE.TorusGeometry(1.22, 0.032, 16, 64);
    bRingTorusGeo.rotateY(Math.PI / 2); // In YZ plane, encircling X-axis

    [-1.6, 0, 1.6].forEach((rx) => {
      const ringGroup = new THREE.Group();
      ringGroup.position.set(rx, 0, 0);

      const torus = new THREE.Mesh(bRingTorusGeo, bMat);
      ringGroup.add(torus);

      // 4 tangential directional cones showing right-hand curl direction
      for (let i = 0; i < 4; i++) {
        const theta = (i / 4) * Math.PI * 2;
        const bCone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 16), bMat);
        const y = Math.cos(theta) * 1.22;
        const z = Math.sin(theta) * 1.22;
        bCone.position.set(0, y, z);

        // Tangent vector: (-sin(theta), cos(theta))
        const tangent = new THREE.Vector3(0, -Math.sin(theta), Math.cos(theta)).normalize();
        bCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        ringGroup.add(bCone);
      }

      model.add(ringGroup);
      bFieldRings.push(ringGroup);
    });

    addLabel('Right-Hand Rule: Thumb = Current I, Fingers = B-Field', new THREE.Vector3(0, 3.2, 0), '#10b981', 3.4, 0.6);

    // Store animation data
    model.userData.rightHandRuleData = {
      elapsed: 0,
      xCols,
      yRows,
      zRows,
      eFieldArrows,
      bFieldRings,
      valenceHoles,
      hoppingElectrons,
      rightHandGroup
    };

    this.addObject(model);
    this.selectGeneratedObject(model);
    this.animatedAtoms.push(model);
    return model;
  }

  createWaterElectrolysisSimulation() {
    const origin = this.get3DCursorPosition();
    const simulation = this.createCompoundGroup('Water Electrolysis (2H2O → 2H2 + O2)', origin);
    const addLabel = (text, position, color = '#f2f5f9', width = 2.2) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = 'bold 54px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = color;
      context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 20);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false
      }));
      label.position.copy(position);
      label.scale.set(width, 0.55, 1);
      simulation.add(label);
      return label;
    };
    const beakerFill = new THREE.Mesh(
      new THREE.BoxGeometry(2.62, 1.52, 1.62),
      new THREE.MeshPhysicalMaterial({ color: 0x3286a8, transparent: true, opacity: 0.18, roughness: 0.18, depthWrite: false })
    );
    beakerFill.name = 'Water in beaker';
    beakerFill.position.set(0, -0.42, 0);
    simulation.add(beakerFill);

    const glassPoints = [
      [-1.35, -1.2, -0.85], [1.35, -1.2, -0.85], [1.35, -1.2, -0.85], [1.35, -1.2, 0.85],
      [1.35, -1.2, 0.85], [-1.35, -1.2, 0.85], [-1.35, -1.2, 0.85], [-1.35, -1.2, -0.85],
      [-1.35, -1.2, -0.85], [-1.35, 0.78, -0.85], [1.35, -1.2, -0.85], [1.35, 0.78, -0.85],
      [1.35, -1.2, 0.85], [1.35, 0.78, 0.85], [-1.35, -1.2, 0.85], [-1.35, 0.78, 0.85],
      [-1.35, -1.2, -0.85], [-1.35, -1.2, 0.85], [1.35, -1.2, -0.85], [1.35, -1.2, 0.85]
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const glass = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(glassPoints),
      new THREE.LineBasicMaterial({ color: 0x8bd7ef, transparent: true, opacity: 0.65 })
    );
    glass.name = 'Open glass beaker';
    simulation.add(glass);

    const electrodeMaterial = new THREE.MeshStandardMaterial({ color: 0x9ba8b9, metalness: 0.75, roughness: 0.26 });
    const electrodes = [-0.58, 0.58].map((x, index) => {
      const electrode = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.62, 0.12), electrodeMaterial);
      electrode.name = index === 0 ? 'Negative cathode' : 'Positive anode';
      electrode.position.set(x, -0.08, 0);
      simulation.add(electrode);
      return electrode;
    });

    const addWire = (points, color) => {
      const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      const wire = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.025, 8, false),
        new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.4 })
      );
      simulation.add(wire);
      return curve;
    };
    const negativeWire = addWire([[-0.58, 0.73, 0], [-0.58, 1.15, 0], [-0.27, 1.42, 0], [0, 1.42, 0]], 0x5797ff);
    const positiveWire = addWire([[0.58, 0.73, 0], [0.58, 1.15, 0], [0.27, 1.42, 0], [0, 1.42, 0]], 0xff786b);
    const supply = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.3, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x343d4c, metalness: 0.35, roughness: 0.5 })
    );
    supply.name = 'DC power supply';
    supply.position.set(0, 1.55, 0);
    simulation.add(supply);

    addLabel('− Cathode', new THREE.Vector3(-0.58, 0.95, 0), '#9fc5ff', 1.5);
    addLabel('+ Anode', new THREE.Vector3(0.58, 0.95, 0), '#ffb2a5', 1.4);
    addLabel('DC power', new THREE.Vector3(0, 1.82, 0), '#f2f5f9', 1.7);
    const equation = addLabel('2 H₂O → 2 H₂ + O₂', new THREE.Vector3(0, -1.6, 0), '#e6f5ff', 3.3);
    const reactants = [];
    const waterAtomGeometry = new THREE.SphereGeometry(1, 16, 12);
    const oxygenMaterial = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.4 });
    const hydrogenMaterial = new THREE.MeshStandardMaterial({ color: 0xf3f3f3, roughness: 0.35 });
    const reactantMaterials = {
      O: oxygenMaterial.clone(),
      H: hydrogenMaterial.clone()
    };
    Object.values(reactantMaterials).forEach((material) => {
      material.transparent = true;
      material.opacity = 1;
    });
    const makeWaterAtom = (element, position) => {
      const atom = new THREE.Mesh(waterAtomGeometry, reactantMaterials[element]);
      atom.position.copy(position);
      atom.scale.setScalar(element === 'O' ? 0.16 : 0.09);
      atom.userData.atomElement = element;
      simulation.add(atom);
      reactants.push(atom);
      return atom;
    };
    [-0.42, 0.42].forEach((z, index) => {
      const center = new THREE.Vector3(index === 0 ? -0.28 : 0.28, -0.56, z);
      makeWaterAtom('O', center);
      makeWaterAtom('H', center.clone().add(new THREE.Vector3(-0.2, -0.12, 0)));
      makeWaterAtom('H', center.clone().add(new THREE.Vector3(0.2, -0.12, 0)));
    });

    const gasMolecules = [];
    const makeGasBubble = (element, x, z, phase) => {
      const bubble = new THREE.Group();
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 18, 14),
        new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.26, roughness: 0.12, depthWrite: false })
      );
      bubble.add(shell);
      const gasMaterial = element === 'H' ? hydrogenMaterial : oxygenMaterial;
      [-1, 1].forEach((side) => {
        const atom = new THREE.Mesh(waterAtomGeometry, gasMaterial);
        atom.scale.setScalar(element === 'H' ? 0.075 : 0.095);
        atom.position.x = side * 0.07;
        bubble.add(atom);
      });
      bubble.position.set(x, -0.82, z);
      bubble.scale.setScalar(0.01);
      bubble.userData.risePhase = phase;
      simulation.add(bubble);
      gasMolecules.push({ bubble, x, z, phase });
    };
    makeGasBubble('H', -0.58, -0.22, 0);
    makeGasBubble('H', -0.58, 0.22, 0.5);
    makeGasBubble('O', 0.58, 0, 0.25);
    addLabel('H₂ bubbles: twice the amount of O₂', new THREE.Vector3(0, -1.95, 0), '#a8eaff', 3.8);

    const currentMaterial = new THREE.MeshBasicMaterial({ color: 0x77dfff });
    const currentParticles = Array.from({ length: 4 }, (_, index) => {
      const particle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), currentMaterial);
      simulation.add(particle);
      return particle;
    });
    const ionMaterials = [
      new THREE.MeshBasicMaterial({ color: 0x6caeff }),
      new THREE.MeshBasicMaterial({ color: 0xffa093 })
    ];
    const ions = Array.from({ length: 6 }, (_, index) => {
      const ion = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), ionMaterials[index % 2]);
      ion.userData.ionSide = index % 2 === 0 ? -1 : 1;
      ion.userData.ionPhase = index / 6;
      simulation.add(ion);
      return ion;
    });

    simulation.electrolysisAnimation = {
      elapsed: 0, duration: 6, reactants, gasMolecules, currentParticles, ions, equation, negativeWire, positiveWire
    };
    this.addObject(simulation);
    this.electrolysisAnimations.push(simulation);
    this.selectGeneratedObject(simulation);
    return simulation;
  }

  updateWaterElectrolysis(simulation, delta) {
    const animation = simulation.electrolysisAnimation;
    animation.elapsed = Math.min(animation.duration, animation.elapsed + delta);
    const progress = animation.elapsed / animation.duration;
    animation.currentParticles.forEach((particle, index) => {
      const wire = index % 2 === 0 ? animation.negativeWire : animation.positiveWire;
      const phase = (animation.elapsed * 0.32 + Math.floor(index / 2) * 0.5) % 1;
      particle.position.copy(wire.getPoint(phase));
      particle.visible = progress < 1;
    });
    animation.ions.forEach((ion) => {
      const phase = (animation.elapsed * 0.13 + ion.userData.ionPhase) % 1;
      ion.position.set(ion.userData.ionSide * (0.08 + phase * 0.42), -0.95 + ((phase * 1.6) % 1) * 1.1, Math.sin(phase * Math.PI * 2) * 0.55);
      ion.visible = progress < 0.98;
    });
    animation.reactants.forEach((atom) => {
      atom.material.opacity = 1 - progress;
      atom.visible = progress < 1;
    });
    animation.gasMolecules.forEach(({ bubble, x, z, phase }) => {
      const gasProgress = Math.max(0, Math.min(1, (progress - phase * 0.12) / 0.88));
      bubble.position.set(x, -0.82 + gasProgress * 1.35, z);
      bubble.scale.setScalar(0.12 + gasProgress * 0.88);
      bubble.visible = gasProgress > 0.02;
    });
  }

  createMolecule(type, options = {}) {
    const requestedType = String(type).toLowerCase();
    type = Object.keys(MOLECULE_MODELS).find((key) => key.toLowerCase() === requestedType) || requestedType;
    if (options.subatomic) return this.createTemplateMolecule(type, true, options);
    if (type !== 'water') return this.createTemplateMolecule(type);

    const origin = this.get3DCursorPosition();
    const compound = this.createCompoundGroup('Water (H2O)', origin);
    const bondLength = 1.15;
    const halfAngle = THREE.MathUtils.degToRad(104.5 / 2);
    const oxygen = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 28, 20),
      new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.35 })
    );
    oxygen.name = 'Oxygen (Water)';
    oxygen.position.set(0, 0, 0);
    oxygen.castShadow = true;
    oxygen.receiveShadow = true;
    oxygen.userData.molecule = 'H2O';
    compound.add(oxygen);

    const hydrogens = [-1, 1].map((side, index) => {
      const direction = new THREE.Vector3(
        Math.sin(halfAngle) * side,
        Math.cos(halfAngle),
        0
      );
      const position = direction.clone().multiplyScalar(bondLength);
      const hydrogen = new THREE.Mesh(
        new THREE.SphereGeometry(0.27, 24, 16),
        new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35 })
      );
      hydrogen.name = `Hydrogen ${index + 1} (Water)`;
      hydrogen.position.copy(position);
      hydrogen.castShadow = true;
      hydrogen.receiveShadow = true;
      hydrogen.userData.molecule = 'H2O';
      compound.add(hydrogen);

      const bond = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, bondLength, 12),
        new THREE.MeshStandardMaterial({ color: 0xb8c5d6, roughness: 0.45 })
      );
      bond.name = `O-H Bond ${index + 1} (Water)`;
      bond.position.copy(position).multiplyScalar(0.5);
      bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      bond.castShadow = true;
      bond.userData.molecule = 'H2O';
      compound.add(bond);
      return hydrogen;
    });

    this.addObject(compound);
    this.selectGeneratedObject(compound);
    return { group: compound, oxygen, hydrogens };
  }

  createTemplateMolecule(type, subatomicRepresentation = false, options = {}) {
    const model = type === 'graphene' ? createGrapheneModel() : MOLECULE_MODELS[type];
    if (!model) return null;
    const bondScale = subatomicRepresentation ? COMPOUND_BOND_SCALE : 1;

    const origin = this.get3DCursorPosition();
    const compound = this.createCompoundGroup(
      options.bondingAnimation && type === 'water'
        ? 'Water Bonding Simulation'
        : options.unbonded && type === 'water' ? 'Unbonded Water Atoms (O + 2H)' : model.name,
      origin
    );
    compound.userData.orbitalDynamics = Boolean(options.orbitalDynamics && type === 'water' && subatomicRepresentation);
    const atoms = model.atoms.map(([element, x, y, z]) => ({
      element,
      position: new THREE.Vector3(x, y, z).multiplyScalar(bondScale),
      neighbors: [],
      hydrogenCount: 0
    }));
    const bonds = model.bonds.map(([first, second, order]) => {
      atoms[first].neighbors.push({ index: second, order });
      atoms[second].neighbors.push({ index: first, order });
      return { first, second, order };
    });

    const valence = { C: 4, N: 3, O: 2 };
    const hydrogenOffsets = [];
    atoms.forEach((atom, atomIndex) => {
      if (type === 'graphene') {
        atom.hydrogenCount = 0;
        return;
      }
      const usedValence = atom.neighbors.reduce((sum, neighbor) => sum + neighbor.order, 0);
      atom.hydrogenCount = Math.max(0, (valence[atom.element] || 0) - usedValence);
      if (type === 'water') {
        atom.hydrogenCount = 0;
        const halfAngle = THREE.MathUtils.degToRad(104.5 / 2);
        [-1, 1].forEach((side) => {
          hydrogenOffsets.push({
            parentIndex: atomIndex,
            position: atom.position.clone().add(new THREE.Vector3(
              Math.sin(halfAngle) * side * (options.unbonded ? 2.4 : 1.15 * bondScale),
              Math.cos(halfAngle) * (options.unbonded ? 2.4 : 1.15 * bondScale),
              0
            ))
          });
        });
        return;
      }
      const occupiedDirections = atom.neighbors.map(({ index }) =>
        atoms[index].position.clone().sub(atom.position).normalize()
      );

      for (let hydrogen = 0; hydrogen < atom.hydrogenCount; hydrogen++) {
        let bestDirection = null;
        let bestSeparation = -Infinity;
        for (let candidateIndex = 0; candidateIndex < 64; candidateIndex++) {
          const y = 1 - 2 * ((candidateIndex + 0.5) / 64);
          const angle = candidateIndex * Math.PI * (3 - Math.sqrt(5));
          const candidate = new THREE.Vector3(
            Math.cos(angle) * Math.sqrt(1 - y * y), y,
            Math.sin(angle) * Math.sqrt(1 - y * y)
          );
          const closestAngle = occupiedDirections.length
            ? Math.min(...occupiedDirections.map((direction) => candidate.angleTo(direction)))
            : Math.PI;
          if (closestAngle > bestSeparation) {
            bestSeparation = closestAngle;
            bestDirection = candidate;
          }
        }

        occupiedDirections.push(bestDirection);
        const bondLength = (atom.element === 'O' ? 0.62 : 0.72) * bondScale;
        hydrogenOffsets.push({
          parentIndex: atomIndex,
          position: atom.position.clone().addScaledVector(bestDirection, bondLength)
        });
      }
    });

    const counts = {};
    const atomMeshes = [];
    const atomColors = { C: 0x353b45, H: 0xf3f3f3, O: 0xe53935, N: 0x3977df };
    const atomRadii = { C: 0.34, H: 0.18, O: 0.31, N: 0.32 };
    const atomicScale = 0.16;
    const bondElectronContributions = Array(atoms.length + hydrogenOffsets.length).fill(0);
    bonds.forEach(({ first, second, order }) => {
      bondElectronContributions[first] += order;
      bondElectronContributions[second] += order;
    });
    if (!options.unbonded) {
      hydrogenOffsets.forEach(({ parentIndex }, index) => {
        bondElectronContributions[parentIndex] += 1;
        bondElectronContributions[atoms.length + index] = 1;
      });
    }
    const atomicSphereGeometry = subatomicRepresentation ? new THREE.SphereGeometry(1, 12, 8) : null;
    const atomicMaterials = subatomicRepresentation ? {
      proton: new THREE.MeshStandardMaterial({ color: 0xef5350, roughness: 0.4 }),
      neutron: new THREE.MeshStandardMaterial({ color: 0x42a5f5, roughness: 0.4 }),
      electron: new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0x8a5b00, emissiveIntensity: 0.3, roughness: 0.3 })
    } : null;

    const addSubatomicAtom = (element, atomNumber, position, atomIndex) => {
      const atomicNumber = { H: 1, C: 6, N: 7, O: 8 }[element];
      const isotopeMass = { H: 1, C: 12, N: 14, O: 16 }[element];
      const neutronCount = isotopeMass - atomicNumber;
      const nucleonCount = atomicNumber + neutronCount;
      const nucleusRadius = nucleonCount > 1
        ? Math.max(0.55, 0.16 * Math.sqrt(nucleonCount))
        : 0;
      const nucleusOuterRadius = nucleusRadius + 0.22;
      const atomGroup = new THREE.Group();
      atomGroup.name = `${model.name} ${element} Atom ${atomNumber}`;
      atomGroup.position.copy(position);
      atomGroup.userData.atomicNumber = atomicNumber;
      atomGroup.userData.molecule = model.formula;
      atomGroup.userData.electronRange = nucleusOuterRadius * atomicScale * 10;

      for (let i = 0; i < nucleonCount; i++) {
        const isProton = i < atomicNumber;
        const y = 1 - (i / Math.max(nucleonCount - 1, 1)) * 2;
        const ring = Math.sqrt(Math.max(0, 1 - y * y));
        const angle = i * Math.PI * (3 - Math.sqrt(5));
        const particle = new THREE.Mesh(atomicSphereGeometry, atomicMaterials[isProton ? 'proton' : 'neutron']);
        particle.name = `${element} ${isProton ? 'Proton' : 'Neutron'} ${isProton ? i + 1 : i - atomicNumber + 1}`;
        particle.position.set(
          Math.cos(angle) * ring * nucleusRadius * atomicScale,
          y * nucleusRadius * atomicScale,
          Math.sin(angle) * ring * nucleusRadius * atomicScale
        );
        particle.scale.setScalar(0.22 * atomicScale);
        particle.castShadow = true;
        particle.userData.atomParticle = isProton ? 'proton' : 'neutron';
        particle.userData.charge = isProton ? 1 : 0;
        atomGroup.add(particle);

      }

      const localElectronCount = Math.max(0, atomicNumber - bondElectronContributions[atomIndex]);
      const electronSlots = getElectronOrbitalSlots(localElectronCount, atomicNumber, nucleusOuterRadius);
      electronSlots.forEach((slot, index) => {
        const particle = new THREE.Mesh(atomicSphereGeometry, atomicMaterials.electron);
        particle.name = `${element} Electron ${index + 1}`;
        particle.position.copy(slot).multiplyScalar(atomicScale);
        particle.scale.setScalar(0.13 * atomicScale);
        particle.castShadow = true;
        particle.userData.atomParticle = 'electron';
        particle.userData.charge = -1;
        if (options?.orbitalDynamics) {
          particle.userData.orbitalNucleusId = atomGroup.uuid;
          const tangent = new THREE.Vector3().crossVectors(slot.clone().normalize(), new THREE.Vector3(0, 0, 1));
          if (tangent.lengthSq() < 1e-8) tangent.set(0, 1, 0);
          particle.userData.velocity = tangent.normalize().multiplyScalar(2.2 + index * 0.08).toArray();
          particle.userData.coulombDynamic = true;
        }
        atomGroup.add(particle);
      });

      compound.add(atomGroup);
      atomMeshes.push(atomGroup);
    };

    const addAtom = (element, position, atomIndex) => {
      counts[element] = (counts[element] || 0) + 1;
      if (subatomicRepresentation) {
        addSubatomicAtom(element, counts[element], position, atomIndex);
        return;
      }
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(atomRadii[element], 20, 14),
        new THREE.MeshStandardMaterial({ color: atomColors[element], roughness: 0.38 })
      );
      mesh.name = `${model.name} ${element} ${counts[element]}`;
      mesh.position.copy(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.molecule = model.formula;
      mesh.userData.atomElement = element;
      compound.add(mesh);
      atomMeshes.push(mesh);
      return mesh;
    };

    atoms.forEach((atom, index) => addAtom(atom.element, atom.position, index));
    const heavyAtomCount = atomMeshes.length;
    hydrogenOffsets.forEach(({ position }, index) => addAtom('H', position, atoms.length + index));
    const addSharedBondElectrons = (firstPosition, secondPosition, order) => {
      if (!subatomicRepresentation) return;
      const axis = secondPosition.clone().sub(firstPosition).normalize();
      const perpendicular = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1));
      if (perpendicular.lengthSq() < 1e-6) perpendicular.set(0, 1, 0);
      perpendicular.normalize();
      const side = new THREE.Vector3().crossVectors(axis, perpendicular).normalize();
      const pairOffsets = order === 1
        ? [0]
        : Array.from({ length: order }, (_, pair) => (pair - (order - 1) / 2) * 0.1 * bondScale);
      const center = firstPosition.clone().add(secondPosition).multiplyScalar(0.5);
      pairOffsets.forEach((offset) => {
        const pairCenter = center.clone().addScaledVector(perpendicular, offset);
        [-1, 1].forEach((sign) => {
          const electron = new THREE.Mesh(atomicSphereGeometry, atomicMaterials.electron);
          electron.name = `${model.name} Shared Bond Electron`;
          // Offset the pair from the connector so the yellow electron balls stay visible.
          electron.position.copy(pairCenter).addScaledVector(side, sign * 0.1 * bondScale);
          electron.scale.setScalar(0.13 * atomicScale);
          electron.userData.atomParticle = 'bonding-electron';
          electron.userData.charge = -1;
          electron.userData.molecule = model.formula;
          if (options?.orbitalDynamics) {
            electron.userData.velocity = side.clone().multiplyScalar(sign * 2.1).toArray();
            electron.userData.coulombDynamic = true;
          }
          compound.add(electron);
        });
      });
    };

    const addBond = (firstPosition, secondPosition, bondIndex, order = 1) => {
      if ((options?.orbitalDynamics || options?.unbonded) && model.formula === 'H2O') return;
      const direction = secondPosition.clone().sub(firstPosition);
      const length = direction.length();
      direction.normalize();
      const perpendicular = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 0, 1));
      if (perpendicular.lengthSq() < 1e-6) perpendicular.set(0, 1, 0);
      perpendicular.normalize();
      const offsets = order === 2 ? [-0.07, 0.07] : [0];
      offsets.forEach((offset, offsetIndex) => {
        const bond = new THREE.Mesh(
          new THREE.CylinderGeometry(0.011, 0.011, length, 10),
          new THREE.MeshStandardMaterial({ color: 0xb8c5d6, roughness: 0.45 })
        );
        bond.name = `${model.name} Bond ${bondIndex}${order === 2 ? `.${offsetIndex + 1}` : ''}`;
        bond.position.copy(firstPosition).add(secondPosition).multiplyScalar(0.5)
          .addScaledVector(perpendicular, offset);
        bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        bond.castShadow = true;
        bond.userData.molecule = model.formula;
        compound.add(bond);
      });
    };

    let bondNumber = 1;
    bonds.forEach(({ first, second, order }) => {
      addBond(atoms[first].position, atoms[second].position, bondNumber++, order);
      addSharedBondElectrons(atoms[first].position, atoms[second].position, order);
    });
    hydrogenOffsets.forEach(({ parentIndex, position }) => {
      addBond(atoms[parentIndex].position, position, bondNumber++);
      if (!options.unbonded) addSharedBondElectrons(atoms[parentIndex].position, position, 1);
    });

    if (compound.userData.orbitalDynamics && options.bondingAnimation && type === 'water') {
      const halfAngle = THREE.MathUtils.degToRad(104.5 / 2);
      const hydrogens = atomMeshes.slice(heavyAtomCount).map((hydrogen, index) => {
        const side = index === 0 ? -1 : 1;
        const start = hydrogen.position.clone();
        const target = new THREE.Vector3(
          Math.sin(halfAngle) * side * 1.15 * bondScale,
          Math.cos(halfAngle) * 1.15 * bondScale,
          0
        );
        return { hydrogen, start, target };
      });
      compound.waterBondAnimation = { elapsed: 0, duration: 4, hydrogens };
    }

    this.addObject(compound);
    this.selectGeneratedObject(compound);
    if (compound.userData.orbitalDynamics) this.animatedAtoms.push(compound);
    return { group: compound, formula: model.formula, atoms: atomMeshes, heavyAtomCount };
  }

  createCompoundGroup(name, origin) {
    const group = new THREE.Group();
    group.name = name;
    group.position.copy(origin);
    group.userData.generatedCompound = true;
    return group;
  }

  createElectricFieldAtom(protons, massNumber, elementName) {
    protons = Math.max(1, Math.floor(Number(protons) || 1));
    massNumber = Math.max(protons, Math.floor(Number(massNumber) || protons));
    const neutrons = massNumber - protons;
    const origin = this.get3DCursorPosition();
    const atom = this.createCompoundGroup(`${elementName} Electric Field Atom`, origin);
    atom.userData.electronOrbitModel = true;

    const nucleonCount = protons + neutrons;
    const nucleonRadius = 0.12;
    const nucleusRadius = nucleonCount > 1 ? 0.16 * Math.sqrt(nucleonCount) : 0;
    const nucleusOuterRadius = nucleusRadius + nucleonRadius;
    const particleGeometry = new THREE.SphereGeometry(1, 14, 10);
    const protonMaterial = new THREE.MeshStandardMaterial({ color: 0xef5350, roughness: 0.4 });
    const neutronMaterial = new THREE.MeshStandardMaterial({ color: 0x42a5f5, roughness: 0.4 });
    const electronMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd54f, emissive: 0x8a5b00, emissiveIntensity: 0.45, roughness: 0.25
    });
    const electronHoleMaterial = new THREE.MeshStandardMaterial({
      color: 0x42a5f5, emissive: 0x0b3d91, emissiveIntensity: 0.5, roughness: 0.25
    });

    for (let i = 0; i < nucleonCount; i++) {
      const isProton = i < protons;
      const y = 1 - (i / Math.max(nucleonCount - 1, 1)) * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      const particle = new THREE.Mesh(particleGeometry, isProton ? protonMaterial : neutronMaterial);
      particle.name = `${elementName} ${isProton ? 'Proton' : 'Neutron'} ${isProton ? i + 1 : i - protons + 1}`;
      particle.position.set(
        Math.cos(angle) * ring * nucleusRadius,
        y * nucleusRadius,
        Math.sin(angle) * ring * nucleusRadius
      );
      particle.scale.setScalar(nucleonRadius);
      particle.castShadow = true;
      particle.userData.atomParticle = isProton ? 'proton' : 'neutron';
      particle.userData.charge = isProton ? 1 : 0;
      particle.userData.velocity = [0, 0, 0];
      atom.add(particle);
    }

    const configuration = new Map();
    let remainingElectrons = protons;
    for (const [shell, subshell, capacity] of ORBITAL_FILL_ORDER) {
      if (remainingElectrons <= 0) break;
      const count = Math.min(capacity, remainingElectrons);
      configuration.set(`${shell}${subshell}`, count);
      remainingElectrons -= count;
    }
    for (const [subshell, count] of Object.entries({
      24: { '3d': 5, '4s': 1 },
      29: { '3d': 10, '4s': 1 },
      41: { '4d': 4, '5s': 1 },
      42: { '4d': 5, '5s': 1 },
      44: { '4d': 7, '5s': 1 },
      45: { '4d': 8, '5s': 1 },
      46: { '4d': 10, '5s': 0 },
      47: { '4d': 10, '5s': 1 },
      79: { '5d': 10, '6s': 1 },
      57: { '4f': 0, '5d': 1, '6s': 2 },
      58: { '4f': 1, '5d': 1, '6s': 2 }
    }[protons] || {})) configuration.set(subshell, count);

    const subshellOrder = [...configuration.keys()];
    if (protons === 29) {
      subshellOrder.splice(subshellOrder.indexOf('4s'), 1);
      subshellOrder.push('4s');
    } else if (protons === 79) {
      subshellOrder.splice(subshellOrder.indexOf('6s'), 1);
      subshellOrder.push('6s');
    }
    subshellOrder.forEach((subshell, orbitIndex) => {
      const shellCount = configuration.get(subshell);
      if (!shellCount) return;
      const subshellCapacity = ORBITAL_FILL_ORDER.find(([shell, type]) => `${shell}${type}` === subshell)?.[2] || 2;
      const principalShell = Number.parseInt(subshell, 10);
      const subshellType = subshell.slice(-1);
      let shielding = 0;
      for (const [otherSubshell, otherCount] of configuration) {
        const otherShell = Number.parseInt(otherSubshell, 10);
        if (otherSubshell === subshell) {
          shielding += Math.max(0, otherCount - 1) * 0.35;
        } else if (otherShell === principalShell) {
          shielding += otherCount * 0.35;
        } else if (otherShell === principalShell - 1) {
          shielding += otherCount * (subshellType === 's' || subshellType === 'p' ? 0.85 : 1);
        } else if (otherShell < principalShell - 1) {
          shielding += otherCount;
        }
      }
      const effectiveNuclearCharge = Math.max(1, protons - shielding);
      const radius = nucleusOuterRadius + 0.9 + orbitIndex * 0.62;
      const planes = new Set();
      for (let i = 0; i < subshellCapacity; i++) {
        const isHole = i >= shellCount;
        const plane = i % 3;
        planes.add(plane);
        const phase = (i / subshellCapacity) * Math.PI * 2 + plane * 0.37;
        const electron = new THREE.Mesh(particleGeometry, isHole ? electronHoleMaterial : electronMaterial);
        electron.name = isHole
          ? `${elementName} ${subshell} Empty Orbital ${i - shellCount + 1}`
          : `${elementName} ${subshell} Electron ${i + 1}`;
        electron.scale.setScalar(0.085);
        electron.castShadow = true;
        electron.userData.atomParticle = isHole ? 'electron-hole' : 'electron';
        if (!isHole) electron.userData.charge = -1;
        electron.userData.orbit = {
          radius,
          phase,
          plane,
          subshell,
          isHole,
          effectiveNuclearCharge,
          speed: Math.sqrt(ELECTROSTATIC_K * effectiveNuclearCharge / radius)
        };
        atom.add(electron);
        this.updateElectronPosition(electron, electron.userData.orbit);
      }

      for (const plane of planes) {
        const points = [];
        for (let step = 0; step < 96; step++) {
          const angle = (step / 96) * Math.PI * 2;
          if (plane === 0) points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
          else if (plane === 1) points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
          else points.push(new THREE.Vector3(0, Math.cos(angle) * radius, Math.sin(angle) * radius));
        }
        const orbitLine = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: 0xa9882d, transparent: true, opacity: 0.35 })
        );
        orbitLine.name = `${elementName} ${subshell} Orbit Guide`;
        atom.add(orbitLine);
      }
    });

    this.addObject(atom);
    this.animatedAtoms.push(atom);
    this.selectGeneratedObject(atom);
    return atom;
  }

  updateElectronPosition(electron, orbit) {
    const x = Math.cos(orbit.phase) * orbit.radius;
    const y = Math.sin(orbit.phase) * orbit.radius;
    if (orbit.plane === 0) electron.position.set(x, y, 0);
    else if (orbit.plane === 1) electron.position.set(x, 0, y);
    else electron.position.set(0, x, y);
  }

  getOrbitTangent(orbit) {
    const x = Math.cos(orbit.phase);
    const y = Math.sin(orbit.phase);
    if (orbit.plane === 0) return new THREE.Vector3(-y, x, 0);
    if (orbit.plane === 1) return new THREE.Vector3(-y, 0, x);
    return new THREE.Vector3(0, -y, x);
  }

  calculateElectricForce(source, target) {
    const sourceCharge = source.userData.charge || 0;
    const targetCharge = target.userData.charge || 0;
    if (!sourceCharge || !targetCharge || source === target) return new THREE.Vector3();

    // Coulomb force in normalized scene units, with softening to avoid singularities.
    const displacement = target.position.clone().sub(source.position);
    const distanceSquared = displacement.lengthSq() + ELECTROSTATIC_SOFTENING_SQ;
    const strength = ELECTROSTATIC_K * sourceCharge * targetCharge /
      (distanceSquared * Math.sqrt(distanceSquared));
    return displacement.multiplyScalar(strength);
  }

  calculateNetElectronForce(atom, electron) {
    const force = new THREE.Vector3();
    for (const source of atom.children) {
      if (source.userData.charge && source !== electron) {
        force.add(this.calculateElectricForce(source, electron));
      }
    }
    return force;
  }

  updateGlobalElectronField(atoms, delta) {
    const charges = [];
    const electrons = [];
    atoms.forEach((atom) => {
      atom.updateMatrixWorld(true);
      atom.children.forEach((particle) => {
        if (!particle.userData.charge) return;
        const entry = { atom, particle, position: particle.getWorldPosition(new THREE.Vector3()) };
        charges.push(entry);
        if (particle.userData.charge === -1 && particle.userData.orbit) electrons.push(entry);
      });
    });

    electrons.forEach(({ atom, particle, position }) => {
      const force = new THREE.Vector3();
      charges.forEach((source) => {
        if (source.particle === particle) return;
        const displacement = position.clone().sub(source.position);
        const distanceSquared = displacement.lengthSq() + ELECTROSTATIC_SOFTENING_SQ;
        force.add(displacement.multiplyScalar(
          ELECTROSTATIC_K * source.particle.userData.charge * particle.userData.charge /
          (distanceSquared * Math.sqrt(distanceSquared))
        ));
      });

      const orbit = particle.userData.orbit;
      const center = atom.getWorldPosition(new THREE.Vector3());
      const tangent = atom.localToWorld(this.getOrbitTangent(orbit)).sub(center).normalize();
      const tangentialAcceleration = force.dot(tangent);
      const baseSpeed = orbit.baseSpeed || orbit.speed;
      orbit.baseSpeed = baseSpeed;
      orbit.speed = THREE.MathUtils.clamp(
        orbit.speed + tangentialAcceleration * delta * 0.12,
        baseSpeed * 0.65,
        baseSpeed * 1.35
      );
      orbit.phase = (orbit.phase + (orbit.speed / orbit.radius) * delta) % (Math.PI * 2);
      this.updateElectronPosition(particle, orbit);
    });
  }

  calculateNuclearForce(source, target) {
    const displacement = target.position.clone().sub(source.position);
    const distance = displacement.length();
    if (distance < 1e-6) return new THREE.Vector3();

    // A short-range spring approximates nuclear attraction and resists overlap.
    return displacement.multiplyScalar(-NUCLEAR_SPRING_K * (distance - NUCLEON_REST_DISTANCE) / distance);
  }

  updateSolarCellAnimation(cell, delta) {
    const animation = cell.userData.solarCellAnimation;
    animation.elapsed += delta;
    animation.pairs.forEach(({ electron, hole, photon, phase, y }) => {
      const progress = (animation.elapsed / 2.6 + phase) % 1;
      const lightProgress = Math.min(1, progress / 0.48);
      photon.visible = progress < 0.48;
      photon.position.set(0, y, 1.22 - lightProgress * 1.02);

      const separation = Math.max(0, Math.min(1, (progress - 0.34) / 0.5));
      const active = progress >= 0.34 && progress < 0.92;
      electron.visible = active;
      hole.visible = active;
      electron.position.set(-0.08 - separation * 0.79, y, 0.15);
      hole.position.set(0.08 + separation * 0.79, y, 0.15);
      const pulse = 0.8 + 0.2 * Math.sin(animation.elapsed * 8 + phase * Math.PI * 2);
      electron.scale.setScalar(pulse);
      hole.scale.setScalar(pulse);
    });
  }

  updateRightHandRuleSimulation(model, delta) {
    const data = model.userData?.rightHandRuleData;
    if (!data) return;

    data.elapsed = (data.elapsed || 0) + delta;
    const elapsed = data.elapsed;

    // 1. Rotate Concentric B-Field Rings in the direction of the curled right-hand fingers
    if (data.bFieldRings) {
      data.bFieldRings.forEach((ringGroup) => {
        ringGroup.rotation.x = (ringGroup.rotation.x + delta * 1.6) % (Math.PI * 2);
      });
    }

    // 2. Pulse and animate Electric Field Vectors (E pointing Anode -> Cathode, +X)
    if (data.eFieldArrows) {
      data.eFieldArrows.forEach((arrowGroup, idx) => {
        const pulse = 0.75 + 0.35 * Math.sin(elapsed * 5.0 + idx * 0.8);
        arrowGroup.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.emissiveIntensity = pulse;
          }
        });
      });
    }

    // 3. Subtle floating breathing hover for 3D Right Hand model
    if (data.rightHandGroup) {
      data.rightHandGroup.position.y = 1.75 + Math.sin(elapsed * 2.2) * 0.04;
    }

    // 4. Animate Conduction Electrons hopping through copper valence holes
    if (data.hoppingElectrons && data.xCols && data.yRows && data.zRows) {
      const { xCols, yRows, zRows } = data;
      data.hoppingElectrons.forEach((electron) => {
        electron.progress += delta * electron.speed;
        if (electron.progress >= 1.0) {
          electron.progress = 0.0;
          electron.fromCol = electron.toCol;
          electron.toCol = (electron.toCol + 1) % xCols.length;
          if (data.valenceHoles) {
            const destHole = data.valenceHoles.find(
              (h) => h.site.colIdx === electron.fromCol && h.site.rowIdx === electron.rowIdx && h.site.depthIdx === electron.depthIdx
            );
            if (destHole) {
              destHole.pulse = Math.PI * 0.5;
            }
          }
        }

        const x1 = xCols[electron.fromCol];
        const x2 = electron.toCol === 0 ? xCols[0] : xCols[electron.toCol];
        let currentX;
        if (electron.toCol === 0 && electron.fromCol === xCols.length - 1) {
          const exitX = 3.0;
          const enterX = -3.0;
          if (electron.progress < 0.4) {
            currentX = THREE.MathUtils.lerp(x1, exitX, electron.progress / 0.4);
            electron.mesh.visible = true;
          } else if (electron.progress < 0.6) {
            electron.mesh.visible = false;
            currentX = enterX;
          } else {
            electron.mesh.visible = true;
            currentX = THREE.MathUtils.lerp(enterX, xCols[0], (electron.progress - 0.6) / 0.4);
          }
        } else {
          electron.mesh.visible = true;
          currentX = THREE.MathUtils.lerp(x1, x2, electron.progress);
        }

        const baseY = yRows[electron.rowIdx];
        const baseZ = zRows[electron.depthIdx];
        const arcY = Math.sin(electron.progress * Math.PI) * 0.22;
        const wiggleZ = Math.sin(electron.progress * Math.PI * 2) * 0.04;

        electron.mesh.position.set(currentX, baseY + arcY, baseZ + wiggleZ);

        const glow = 0.8 + 0.3 * Math.sin(elapsed * 8.0 + electron.progress * Math.PI);
        if (electron.mesh.material) {
          electron.mesh.material.emissiveIntensity = glow;
        }
      });
    }

    // 5. Pulse Copper Valence Holes (vacancy rings)
    if (data.valenceHoles) {
      data.valenceHoles.forEach((hole) => {
        hole.pulse = (hole.pulse + delta * 2.5) % (Math.PI * 2);
        const scale = 1.0 + 0.14 * Math.sin(hole.pulse);
        hole.mesh.scale.set(scale, scale, scale);
        if (hole.mesh.material) {
          hole.mesh.material.opacity = 0.55 + 0.35 * Math.sin(hole.pulse);
        }
      });
    }
  }

  updateAnimations(deltaSeconds) {
    const delta = Math.min(Math.max(deltaSeconds || 0, 0), 0.05);
    const electronFieldAtoms = this.animatedAtoms.filter((atom) => atom.userData.electronOrbitModel);
    const globalElectronFieldActive = electronFieldAtoms.some((atom) => atom.userData.materialBehavior === 'conductive');
    if (globalElectronFieldActive) this.updateGlobalElectronField(electronFieldAtoms, delta);
    for (const atom of this.animatedAtoms) {
      if (atom.userData.rightHandRuleSimulation) {
        this.updateRightHandRuleSimulation(atom, delta);
        continue;
      }
      if (atom.userData.solarCellAnimation) {
        this.updateSolarCellAnimation(atom, delta);
        continue;
      }
      if (globalElectronFieldActive && atom.userData.electronOrbitModel) continue;
      if (atom.userData.orbitalDynamics) {
        this.updateWaterBondingAction(atom, delta);
        this.updateWaterOrbitalDynamics(atom, delta);
        continue;
      }
      const nucleons = atom.children.filter((child) =>
        child.userData.atomParticle === 'proton' || child.userData.atomParticle === 'neutron'
      );
      const nucleonForces = nucleons.map(() => new THREE.Vector3());
      for (let i = 0; i < nucleons.length; i++) {
        for (let j = i + 1; j < nucleons.length; j++) {
          const force = this.calculateNuclearForce(nucleons[i], nucleons[j]);
          nucleonForces[i].sub(force);
          nucleonForces[j].add(force);
        }
      }
      nucleons.forEach((nucleon, index) => {
        const velocity = new THREE.Vector3().fromArray(nucleon.userData.velocity || [0, 0, 0]);
        velocity.addScaledVector(nucleonForces[index], delta).multiplyScalar(Math.exp(-NUCLEON_DAMPING * delta));
        nucleon.position.addScaledVector(velocity, delta);
        nucleon.userData.velocity = velocity.toArray();
      });

      const electrons = atom.children.filter((child) => child.userData.charge === -1 || child.userData.atomParticle === 'electron-hole');
      const coulombElectrons = electrons.filter((electron) => electron.userData.coulombDynamic);
      if (coulombElectrons.length) {
        // Water orbital mode integrates electron-electron repulsion and attraction to
        // the protons in this atom using a softened Coulomb force.
        coulombElectrons.forEach((electron) => {
          const force = this.calculateNetElectronForce(atom, electron);
          const velocity = new THREE.Vector3().fromArray(electron.userData.velocity || [0, 0, 0]);
          velocity.addScaledVector(force, delta).multiplyScalar(Math.exp(-0.12 * delta));
          electron.position.addScaledVector(velocity, delta);
          electron.userData.velocity = velocity.toArray();
        });
        continue;
      }
      const orbitingElectrons = electrons.filter((electron) => electron.userData.orbit);
      if (orbitingElectrons.length) {
        orbitingElectrons.forEach((electron) => {
          const orbit = electron.userData.orbit;
          orbit.phase = (orbit.phase + (orbit.speed / orbit.radius) * delta) % (Math.PI * 2);
          this.updateElectronPosition(electron, orbit);
        });
        continue;
      }
      const currentForces = electrons.map((electron) => this.calculateNetElectronForce(atom, electron));

      electrons.forEach((electron, index) => {
        const velocity = new THREE.Vector3().fromArray(electron.userData.velocity || [0, 0, 0]);
        electron.position.addScaledVector(velocity, delta)
          .addScaledVector(currentForces[index], 0.5 * delta * delta);
      });

      const nextForces = electrons.map((electron) => this.calculateNetElectronForce(atom, electron));
      electrons.forEach((electron, index) => {
        const velocity = new THREE.Vector3().fromArray(electron.userData.velocity || [0, 0, 0]);
        velocity.addScaledVector(currentForces[index].add(nextForces[index]), 0.5 * delta);

        const orbit = electron.userData.orbit;
        if (orbit && electron.position.lengthSq() > 1e-8) {
          // Keep the educational shell stable, while Coulomb attraction sets its orbital speed.
          const radial = electron.position.clone().normalize();
          electron.position.copy(radial).multiplyScalar(orbit.radius);

          const protonForce = new THREE.Vector3();
          for (const source of atom.children) {
            if (source.userData.charge === 1) {
              protonForce.add(this.calculateElectricForce(source, electron));
            }
          }
          const inwardAcceleration = Math.max(0, -protonForce.dot(radial));
          const orbitalSpeed = Math.sqrt(Math.max(inwardAcceleration * orbit.radius, 1e-6));
          const tangentVelocity = velocity.addScaledVector(radial, -velocity.dot(radial));
          if (tangentVelocity.lengthSq() < 1e-8) tangentVelocity.copy(this.getOrbitTangent(orbit));
          velocity.copy(tangentVelocity.normalize().multiplyScalar(orbitalSpeed));
        }
        electron.userData.velocity = velocity.toArray();
      });
    }
    this.electrolysisAnimations.forEach((simulation) => this.updateWaterElectrolysis(simulation, delta));
    this.updateCircuitFlow(delta);
  }

  updateWaterOrbitalDynamics(compound, delta) {
    compound.updateMatrixWorld(true);
    const nuclei = [];
    const nucleiById = new Map();
    compound.traverse((atom) => {
      if (!atom.userData?.atomicNumber) return;
      const nucleus = { atom, center: atom.getWorldPosition(new THREE.Vector3()) };
      nuclei.push(nucleus);
      nucleiById.set(atom.uuid, nucleus);
      const nucleons = atom.children.filter((child) =>
        child.userData.atomParticle === 'proton' || child.userData.atomParticle === 'neutron'
      );
      const forces = nucleons.map(() => new THREE.Vector3());
      for (let i = 0; i < nucleons.length; i++) {
        for (let j = i + 1; j < nucleons.length; j++) {
          const force = this.calculateWaterNuclearForce(nucleons[i], nucleons[j]);
          forces[i].sub(force);
          forces[j].add(force);
        }
      }
      nucleons.forEach((nucleon, index) => {
        const velocity = new THREE.Vector3().fromArray(nucleon.userData.velocity || [0, 0, 0]);
        velocity.addScaledVector(forces[index], delta).multiplyScalar(Math.exp(-NUCLEON_DAMPING * delta));
        nucleon.position.addScaledVector(velocity, delta);
        nucleon.userData.velocity = velocity.toArray();
      });
    });
    const chargedParticles = [];
    const electrons = [];
    compound.traverse((object) => {
      if (!object.userData?.charge) return;
      if (object.userData.charge === -1) electrons.push(object);
      chargedParticles.push(object);
    });

    const positions = new Map(chargedParticles.map((particle) => [
      particle,
      particle.getWorldPosition(new THREE.Vector3())
    ]));
    electrons.forEach((electron) => {
      const position = positions.get(electron);
      const force = new THREE.Vector3();
      chargedParticles.forEach((source) => {
        if (source === electron) return;
        const displacement = position.clone().sub(positions.get(source));
        const distanceSquared = displacement.lengthSq() + ELECTROSTATIC_SOFTENING_SQ;
        force.add(displacement.multiplyScalar(
          ELECTROSTATIC_K * source.userData.charge * electron.userData.charge /
          (distanceSquared * Math.sqrt(distanceSquared))
        ));
      });
      const velocity = new THREE.Vector3().fromArray(electron.userData.velocity || [0, 0, 0]);
      velocity.addScaledVector(force, delta).multiplyScalar(Math.exp(-0.18 * delta));
      const nextWorldPosition = position.addScaledVector(velocity, delta);
      let nearestNucleus = nucleiById.get(electron.userData.orbitalNucleusId) || null;
      if (!nearestNucleus) {
        let nearestDistanceSq = Infinity;
        nuclei.forEach((nucleus) => {
          const distanceSq = nextWorldPosition.distanceToSquared(nucleus.center);
          if (distanceSq < nearestDistanceSq) {
            nearestDistanceSq = distanceSq;
            nearestNucleus = nucleus;
          }
        });
      }
      if (nearestNucleus) {
        const offset = nextWorldPosition.clone().sub(nearestNucleus.center);
        const maxDistance = nearestNucleus.atom.userData.electronRange;
        if (offset.lengthSq() > maxDistance * maxDistance) {
          const radial = offset.normalize();
          nextWorldPosition.copy(nearestNucleus.center).addScaledVector(radial, maxDistance);
          velocity.addScaledVector(radial, -Math.max(0, velocity.dot(radial)));
        }
      }
      electron.parent.worldToLocal(nextWorldPosition);
      electron.position.copy(nextWorldPosition);
      electron.userData.velocity = velocity.toArray();
    });
  }

  updateWaterBondingAction(compound, delta) {
    const animation = compound.waterBondAnimation;
    if (!animation || animation.elapsed >= animation.duration) return;
    animation.elapsed = Math.min(animation.duration, animation.elapsed + delta);
    const progress = animation.elapsed / animation.duration;
    const eased = progress * progress * (3 - 2 * progress);
    animation.hydrogens.forEach(({ hydrogen, start, target }) => {
      hydrogen.position.lerpVectors(start, target, eased);
    });
  }

  calculateWaterNuclearForce(source, target) {
    const displacement = target.position.clone().sub(source.position);
    const distance = displacement.length();
    if (distance < 1e-6) return new THREE.Vector3();
    const scaledRestDistance = NUCLEON_REST_DISTANCE * 0.16;
    return displacement.multiplyScalar(-NUCLEAR_SPRING_K * (distance - scaledRestDistance) / distance);
  }

  selectGeneratedObject(object) {
    if (this.editor?.selectionManager) {
      this.editor.selectionManager.select(object, false);
    } else {
      this.setSelectedObject(object);
    }
  }

  createLight(type) {
    const cursor = this.get3DCursorPosition();
    let light;
    let name;

    switch (type.toLowerCase()) {
      case 'point':
        light = new THREE.PointLight(0xfff5e6, 20, 20);
        name = 'Point Light';
        break;
      case 'sun':
      case 'directional':
        light = new THREE.DirectionalLight(0xffffff, 1.5);
        name = 'Sun Light';
        break;
      case 'spot':
        light = new THREE.SpotLight(0xffffff, 25, 25, Math.PI / 6, 0.3);
        name = 'Spot Light';
        break;
      default:
        light = new THREE.PointLight(0xffffff, 15, 15);
        name = 'Light';
    }

    light.name = name;
    light.position.copy(cursor).add(new THREE.Vector3(0, 3, 0));
    light.castShadow = true;

    const helper = new THREE.PointLightHelper(light, 0.3, 0xffcc00);
    helper.name = '__helper_' + light.id;
    this.scene.add(helper);
    light.userData.helper = helper;

    this.addObject(light);
    this.setSelectedObject(light);
    return light;
  }

  setSelectedObject(obj) {
    this.selectedObject = obj;
    if (this.onSelectionChanged) {
      this.onSelectionChanged(obj);
    }
  }

  getSelectedObject() {
    return this.selectedObject;
  }

  setShadingMode(mode) {
    this.shadingMode = mode;

    this.objectsList.forEach((obj) => {
      if (obj.name.startsWith('__')) return;
      obj.traverse((child) => {
        if (!child.isMesh) return;
        if (!child.userData.originalMaterial) child.userData.originalMaterial = child.material;

        switch (mode) {
          case ShadingMode.WIREFRAME:
            child.material = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true });
            break;
          case ShadingMode.SOLID:
            child.material = new THREE.MeshStandardMaterial({
              color: 0xcccccc, roughness: 0.6, metalness: 0.05, wireframe: false
            });
            break;
          case ShadingMode.MATERIAL:
          case ShadingMode.RENDERED:
            child.material = child.userData.originalMaterial;
            break;
        }
      });
    });
    this.updateWorkspaceBackground();
  }

  toggleCameraProjection() {
    this.isOrtho = !this.isOrtho;
    const aspect = this.width / this.height;
    const currentCam = this.activeCamera;

    if (this.isOrtho) {
      const dist = currentCam.position.length();
      const frustumSize = Math.max(4, dist * 0.9);
      this.orthoCamera.left = (-frustumSize * aspect) / 2;
      this.orthoCamera.right = (frustumSize * aspect) / 2;
      this.orthoCamera.top = frustumSize / 2;
      this.orthoCamera.bottom = -frustumSize / 2;
      this.orthoCamera.position.copy(currentCam.position);
      this.orthoCamera.quaternion.copy(currentCam.quaternion);
      this.orthoCamera.updateProjectionMatrix();
      this.activeCamera = this.orthoCamera;
    } else {
      this.perspCamera.position.copy(currentCam.position);
      this.perspCamera.quaternion.copy(currentCam.quaternion);
      this.perspCamera.updateProjectionMatrix();
      this.activeCamera = this.perspCamera;
    }

    if (this.onCameraChanged) {
      this.onCameraChanged(this.activeCamera, this.isOrtho);
    }
  }

  onResize() {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    const aspect = this.width / this.height;

    this.perspCamera.aspect = aspect;
    this.perspCamera.updateProjectionMatrix();

    const frustumSize = 10;
    this.orthoCamera.left = (-frustumSize * aspect) / 2;
    this.orthoCamera.right = (frustumSize * aspect) / 2;
    this.orthoCamera.top = frustumSize / 2;
    this.orthoCamera.bottom = -frustumSize / 2;
    this.orthoCamera.updateProjectionMatrix();

    this.renderer.setSize(this.width, this.height);
  }

  onCameraMoved() {
    // Sync light helpers
    this.objectsList.forEach((obj) => {
      if (obj.userData?.helper) {
        obj.userData.helper.update();
      }
    });
  }

  render() {
    this.updateCircuitConnections();
    this.renderer.render(this.scene, this.activeCamera);
  }
}
