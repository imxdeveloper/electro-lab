import { Icons } from '../utils/Icons.js';

const DEMO_ATOMS = [
  [1, 1, 'Hydrogen', 'H'], [2, 4, 'Helium', 'He'], [6, 12, 'Carbon', 'C'],
  [7, 14, 'Nitrogen', 'N'], [8, 16, 'Oxygen', 'O'], [10, 20, 'Neon', 'Ne'],
  [11, 23, 'Sodium', 'Na'], [17, 35, 'Chlorine', 'Cl'], [26, 56, 'Iron', 'Fe']
];

const CONDUCTIVE_ELEMENTS = [
  [47, 108, 'Silver', 'Ag'], [29, 64, 'Copper', 'Cu'], [79, 197, 'Gold', 'Au'],
  [13, 27, 'Aluminum', 'Al'], [20, 40, 'Calcium', 'Ca'], [45, 103, 'Rhodium', 'Rh'],
  [6, 12, 'Graphite (Carbon)', 'C']
];

export class ElectronFieldMenuModal {
  constructor(editor) {
    this.editor = editor;
    this.isOpen = false;
    this.el = document.createElement('div');
    this.el.className = 'electroDesigner-add-popup';
    this.el.style.display = 'none';
    this.renderMenu('atom');
    document.body.appendChild(this.el);
    this.bindEvents();
  }

  bindEvents() {
    this.el.addEventListener('click', (event) => {
      const button = event.target.closest('.add-popup-item');
      if (!button) return;
      const atom = this.editor.sceneManager.createElectricFieldAtom(
        Number(button.dataset.protons), Number(button.dataset.mass), button.dataset.name
      );
      if (button.dataset.conductive === 'true') atom.userData.materialBehavior = 'conductive';
      this.close();
    });

    window.addEventListener('pointerdown', (event) => {
      if (this.isOpen && !this.el.contains(event.target)) this.close();
    });

    window.addEventListener('keydown', (event) => {
      if (this.editor.workspaceMode === 'circuits') return;
      if (event.code === 'KeyS' && event.shiftKey && !event.ctrlKey && !event.altKey) {
        if (event.repeat || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
        event.preventDefault();
        this.editor.sceneManager.createSolarCell();
        return;
      }
      if (event.code === 'KeyW' && event.shiftKey && !event.ctrlKey && !event.altKey) {
        if (event.repeat || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
        event.preventDefault();
        const x = this.editor.lastMouseClientX || window.innerWidth / 2;
        const y = this.editor.lastMouseClientY || window.innerHeight / 2;
        this.openAt(x, y, 'conductive');
        return;
      }
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (event.code === 'KeyE' && event.shiftKey) {
        event.preventDefault();
        const x = this.editor.lastMouseClientX || window.innerWidth / 2;
        const y = this.editor.lastMouseClientY || window.innerHeight / 2;
        this.openAt(x, y, 'atom');
      } else if (event.code === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  renderMenu(kind) {
    const isConductive = kind === 'conductive';
    const elements = isConductive ? CONDUCTIVE_ELEMENTS : DEMO_ATOMS;
    this.el.innerHTML = `
      <div class="add-popup-header">${isConductive ? 'Conductive Elements' : 'Electric Field Atom'}</div>
      <div class="add-popup-category">${isConductive
        ? 'Common high-conductivity elements, ordered by typical room-temperature electrical conductivity.'
        : 'Each proton attracts electrons; electrons also repel each other. Simplified Coulomb model.'}</div>
      <div class="add-popup-list">
        ${elements.map(([protons, mass, name, symbol]) => `
          <button class="add-popup-item" data-protons="${protons}" data-mass="${mass}" data-name="${isConductive ? `${name} Conductor` : name}" ${isConductive ? 'data-conductive="true"' : ''}>
            <span class="icon">${Icons.meshIcon}</span> ${name} (${symbol})
          </button>
        `).join('')}
      </div>
    `;
  }

  openAt(x, y, kind = 'atom') {
    this.editor.addMenuModal?.close();
    this.editor.compoundMenuModal?.close();
    this.editor.magneticCompoundMenuModal?.close();
    this.renderMenu(kind);
    this.isOpen = true;
    this.el.style.display = 'block';
    const maxX = Math.max(10, window.innerWidth - this.el.offsetWidth - 10);
    const maxY = Math.max(10, window.innerHeight - this.el.offsetHeight - 10);
    this.el.style.left = `${Math.max(10, Math.min(x, maxX))}px`;
    this.el.style.top = `${Math.max(10, Math.min(y, maxY))}px`;
  }

  close() {
    this.isOpen = false;
    this.el.style.display = 'none';
  }
}
