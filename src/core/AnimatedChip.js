import * as THREE from 'three';

// A self-running animated chip for Atom Lab: an 8-bit counter laid out as a
// layer stack. Nothing is imported; the clock free-runs and the counter counts
// forever, so it always shows something moving.

const DEFAULT_BITS = 8;
const DEFAULT_CLOCK_PERIOD = 1;
const CELL_COUNT = 8;
const DIE_WIDTH = 14;
const DIE_DEPTH = 8;

/**
 * Timing and bit logic for the animated chip, kept free of any Three.js
 * dependency so it can be reasoned about and tested on its own.
 */
export class AnimatedChipModel {
  constructor(options = {}) {
    this.bits = options.bits ?? DEFAULT_BITS;
    this.clockPeriod = Math.max(options.clockPeriod ?? DEFAULT_CLOCK_PERIOD, 0.05);
    this.maxValue = 2 ** this.bits;
    this.value = options.startValue ?? 0;
    this.elapsed = 0;
    this.ticks = 0;
    this.clockHigh = false;
  }

  /** Advance the model and return the current display state. */
  update(deltaSeconds) {
    // The render loop already clamps per-frame deltas; this wider clamp keeps a
    // stalled or backgrounded tab from counting thousands of edges at once.
    const delta = Math.min(Math.max(deltaSeconds || 0, 0), 1);
    this.elapsed += delta;
    const ticks = Math.floor(this.elapsed / this.clockPeriod);
    if (ticks > this.ticks) {
      // Each clock edge increments the counter and toggles the clock line.
      const steps = ticks - this.ticks;
      this.value = (this.value + steps) % this.maxValue;
      this.ticks = ticks;
      this.clockHigh = !this.clockHigh;
    }
    const phase = (this.elapsed % this.clockPeriod) / this.clockPeriod;
    return this.getState(phase);
  }

  getState(phase = (this.elapsed % this.clockPeriod) / this.clockPeriod) {
    return {
      value: this.value,
      phase,
      ticks: this.ticks,
      clockHigh: this.clockHigh,
      bits: this.bitValues(),
      binary: this.value.toString(2).padStart(this.bits, '0'),
      hex: `0x${this.value.toString(16).toUpperCase().padStart(Math.ceil(this.bits / 4), '0')}`
    };
  }

  bitValues() {
    return Array.from({ length: this.bits }, (_, index) => (this.value >> index) & 1);
  }

  reset(startValue = 0) {
    this.value = startValue % this.maxValue;
    this.elapsed = 0;
    this.ticks = 0;
    this.clockHigh = false;
  }
}

function makeLabelTexture(text, color = '#dff3ff', width = 768, height = 160) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  context.font = 'bold 62px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, context };
}

function setLabel(context, texture, text, color = '#dff3ff') {
  context.clearRect(0, 0, texture.image.width, texture.image.height);
  context.font = 'bold 62px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.fillText(text, texture.image.width / 2, texture.image.height / 2);
  texture.needsUpdate = true;
}

/**
 * Build the animated counter chip scene graph.
 * @returns {{ object: THREE.Group, update: (delta: number) => void, model: AnimatedChipModel }}
 */
export function createAnimatedCounterChip(options = {}) {
  const model = new AnimatedChipModel(options);
  const chip = new THREE.Group();
  chip.name = 'Animated Counter Chip';

  const materials = {
    substrate: new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.7, metalness: 0.1 }),
    diffusion: new THREE.MeshStandardMaterial({ color: 0x1f6f4a, roughness: 0.55, metalness: 0.15 }),
    poly: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.4, metalness: 0.3, emissive: 0x3a2c00 }),
    metal1: new THREE.MeshStandardMaterial({ color: 0x5b6ea8, roughness: 0.35, metalness: 0.7, emissive: 0x101a33 }),
    metal2: new THREE.MeshStandardMaterial({ color: 0x8f6fd0, roughness: 0.3, metalness: 0.75, emissive: 0x1a1030 }),
    passivation: new THREE.MeshStandardMaterial({ color: 0x9fb7c9, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.16 }),
    via: new THREE.MeshStandardMaterial({ color: 0xd8c27a, roughness: 0.3, metalness: 0.8, emissive: 0x2a2205 }),
    electron: new THREE.MeshBasicMaterial({ color: 0x7fe8ff })
  };

  const slab = (name, size, position, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    chip.add(mesh);
    return mesh;
  };

  // Process stack-up, bottom to top.
  slab('Substrate', [DIE_WIDTH, 0.5, DIE_DEPTH], [0, 0, 0], materials.substrate);
  slab('Diffusion', [DIE_WIDTH - 0.6, 0.12, DIE_DEPTH - 0.6], [0, 0.31, 0], materials.diffusion);

  // Eight standard cells: one gate bar plus source/drain pads each.
  const cellWidth = 1.15;
  const cellSpacing = 1.5;
  const cellsX = [];
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const x = (index - (CELL_COUNT - 1) / 2) * cellSpacing;
    cellsX.push(x);

    const cell = slab(`Cell ${index}`, [cellWidth, 0.1, 1.5], [x, 0.42, 0.6], materials.diffusion);

    const gate = new THREE.Mesh(new THREE.BoxGeometry(cellWidth, 0.22, 0.18), materials.poly.clone());
    gate.name = `Gate ${index}`;
    gate.position.set(x, 0.55, 0.6);
    gate.castShadow = true;
    chip.add(gate);

    const source = slab(`Source ${index}`, [0.22, 0.12, 0.9], [x - cellWidth / 2 + 0.1, 0.52, 0.6], materials.metal1);
    const drain = slab(`Drain ${index}`, [0.22, 0.12, 0.9], [x + cellWidth / 2 - 0.1, 0.52, 0.6], materials.metal1);

    // Output trace carrying the cell value to the pad bus on the right.
    const traceStart = x + cellWidth / 2;
    const traceEnd = DIE_WIDTH / 2 + 0.6;
    const traceZ = -2.2 + index * 0.42;
    const traceLength = traceEnd - traceStart;
    const trace = slab(`Trace ${index}`, [traceLength, 0.08, 0.16], [traceStart + traceLength / 2, 0.72, traceZ], materials.metal1);
    const via = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 12), materials.via.clone());
    via.name = `Via ${index}`;
    via.position.set(traceEnd, 0.85, traceZ);
    chip.add(via);

    // Output pad glows while the bit is high.
    const pad = slab(`Pad ${index}`, [0.55, 0.16, 0.4], [DIE_WIDTH / 2 + 0.85, 0.78, traceZ], materials.metal2.clone());
    pad.material.emissive = new THREE.Color(0x120a24);

    const electron = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), materials.electron.clone());
    electron.name = `Electron ${index}`;
    electron.visible = false;
    chip.add(electron);

    cell.userData.animatedChipCell = index;
  }

  // Clock distribution line in front of the cells, plus its blinking driver.
  const clockTrace = slab('Clock line', [DIE_WIDTH - 0.8, 0.08, 0.2], [0, 0.66, 2.1], materials.metal1);
  clockTrace.material = materials.metal1.clone();
  const clockLed = slab('Clock LED', [0.45, 0.3, 0.45], [-DIE_WIDTH / 2 - 0.2, 0.8, 2.1], materials.via.clone());
  clockLed.material.emissive = new THREE.Color(0x220505);

  // Metal 2 bus above the traces, joined by the vias.
  slab('Metal 2 bus', [0.5, 0.1, 3.8], [DIE_WIDTH / 2 + 0.85, 1.05, -1.35], materials.metal2);
  slab('Passivation', [DIE_WIDTH - 0.4, 0.05, DIE_DEPTH - 0.4], [0, 1.35, 0], materials.passivation);

  // Live readout sprite above the die.
  const readout = makeLabelTexture('0b00000000', '#9fe8ff');
  const readoutSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: readout.texture,
    transparent: true,
    depthTest: false
  }));
  readoutSprite.name = 'Counter readout';
  readoutSprite.scale.set(5.6, 1.17, 1);
  readoutSprite.position.set(0, 1.9, -DIE_DEPTH / 2 - 0.3);
  chip.add(readoutSprite);

  const title = makeLabelTexture('8-bit COUNTER', '#ffd479');
  const titleSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: title.texture, transparent: true, depthTest: false }));
  titleSprite.name = 'Counter title';
  titleSprite.scale.set(5.6, 1.17, 1);
  titleSprite.position.set(0, 2.9, -DIE_DEPTH / 2 - 0.3);
  chip.add(titleSprite);

  const glowColor = new THREE.Color(0xffd166);
  const highColor = new THREE.Color(0x9dff9d);
  const parts = chip.children.filter((child) => /^(Gate|Pad|Via|Electron)/.test(child.name));

  const update = (delta) => {
    const state = model.update(delta);

    chip.userData.counterValue = state.value;
    chip.userData.counterBinary = state.binary;
    chip.userData.clockTicks = state.ticks;

    setLabel(readout.context, readout.texture, `0b${state.binary}  ${state.hex}`);

    clockLed.material.emissive.copy(state.clockHigh ? glowColor : new THREE.Color(0x220505));
    clockTrace.material.emissive.setScalar(0.06 + 0.5 * (state.clockHigh ? 1 : 0.15));

    parts.forEach((part) => {
      if (/^Gate/.test(part.name)) {
        const index = Number(part.name.split(' ')[1]);
        const on = state.bits[index] === 1;
        part.material.emissive.copy(on ? highColor : new THREE.Color(0x3a2c00));
        part.scale.y = on ? 1.5 : 1;
      }
    });

    // Electrons run down the clock line, then along the traces that are high.
    const clockElectron = chip.getObjectByName('Clock electron');
    if (clockElectron) {
      clockElectron.position.set(-DIE_WIDTH / 2 + 0.4 + state.phase * (DIE_WIDTH - 0.8), 0.76, 2.1);
    }
    for (let index = 0; index < CELL_COUNT; index += 1) {
      const electron = chip.getObjectByName(`Electron ${index}`);
      if (!electron) continue;
      const active = state.bits[index] === 1;
      electron.visible = active;
      if (!active) continue;
      const start = cellsX[index] + cellWidth / 2;
      const end = DIE_WIDTH / 2 + 0.6;
      electron.position.set(start + (end - start) * state.phase, 0.8, -2.2 + index * 0.42);
    }

    chip.children.forEach((child) => {
      if (/^Pad/.test(child.name)) {
        const index = Number(child.name.split(' ')[1]);
        const on = state.bits[index] === 1;
        child.material.emissive.copy(on ? new THREE.Color(0x7c4dff) : new THREE.Color(0x120a24));
      }
      if (/^Via/.test(child.name)) {
        const index = Number(child.name.split(' ')[1]);
        const lit = state.bits[index] === 1 ? 0.5 + 0.4 * Math.sin(state.phase * Math.PI) : 0.12;
        child.material.emissive.setRGB(lit, lit * 0.85, lit * 0.35);
      }
    });
  };

  // Clock-line electron reused every frame.
  const clockElectron = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), materials.electron.clone());
  clockElectron.name = 'Clock electron';
  clockElectron.position.y = 0.76;
  chip.add(clockElectron);

  chip.userData.animatedChip = true;
  chip.userData.counterValue = 0;
  update(0);

  return { object: chip, model, update };
}