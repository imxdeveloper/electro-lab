import * as THREE from 'three';

export class BoardPanel {
  constructor(editor) {
    this.editor = editor;
    this.createDOM();
    this.bindEvents();
  }

  createDOM() {
    this.el = document.createElement('section');
    this.el.className = 'board-panel';
    this.el.hidden = true;
    this.el.innerHTML = `
      <header><strong>Board tools</strong><span>Shift + P</span></header>
      <div class="board-panel-buttons" aria-label="Board tools">
        <button type="button" data-board-action="create">1 · Board</button>
        ${Array.from({ length: 9 }, (_, index) => `<button type="button" disabled> ${index + 2} · Button ${index + 2}</button>`).join('')}
      </div>
      <footer data-board-status>Choose Board to add a multilayer PCB to the workspace.</footer>
    `;
    document.body.appendChild(this.el);
    this.el.querySelector('[data-board-action="create"]').addEventListener('click', () => this.createBoard());
  }

  bindEvents() {
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyP' || !event.shiftKey || event.ctrlKey || event.altKey || event.repeat || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      event.preventDefault();
      this.el.hidden = !this.el.hidden;
    });
  }

  createBoard() {
    this.editor.setWorkspaceMode('circuits');

    const board = new THREE.Group();
    board.name = '4-Layer PCB';
    board.userData.circuitComponent = true;
    board.userData.board = true;

    const materials = {
      core: new THREE.MeshStandardMaterial({ color: 0x93845b, roughness: 0.72 }),
      mask: new THREE.MeshStandardMaterial({ color: 0x075747, roughness: 0.48, metalness: 0.08 }),
      copper: new THREE.MeshStandardMaterial({ color: 0xc8793b, roughness: 0.34, metalness: 0.68 }),
      pad: new THREE.MeshStandardMaterial({ color: 0xe3a45f, roughness: 0.28, metalness: 0.72 }),
      opening: new THREE.MeshStandardMaterial({ color: 0x101b1b, roughness: 0.4 }),
      chip: new THREE.MeshStandardMaterial({ color: 0x171c22, roughness: 0.38, metalness: 0.12 }),
      silk: new THREE.MeshStandardMaterial({ color: 0xe5e8da, roughness: 0.65 })
    };
    const addBox = (name, size, position, material, layer) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.name = name;
      mesh.position.set(...position);
      mesh.userData.pcbLayer = layer;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      board.add(mesh);
      return mesh;
    };

    // The dielectric core and foil layers are stacked so their edges read as a PCB cross-section.
    addBox('FR-4 dielectric core', [12, 0.3, 8], [0, 0.2, 0], materials.core, 'Core');
    addBox('Bottom solder mask', [12, 0.025, 8], [0, 0.0375, 0], materials.mask, 'Bottom mask');
    addBox('Bottom copper foil', [11.98, 0.018, 7.98], [0, 0.059, 0], materials.copper, 'Bottom copper');
    addBox('Inner ground plane', [11.94, 0.012, 7.94], [0, 0.115, 0], materials.copper, 'Inner 1 · Ground');
    addBox('Inner signal plane', [11.94, 0.012, 7.94], [0, 0.285, 0], materials.copper, 'Inner 2 · Signal');
    addBox('Top copper foil', [11.98, 0.018, 7.98], [0, 0.36, 0], materials.copper, 'Top copper');
    addBox('Top solder mask', [12, 0.025, 8], [0, 0.3825, 0], materials.mask, 'Top mask');

    const topY = 0.398;
    const addTrace = (points, width = 0.075) => {
      for (let index = 0; index < points.length - 1; index += 1) {
        const [x1, z1] = points[index];
        const [x2, z2] = points[index + 1];
        const dx = x2 - x1;
        const dz = z2 - z1;
        const trace = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dz), 0.016, width), materials.copper);
        trace.position.set((x1 + x2) / 2, topY, (z1 + z2) / 2);
        trace.rotation.y = -Math.atan2(dz, dx);
        trace.userData.pcbLayer = 'Top copper';
        board.add(trace);
      }
    };
    const addPad = (x, z, radius = 0.14) => {
      const opening = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.045, radius + 0.045, 0.012, 24), materials.opening);
      opening.position.set(x, topY + 0.003, z);
      board.add(opening);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.02, 24), materials.pad);
      pad.position.set(x, topY + 0.015, z);
      pad.userData.pcbLayer = 'Top copper';
      board.add(pad);
    };
    const addVia = (x, z) => {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.018, 24), materials.pad);
      ring.position.set(x, topY + 0.014, z);
      board.add(ring);
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.024, 20), materials.opening);
      hole.position.set(x, topY + 0.016, z);
      board.add(hole);
    };
    const addSilk = (text, x, z, color = '#e5e8da', scale = [0.8, 0.28, 1]) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.createLabelTexture(text, color), transparent: true, depthTest: false }));
      sprite.position.set(x, topY + 0.04, z);
      sprite.scale.set(...scale);
      sprite.userData.pcbLayer = 'Silkscreen';
      board.add(sprite);
    };

    // Four plated mounting holes.
    for (const [x, z] of [[-5.35, -3.35], [5.35, -3.35], [-5.35, 3.35], [5.35, 3.35]]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.025, 32), materials.pad);
      ring.position.set(x, topY + 0.012, z);
      board.add(ring);
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 32), materials.opening);
      hole.position.set(x, topY + 0.014, z);
      board.add(hole);
    }

    // Surface routing, via transitions, and footprints give the board a populated PCB layout.
    const routes = [
      [[-4.35, -1.65], [-2.9, -1.65], [-2.25, -1.0], [-0.75, -1.0]],
      [[-4.35, -0.8], [-3.1, -0.8], [-2.45, -0.15], [-0.75, -0.15]],
      [[-4.35, 0.15], [-3.15, 0.15], [-2.55, 0.75], [-0.75, 0.75]],
      [[0.75, -1.35], [2.0, -1.35], [2.7, -2.05], [4.25, -2.05]],
      [[0.75, 0.45], [2.1, 0.45], [2.75, 1.1], [4.25, 1.1]],
      [[-1.9, 2.25], [-1.9, 1.55], [-1.25, 0.9]],
      [[1.75, -2.55], [1.75, -1.7], [2.35, -1.1]],
      [[-4.25, 2.65], [-2.8, 2.65], [-2.15, 2.0], [-0.6, 2.0]]
    ];
    routes.forEach((route, index) => {
      addTrace(route, index % 3 === 0 ? 0.11 : 0.075);
      route.forEach(([x, z], pointIndex) => {
        if (pointIndex === 0 || pointIndex === route.length - 1) addPad(x, z, 0.12);
      });
    });
    [[-3.2, -2.25], [-2.7, 1.7], [1.2, -2.55], [2.4, 2.0], [4.45, 0.15]].forEach(([x, z]) => addVia(x, z));

    const footprint = (name, x, z, width, depth, pinCount = 4) => {
      addBox(`${name} component body`, [width, 0.14, depth], [x, topY + 0.105, z], materials.chip, 'Components');
      const pinGap = depth / (pinCount + 1);
      for (let pin = 1; pin <= pinCount; pin += 1) {
        const pinZ = z - depth / 2 + pinGap * pin;
        addPad(x - width / 2 - 0.16, pinZ, 0.085);
        addPad(x + width / 2 + 0.16, pinZ, 0.085);
      }
      addSilk(name, x, z - depth / 2 - 0.22, '#e5e8da', [0.72, 0.24, 1]);
    };
    footprint('U1', 0, -0.15, 1.5, 1.3, 4);
    footprint('U2', 3.35, -0.45, 1.1, 1.4, 4);
    footprint('Q1', -2.0, 2.7, 0.7, 0.55, 3);
    footprint('J1', -4.65, 0, 0.45, 2.5, 6);
    addSilk('4-LAYER PCB  ·  REV A', 0, 3.05, '#e5e8da', [2.8, 0.34, 1]);
    addSilk('FR-4   /   HASL   /   1.6 mm', 0, -3.12, '#b7c6bb', [2.6, 0.26, 1]);

    board.position.set(0, 0, 0);
    this.editor.sceneManager.addObject(board);
    this.editor.selectionManager.select(board);
    this.editor.navigation.frameSelected();
    this.editor.sceneManager.render();
    this.el.querySelector('[data-board-status]').textContent = '4-layer PCB added: FR-4 core, top/bottom copper, two inner copper planes, vias, footprints, and silkscreen.';
  }

  createLabelTexture(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = color;
    context.font = 'bold 34px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
