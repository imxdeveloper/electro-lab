import { Icons } from '../utils/Icons.js';

export class Outliner {
  constructor(editor, container) {
    this.editor = editor;
    this.container = container;

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.el = document.createElement('div');
    this.el.className = 'electroDesigner-outliner-panel';

    this.el.innerHTML = `
      <div class="outliner-header">
        <span class="outliner-title">Scene Collection</span>
        <button id="outliner-btn-collapse" class="outliner-collapse-btn" type="button" aria-expanded="true" title="Minimize Scene Collection">−</button>
        <button id="outliner-btn-add" class="outliner-icon-btn" title="Add Object (Shift+A)">
          ${Icons.plus}
        </button>
      </div>

      <div class="outliner-tree" id="outliner-tree">
        <!-- Rendered items -->
      </div>
    `;

    this.container.appendChild(this.el);
    this.treeEl = this.el.querySelector('#outliner-tree');
  }

  bindEvents() {
    const collapseButton = this.el.querySelector('#outliner-btn-collapse');
    collapseButton.addEventListener('click', () => {
      const collapsed = this.el.classList.toggle('outliner-collapsed');
      collapseButton.textContent = collapsed ? '+' : '−';
      collapseButton.setAttribute('aria-expanded', String(!collapsed));
      collapseButton.title = collapsed ? 'Expand Scene Collection' : 'Minimize Scene Collection';
    });

    const addBtn = this.el.querySelector('#outliner-btn-add');
    addBtn.addEventListener('click', (e) => {
      const rect = addBtn.getBoundingClientRect();
      this.editor.addMenuModal.openAt(rect.left - 150, rect.bottom + 5);
    });

    this.treeEl.addEventListener('click', (e) => {
      const row = e.target.closest('.outliner-item');
      if (!row) return;

      const uuid = row.dataset.uuid;
      const obj = this.editor.sceneManager.objectsList.find((o) => o.uuid === uuid);
      if (!obj) return;

      // Eyeball toggle
      const eyeBtn = e.target.closest('.outliner-eye-btn');
      if (eyeBtn) {
        e.stopPropagation();
        obj.visible = !obj.visible;
        if (!obj.visible && this.editor.selectionManager.activeObject === obj) {
          this.editor.selectionManager.clearSelection();
        }
        this.update();
        return;
      }

      // Delete button
      const trashBtn = e.target.closest('.outliner-trash-btn');
      if (trashBtn) {
        e.stopPropagation();
        this.editor.sceneManager.removeObject(obj);
        return;
      }

      // Select object
      this.editor.selectionManager.select(obj, e.shiftKey);
      this.update();
    });

    // Rename on double-click
    this.treeEl.addEventListener('dblclick', (e) => {
      const nameSpan = e.target.closest('.outliner-item-name');
      if (!nameSpan) return;

      const row = nameSpan.closest('.outliner-item');
      const uuid = row.dataset.uuid;
      const obj = this.editor.sceneManager.objectsList.find((o) => o.uuid === uuid);
      if (!obj) return;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'outliner-rename-input';
      input.value = obj.name;

      const finishRename = () => {
        const val = input.value.trim();
        if (val) {
          obj.name = val;
        }
        this.update();
        if (this.editor.propertiesPanel) {
          this.editor.propertiesPanel.update();
        }
      };

      input.addEventListener('blur', finishRename);
      input.addEventListener('keydown', (ke) => {
        if (ke.code === 'Enter') {
          input.blur();
        } else if (ke.code === 'Escape') {
          input.value = obj.name;
          input.blur();
        }
      });

      nameSpan.replaceWith(input);
      input.focus();
      input.select();
    });
  }

  update() {
    if (!this.treeEl) return;

    const objects = this.editor.sceneManager.objectsList.filter(
      (o) => !o.name.startsWith('__')
    );

    const activeObj = this.editor.selectionManager.activeObject;
    const selectedSet = this.editor.selectionManager.selectedObjects;

    let html = `
      <div class="outliner-collection-root">
        <span class="collection-folder-icon">📁</span>
        <span class="collection-name">Collection</span>
      </div>
      <div class="outliner-items-list">
    `;

    objects.forEach((obj) => {
      const isSelected = selectedSet.has(obj);
      const isActive = activeObj === obj;

      let typeIcon = Icons.meshIcon;
      if (obj.isLight) typeIcon = Icons.lightIcon;
      else if (obj.isCamera || obj.name.toLowerCase().includes('camera')) typeIcon = Icons.cameraIcon;

      const eyeIcon = obj.visible ? Icons.eye : Icons.eyeOff;

      html += `
        <div class="outliner-item ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}" data-uuid="${obj.uuid}">
          <span class="outliner-item-icon">${typeIcon}</span>
          <span class="outliner-item-name" title="Double click to rename">${obj.name}</span>
          <div class="outliner-actions">
            <button class="outliner-eye-btn" title="Toggle Visibility">${eyeIcon}</button>
            <button class="outliner-trash-btn" title="Delete Object">${Icons.trash}</button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    this.treeEl.innerHTML = html;
  }
}
