export class PreferencesModal {
  constructor(editor) {
    this.editor = editor;
    this.isOpen = false;

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'electroDesigner-modal-overlay';
    this.overlay.style.display = 'none';

    this.overlay.innerHTML = `
      <div class="electroDesigner-modal-window">
        <div class="modal-header">
          <span class="modal-title">Preferences</span>
          <button class="modal-close-btn">&times;</button>
        </div>

        <div class="modal-body">
          <div class="pref-section">
            <h4 class="pref-heading">Input & Navigation</h4>
            
            <label class="pref-checkbox-row active-feature">
              <input type="checkbox" id="pref-emulate-3btn" ${this.editor.navigation.emulate3ButtonMouse ? 'checked' : ''}>
              <div class="pref-label-desc">
                <strong>Emulate 3 Button Mouse (Active)</strong>
                <p>Use standard trackpad or mouse without dedicated middle click:</p>
                <ul class="pref-list">
                  <li><b>Alt + Left Mouse Drag</b>: Orbit / Rotate 3D Viewport</li>
                  <li><b>Shift + Alt + Left Mouse Drag</b>: Pan Viewport</li>
                  <li><b>Ctrl + Alt + Left Mouse Drag</b>: Smooth Zoom / Dolly</li>
                </ul>
              </div>
            </label>

            <label class="pref-checkbox-row">
              <input type="checkbox" id="pref-emulate-numpad" ${this.editor.navigation.emulateNumpad ? 'checked' : ''}>
              <div class="pref-label-desc">
                <strong>Emulate Numpad</strong>
                <p>Use top-row number keys (1, 3, 7, 5) to switch Front, Right, Top, and Ortho views.</p>
              </div>
            </label>
          </div>

          <div class="pref-section">
            <h4 class="pref-heading">Sensitivities</h4>
            <div class="pref-slider-row">
              <label>Orbit Sensitivity</label>
              <input type="range" min="0.001" max="0.015" step="0.0005" id="pref-orbit-speed" value="${this.editor.navigation.orbitSpeed}">
            </div>
            <div class="pref-slider-row">
              <label>Pan Sensitivity</label>
              <input type="range" min="0.0005" max="0.005" step="0.0005" id="pref-pan-speed" value="${this.editor.navigation.panSpeed}">
            </div>
            <div class="pref-slider-row">
              <label>Zoom Sensitivity</label>
              <input type="range" min="0.001" max="0.01" step="0.0005" id="pref-zoom-speed" value="${this.editor.navigation.zoomSpeed}">
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="electroDesigner-action-btn primary" id="modal-btn-done">Save Preferences</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
  }

  bindEvents() {
    this.overlay.querySelector('.modal-close-btn').addEventListener('click', () => this.close());
    this.overlay.querySelector('#modal-btn-done').addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    const emuCheck = this.overlay.querySelector('#pref-emulate-3btn');
    emuCheck.addEventListener('change', (e) => {
      this.editor.navigation.emulate3ButtonMouse = e.target.checked;
    });

    const numCheck = this.overlay.querySelector('#pref-emulate-numpad');
    numCheck.addEventListener('change', (e) => {
      this.editor.navigation.emulateNumpad = e.target.checked;
    });

    const orbitInput = this.overlay.querySelector('#pref-orbit-speed');
    orbitInput.addEventListener('input', (e) => {
      this.editor.navigation.orbitSpeed = parseFloat(e.target.value);
    });

    const panInput = this.overlay.querySelector('#pref-pan-speed');
    panInput.addEventListener('input', (e) => {
      this.editor.navigation.panSpeed = parseFloat(e.target.value);
    });

    const zoomInput = this.overlay.querySelector('#pref-zoom-speed');
    zoomInput.addEventListener('input', (e) => {
      this.editor.navigation.zoomSpeed = parseFloat(e.target.value);
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
