export class ShortcutsModal {
  constructor() {
    this.isOpen = false;
    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'electroDesigner-modal-overlay';
    this.overlay.style.display = 'none';

    this.overlay.innerHTML = `
      <div class="electroDesigner-modal-window wide">
        <div class="modal-header">
          <span class="modal-title">Keyboard Shortcuts & Navigation</span>
          <button class="modal-close-btn">&times;</button>
        </div>

        <div class="modal-body shortcuts-grid">
          <div class="shortcut-group">
            <h3>Navigation (Emulate 3-Button Mouse)</h3>
            <div class="shortcut-item"><kbd>Alt + LMB Drag</kbd><span>Orbit / Rotate View</span></div>
            <div class="shortcut-item"><kbd>Shift + Alt + LMB</kbd><span>Pan View</span></div>
            <div class="shortcut-item"><kbd>Ctrl + Alt + LMB</kbd><span>Smooth Dolly / Zoom</span></div>
            <div class="shortcut-item"><kbd>Mouse Wheel</kbd><span>Step Zoom In / Out</span></div>
            <div class="shortcut-item"><kbd>MMB Drag</kbd><span>Standard Orbit</span></div>
          </div>

          <div class="shortcut-group">
            <h3>View & Camera Presets</h3>
            <div class="shortcut-item"><kbd>1 / Numpad 1</kbd><span>Front View (Ctrl+1: Back)</span></div>
            <div class="shortcut-item"><kbd>3 / Numpad 3</kbd><span>Right View (Ctrl+3: Left)</span></div>
            <div class="shortcut-item"><kbd>7 / Numpad 7</kbd><span>Top View (Ctrl+7: Bottom)</span></div>
            <div class="shortcut-item"><kbd>5 / Numpad 5</kbd><span>Perspective / Orthographic</span></div>
            <div class="shortcut-item"><kbd>. / Period / F</kbd><span>Frame / Focus Selected</span></div>
            <div class="shortcut-item"><kbd>Home</kbd><span>Frame All Objects</span></div>
          </div>

          <div class="shortcut-group">
            <h3>Modal Transforms (G / R / S)</h3>
            <div class="shortcut-item"><kbd>G</kbd><span>Grab / Move Object</span></div>
            <div class="shortcut-item"><kbd>R</kbd><span>Rotate Object</span></div>
            <div class="shortcut-item"><kbd>S</kbd><span>Scale Object</span></div>
            <div class="shortcut-item"><kbd>X / Y / Z</kbd><span>Lock constraint to Axis</span></div>
            <div class="shortcut-item"><kbd>Enter / LMB</kbd><span>Confirm Transform</span></div>
            <div class="shortcut-item"><kbd>Esc / RMB</kbd><span>Cancel Transform</span></div>
          </div>

          <div class="shortcut-group">
            <h3>Object Operations</h3>
            <div class="shortcut-item"><kbd>Shift + A</kbd><span>Add Menu Popup</span></div>
            <div class="shortcut-item"><kbd>Shift + Q</kbd><span>Atom Lab: Compound Menu · Circuit Lab: Build LED Circuit</span></div>
            <div class="shortcut-item"><kbd>Shift + O</kbd><span>Atom Lab: Water Orbital Coulomb Model</span></div>
            <div class="shortcut-item"><kbd>Shift + E</kbd><span>Atom Lab: Electric Field Atom · Circuit Lab: disabled</span></div>
            <div class="shortcut-item"><kbd>Shift + W</kbd><span>Atom Lab: Conductive Elements Menu · Circuit Lab: disabled</span></div>
            <div class="shortcut-item"><kbd>Shift + S</kbd><span>Atom Lab: Add Solar Cell</span></div>
            <div class="shortcut-item"><kbd>Shift + B</kbd><span>Right-Hand Rule: Copper E-Field & Electron Hole Flow</span></div>
            <div class="shortcut-item"><kbd>Shift + D</kbd><span>Duplicate Object</span></div>
            <div class="shortcut-item"><kbd>X / Delete</kbd><span>Delete Selected Objects</span></div>
            <div class="shortcut-item"><kbd>A / Alt + A</kbd><span>Select All / Deselect All</span></div>
            <div class="shortcut-item"><kbd>H / Alt + H</kbd><span>Hide / Unhide All</span></div>
            <div class="shortcut-item"><kbd>Tab</kbd><span>Toggle Object / Edit Mode</span></div>
          </div>

          <div class="shortcut-group">
            <h3>Interface & Animation</h3>
            <div class="shortcut-item"><kbd>N</kbd><span>Toggle Right Sidebar</span></div>
            <div class="shortcut-item"><kbd>T</kbd><span>Toggle Left Toolbar</span></div>
            <div class="shortcut-item"><kbd>Space</kbd><span>Play / Pause Animation</span></div>
            <div class="shortcut-item"><kbd>I</kbd><span>Insert Keyframe</span></div>
            <div class="shortcut-item"><kbd>Ctrl + Z / Y</kbd><span>Undo / Redo</span></div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="electroDesigner-action-btn primary" id="shortcuts-btn-close">Close (Esc)</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
  }

  bindEvents() {
    this.overlay.querySelector('.modal-close-btn').addEventListener('click', () => this.close());
    this.overlay.querySelector('#shortcuts-btn-close').addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') {
        e.preventDefault();
        this.open();
      } else if (e.code === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  open() {
    this.isOpen = true;
    this.overlay.style.display = 'flex';
  }

  close() {
    this.isOpen = false;
    this.overlay.style.display = 'none';
  }
}
