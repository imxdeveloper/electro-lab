import { Icons } from '../utils/Icons.js';

// Symbol, name, and most abundant isotope mass number for the first 60 elements.
// Tc-98 is used for technetium because all of its isotopes are radioactive.
const ELEMENTS = [
  ['H','Hydrogen',1],['He','Helium',4],['Li','Lithium',7],['Be','Beryllium',9],['B','Boron',11],['C','Carbon',12],['N','Nitrogen',14],['O','Oxygen',16],['F','Fluorine',19],['Ne','Neon',20],
  ['Na','Sodium',23],['Mg','Magnesium',24],['Al','Aluminum',27],['Si','Silicon',28],['P','Phosphorus',31],['S','Sulfur',32],['Cl','Chlorine',35],['Ar','Argon',40],['K','Potassium',39],['Ca','Calcium',40],
  ['Sc','Scandium',45],['Ti','Titanium',48],['V','Vanadium',51],['Cr','Chromium',52],['Mn','Manganese',55],['Fe','Iron',56],['Co','Cobalt',59],['Ni','Nickel',58],['Cu','Copper',63],['Zn','Zinc',64],
  ['Ga','Gallium',69],['Ge','Germanium',74],['As','Arsenic',75],['Se','Selenium',80],['Br','Bromine',79],['Kr','Krypton',84],['Rb','Rubidium',85],['Sr','Strontium',88],['Y','Yttrium',89],['Zr','Zirconium',90],
  ['Nb','Niobium',93],['Mo','Molybdenum',98],['Tc','Technetium',98],['Ru','Ruthenium',102],['Rh','Rhodium',103],['Pd','Palladium',106],['Ag','Silver',107],['Cd','Cadmium',114],['In','Indium',115],['Sn','Tin',120],
  ['Sb','Antimony',121],['Te','Tellurium',130],['I','Iodine',127],['Xe','Xenon',132],['Cs','Cesium',133],['Ba','Barium',138],['La','Lanthanum',139],['Ce','Cerium',140],['Pr','Praseodymium',141],['Nd','Neodymium',142]
];

export class AddMenuModal {
  constructor(editor) {
    this.editor = editor;
    this.isOpen = false;

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.el = document.createElement('div');
    this.el.className = 'electroDesigner-add-popup';
    this.el.style.display = 'none';

    this.el.innerHTML = `
      <div class="add-popup-header">Add</div>
      <div class="add-popup-list">
        <div class="add-popup-category">Mesh</div>
        <button class="add-popup-item" data-type="mesh" data-primitive="cube">
          <span class="icon">${Icons.meshIcon}</span> Cube
        </button>
        <button class="add-popup-item" data-type="mesh" data-primitive="sphere">
          <span class="icon">${Icons.meshIcon}</span> UV Sphere
        </button>
        <button class="add-popup-item" data-type="mesh" data-primitive="cylinder">
          <span class="icon">${Icons.meshIcon}</span> Cylinder
        </button>
        <button class="add-popup-item" data-type="mesh" data-primitive="cone">
          <span class="icon">${Icons.meshIcon}</span> Cone
        </button>
        <button class="add-popup-item" data-type="mesh" data-primitive="torus">
          <span class="icon">${Icons.meshIcon}</span> Torus
        </button>
        <button class="add-popup-item" data-type="mesh" data-primitive="plane">
          <span class="icon">${Icons.meshIcon}</span> Plane
        </button>
        <button class="add-popup-item" data-type="mesh" data-primitive="monkey">
          <span class="icon">${Icons.meshIcon}</span> Monkey (Suzanne)
        </button>

        <div class="add-popup-divider"></div>
        <div class="atom-mode-content">
        <div class="add-popup-category">Science</div>
        <div class="atom-element-list" aria-label="First 60 elements">
          ${ELEMENTS.map(([symbol, name, mass], index) => `
            <button class="add-popup-item" data-type="atom" data-number="${index + 1}" data-mass="${mass}" data-element="${name}" title="${name}, isotope ${mass}">
              <span class="atom-number">${String(index + 1).padStart(2, '0')}</span>
              <strong class="atom-symbol">${symbol}</strong><span>${name}</span>
            </button>
          `).join('')}
        </div>
        <div class="add-popup-divider"></div>
        <div class="add-popup-category">Life Molecules</div>
        <button class="add-popup-item" data-type="molecule" data-molecule="water" title="H₂O molecule">
          <span class="icon">${Icons.meshIcon}</span> Water (H₂O)
        </button>
        <button class="add-popup-item" data-type="molecule" data-molecule="oxygen">
          <span class="icon">${Icons.meshIcon}</span> Oxygen (O₂)
        </button>
        <button class="add-popup-item" data-type="molecule" data-molecule="carbonDioxide">
          <span class="icon">${Icons.meshIcon}</span> Carbon Dioxide (CO₂)
        </button>
        <button class="add-popup-item" data-type="molecule" data-molecule="glucose">
          <span class="icon">${Icons.meshIcon}</span> Glucose (C₆H₁₂O₆)
        </button>
        <button class="add-popup-item" data-type="molecule" data-molecule="glycine">
          <span class="icon">${Icons.meshIcon}</span> Glycine (C₂H₅NO₂)
        </button>
        <button class="add-popup-item" data-type="molecule" data-molecule="alanine">
          <span class="icon">${Icons.meshIcon}</span> Alanine (C₃H₇NO₂)
        </button>
        <button class="add-popup-item" data-type="molecule" data-molecule="ethanol">
          <span class="icon">${Icons.meshIcon}</span> Ethanol (C₂H₆O)
        </button>
        <button class="add-popup-item" data-type="molecule" data-molecule="methane">
          <span class="icon">${Icons.meshIcon}</span> Methane (CH₄)
        </button>
        <div class="add-popup-divider"></div>
        <div class="add-popup-category">Electromagnetism & Fields</div>
        <button class="add-popup-item" data-type="science-rhr" title="Right-Hand Rule & Copper E-Field (Shift + B)">
          <span class="icon">${Icons.meshIcon}</span> Right-Hand Rule (Cu E-Field & Holes)
        </button>

        </div>
        <div class="circuit-mode-content" style="display:none">
          <div class="add-popup-category">Circuit Components</div>
          <button class="add-popup-item" data-type="circuit" data-component="battery">Battery</button>
          <button class="add-popup-item" data-type="circuit" data-component="voltageSource">Voltage Source (V)</button>
          <button class="add-popup-item" data-type="circuit" data-component="resistor">Resistor</button>
          <button class="add-popup-item" data-type="circuit" data-component="led">LED</button>
          <button class="add-popup-item" data-type="circuit" data-component="switch">Switch</button>
          <button class="add-popup-item" data-type="circuit" data-component="wire">Wire</button>
          <button class="add-popup-item" data-type="circuit" data-component="pmosMosfet">P-Channel MOSFET (PMOS)</button>
          <button class="add-popup-item" data-type="circuit" data-component="nmosMosfet">N-Channel MOSFET (NMOS)</button>
          <button class="add-popup-item" data-type="circuit" data-component="npnTransistor">NPN Transistor</button>
          <button class="add-popup-item" data-type="circuit" data-component="capacitor">Capacitor</button>
          <button class="add-popup-item" data-type="circuit" data-component="diode">Diode</button>
          <button class="add-popup-item" data-type="circuit" data-component="inductor">Inductor</button>
          <button class="add-popup-item" data-type="circuit" data-component="ground">Ground</button>
          <button class="add-popup-item" data-type="circuit" data-component="sramArray">4×4 SRAM (6T Cells)</button>
          <div class="add-popup-divider"></div>
          <div class="add-popup-category">Electromagnetism</div>
          <button class="add-popup-item" data-type="science-rhr" title="Right-Hand Rule & Copper E-Field (Shift + B)">
            Right-Hand Rule (Cu Conductor)
          </button>
        </div>
        <div class="add-popup-divider"></div>

        <div class="add-popup-category">Light</div>
        <button class="add-popup-item" data-type="light" data-light="sun">
          <span class="icon">${Icons.lightIcon}</span> Sun Light
        </button>
        <button class="add-popup-item" data-type="light" data-light="point">
          <span class="icon">${Icons.lightIcon}</span> Point Light
        </button>
        <button class="add-popup-item" data-type="light" data-light="spot">
          <span class="icon">${Icons.lightIcon}</span> Spot Light
        </button>
      </div>
    `;

    document.body.appendChild(this.el);
  }

  bindEvents() {
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('.add-popup-item');
      if (!btn) return;

      const type = btn.dataset.type;
      if (type === 'mesh') {
        this.editor.sceneManager.createMeshPrimitive(btn.dataset.primitive);
      } else if (type === 'light') {
        this.editor.sceneManager.createLight(btn.dataset.light);
      } else if (type === 'atom') {
        const atomicNumber = Number(btn.dataset.number);
        const massNumber = Number(btn.dataset.mass);
        this.editor.sceneManager.createAtom(atomicNumber, Math.max(0, massNumber - atomicNumber), atomicNumber, btn.dataset.element);
      } else if (type === 'molecule') {
        this.editor.sceneManager.createMolecule(btn.dataset.molecule);
      } else if (type === 'circuit') {
        this.editor.sceneManager.createCircuitComponent(btn.dataset.component);
      } else if (type === 'science-rhr') {
        this.editor.sceneManager.createRightHandRuleCopperConductor();
      }

      this.close();
    });

    window.addEventListener('pointerdown', (e) => {
      if (this.isOpen && !this.el.contains(e.target)) {
        this.close();
      }
    });

    // Shift + A shortcut
    window.addEventListener('keydown', (e) => {
      const isCircuitAddShortcut = this.editor.workspaceMode === 'circuits' && e.code === 'KeyA' && e.shiftKey;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (document.activeElement?.tagName === 'SELECT' && !isCircuitAddShortcut) return;
      if (e.code === 'KeyA' && e.shiftKey) {
        e.preventDefault();
        // Open near mouse position or center
        const mouseX = this.editor.lastMouseClientX || window.innerWidth / 2;
        const mouseY = this.editor.lastMouseClientY || window.innerHeight / 2;
        this.openAt(mouseX, mouseY);
      } else if (e.code === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  openAt(x, y) {
    this.editor.compoundMenuModal?.close();
    this.editor.electronFieldMenuModal?.close();
    this.editor.magneticCompoundMenuModal?.close();
    this.isOpen = true;
    this.el.style.display = 'block';

    const maxX = window.innerWidth - 220;
    const maxY = window.innerHeight - Math.min(this.el.offsetHeight, window.innerHeight - 20) - 10;
    const clampedX = Math.max(10, Math.min(x, maxX));
    const clampedY = Math.max(10, Math.min(y, maxY));

    this.el.style.left = `${clampedX}px`;
    this.el.style.top = `${clampedY}px`;
  }

  setWorkspaceMode(mode) {
    const atoms = this.el.querySelector('.atom-mode-content');
    const circuits = this.el.querySelector('.circuit-mode-content');
    if (atoms) atoms.style.display = mode === 'atoms' ? '' : 'none';
    if (circuits) circuits.style.display = mode === 'circuits' ? '' : 'none';
    const header = this.el.querySelector('.add-popup-header');
    if (header) header.textContent = mode === 'circuits' ? 'Add Circuit Part' : 'Add Atom or Molecule';
  }

  close() {
    this.isOpen = false;
    this.el.style.display = 'none';
  }
}
