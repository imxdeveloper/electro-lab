import { Icons } from '../utils/Icons.js';

const COMPOUNDS = [
  ['graphene', 'Graphene sheet (carbon lattice)'],
  ['water', 'Water (H₂O)'],
  ['oxygen', 'Oxygen (O₂)'],
  ['carbonDioxide', 'Carbon dioxide (CO₂)'],
  ['glucose', 'Glucose (C₆H₁₂O₆)'],
  ['glycine', 'Glycine'],
  ['alanine', 'Alanine'],
  ['ethanol', 'Ethanol (C₂H₆O)'],
  ['methane', 'Methane (CH₄)']
];

export class MagneticCompoundMenuModal {
  constructor(editor) {
    this.editor = editor;
    this.isOpen = false;
    this.el = document.createElement('div');
    this.el.className = 'electroDesigner-add-popup';
    this.el.style.display = 'none';
    this.el.innerHTML = `
      <div class="add-popup-header">Subatomic Compounds</div>
      <div class="add-popup-category">Protons, neutrons, electrons, and shared bond pairs</div>
      <div class="add-popup-list">
        ${COMPOUNDS.map(([type, name]) => `
          <button class="add-popup-item" data-molecule="${type}">
            <span class="icon">${Icons.meshIcon}</span> ${name}
          </button>
        `).join('')}
      </div>
    `;
    document.body.appendChild(this.el);
    this.bindEvents();
  }

  bindEvents() {
    this.el.addEventListener('click', (event) => {
      const button = event.target.closest('.add-popup-item');
      if (!button) return;
      this.editor.sceneManager.createMolecule(button.dataset.molecule, {
        subatomic: true
      });
      this.close();
    });

    window.addEventListener('pointerdown', (event) => {
      if (this.isOpen && !this.el.contains(event.target)) this.close();
    });

    window.addEventListener('keydown', (event) => {
      if (this.editor.workspaceMode === 'circuits') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (event.code === 'KeyR' && event.shiftKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        const x = this.editor.lastMouseClientX || window.innerWidth / 2;
        const y = this.editor.lastMouseClientY || window.innerHeight / 2;
        this.openAt(x, y);
      } else if (event.code === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  openAt(x, y) {
    this.editor.addMenuModal?.close();
    this.editor.compoundMenuModal?.close();
    this.editor.electronFieldMenuModal?.close();
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
