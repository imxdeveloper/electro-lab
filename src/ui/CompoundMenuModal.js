import { Icons } from '../utils/Icons.js';

export class CompoundMenuModal {
  constructor(editor) {
    this.editor = editor;
    this.isOpen = false;
    this.el = document.createElement('div');
    this.el.className = 'electroDesigner-add-popup';
    this.el.style.display = 'none';
    this.el.innerHTML = `
      <div class="add-popup-header">Subatomic Compounds</div>
      <div class="add-popup-category">Nuclei, orbital electrons, and shared bond pairs</div>
      <div class="add-popup-list">
        <button class="add-popup-item" data-molecule="water">${Icons.meshIcon} Water (H₂O)</button>
        <button class="add-popup-item" data-molecule="water" data-unbonded="true">${Icons.meshIcon} Separate atoms (O + 2H)</button>
        <button class="add-popup-item" data-molecule="oxygen">${Icons.meshIcon} Oxygen (O₂)</button>
        <button class="add-popup-item" data-molecule="carbonDioxide">${Icons.meshIcon} Carbon dioxide (CO₂)</button>
        <button class="add-popup-item" data-molecule="glucose">${Icons.meshIcon} Glucose (C₆H₁₂O₆)</button>
        <button class="add-popup-item" data-molecule="glycine">${Icons.meshIcon} Glycine (C₂H₅NO₂)</button>
        <button class="add-popup-item" data-molecule="alanine">${Icons.meshIcon} Alanine (C₃H₇NO₂)</button>
        <button class="add-popup-item" data-molecule="ethanol">${Icons.meshIcon} Ethanol (C₂H₆O)</button>
        <button class="add-popup-item" data-molecule="methane">${Icons.meshIcon} Methane (CH₄)</button>
      </div>
    `;
    this.defaultContent = this.el.innerHTML;
    this.menuMode = 'compounds';
    document.body.appendChild(this.el);
    this.bindEvents();
  }

  bindEvents() {
    this.el.addEventListener('click', (event) => {
      const button = event.target.closest('.add-popup-item');
      if (!button) return;
      if (button.dataset.waterChoice) {
        this.createWaterChoice(button.dataset.waterChoice);
        return;
      }
      this.editor.sceneManager.createMolecule(button.dataset.molecule, {
        subatomic: true,
        unbonded: button.dataset.unbonded === 'true'
      });
      this.close();
    });

    window.addEventListener('pointerdown', (event) => {
      if (this.isOpen && !this.el.contains(event.target)) this.close();
    });

    window.addEventListener('keydown', (event) => {
      if (this.editor.workspaceMode === 'circuits') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (this.isOpen && this.menuMode === 'waterChoices' && ['Digit1', 'Digit2', 'Numpad1', 'Numpad2'].includes(event.code)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.createWaterChoice(['Digit1', 'Numpad1'].includes(event.code) ? 'bonded' : 'separated');
        return;
      }
      if (event.code === 'KeyO' && event.shiftKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        const x = this.editor.lastMouseClientX || window.innerWidth / 2;
        const y = this.editor.lastMouseClientY || window.innerHeight / 2;
        this.openWaterChoicesAt(x, y);
      } else if (event.code === 'KeyQ' && event.shiftKey) {
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
    this.editor.electronFieldMenuModal?.close();
    this.editor.magneticCompoundMenuModal?.close();
    this.menuMode = 'compounds';
    this.el.innerHTML = this.defaultContent;
    this.isOpen = true;
    this.el.style.display = 'block';
    const maxX = Math.max(10, window.innerWidth - this.el.offsetWidth - 10);
    const maxY = Math.max(10, window.innerHeight - this.el.offsetHeight - 10);
    this.el.style.left = `${Math.max(10, Math.min(x, maxX))}px`;
    this.el.style.top = `${Math.max(10, Math.min(y, maxY))}px`;
  }

  openWaterChoicesAt(x, y) {
    this.editor.addMenuModal?.close();
    this.editor.electronFieldMenuModal?.close();
    this.editor.magneticCompoundMenuModal?.close();
    this.menuMode = 'waterChoices';
    this.el.innerHTML = `
      <div class="add-popup-header">Water Orbital Model</div>
      <div class="add-popup-category">Choose a starting arrangement</div>
      <div class="add-popup-list">
        <button class="add-popup-item" data-water-choice="bonded">1 — H₂O (bonded)</button>
        <button class="add-popup-item" data-water-choice="separated">2 — 2H + O (separated)</button>
        <button class="add-popup-item" data-water-choice="bonding">3 — Simulate bonding</button>
        <button class="add-popup-item" data-water-choice="electrolysis">4 — Electrolysis (split H₂O)</button>
      </div>
    `;
    this.isOpen = true;
    this.el.style.display = 'block';
    const maxX = Math.max(10, window.innerWidth - this.el.offsetWidth - 10);
    const maxY = Math.max(10, window.innerHeight - this.el.offsetHeight - 10);
    this.el.style.left = `${Math.max(10, Math.min(x, maxX))}px`;
    this.el.style.top = `${Math.max(10, Math.min(y, maxY))}px`;
  }

  createWaterChoice(choice) {
    if (choice === 'electrolysis') {
      this.editor.sceneManager.createWaterElectrolysisSimulation();
      this.close();
      return;
    }
    const options = {
      subatomic: true,
      orbitalDynamics: true,
      unbonded: choice !== 'bonded',
      bondingAnimation: choice === 'bonding'
    };
    this.editor.sceneManager.createMolecule('water', options);
    this.close();
  }

  close() {
    this.isOpen = false;
    this.el.style.display = 'none';
    this.menuMode = 'compounds';
    this.el.innerHTML = this.defaultContent;
  }
}
