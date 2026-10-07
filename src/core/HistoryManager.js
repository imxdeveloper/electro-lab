export class HistoryManager {
  constructor(editor) {
    this.editor = editor;
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 100; // 100 steps of history as requested

    this.initToastUI();
    this.onKeyDown = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
  }

  initToastUI() {
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'electroDesigner-history-toast';
    this.toastEl.style.display = 'none';
    document.body.appendChild(this.toastEl);
    this.toastTimer = null;
  }

  showToast(message, type = 'undo') {
    if (!this.toastEl) return;
    clearTimeout(this.toastTimer);

    const icon = type === 'undo' ? '↶' : '↷';
    this.toastEl.innerHTML = `
      <span class="history-toast-icon">${icon}</span>
      <span class="history-toast-msg">${message}</span>
      <span class="history-toast-count">${this.undoStack.length} / ${this.maxHistory}</span>
    `;
    this.toastEl.style.display = 'flex';
    this.toastEl.classList.add('visible');

    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('visible');
      setTimeout(() => {
        if (!this.toastEl.classList.contains('visible')) {
          this.toastEl.style.display = 'none';
        }
      }, 250);
    }, 1400);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.toastEl && this.toastEl.parentNode) {
      this.toastEl.parentNode.removeChild(this.toastEl);
    }
  }

  /**
   * Pushes a new action state onto the undo stack.
   * Maintains up to 100 steps.
   */
  pushState(actionName, undoFn, redoFn) {
    this.undoStack.push({
      name: actionName,
      undo: undoFn,
      redo: redoFn
    });

    // Enforce 100 steps limit
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    // New action invalidates redo stack
    this.redoStack = [];

    if (this.editor.onHistoryChanged) {
      this.editor.onHistoryChanged();
    }
  }

  undo() {
    if (this.undoStack.length === 0) {
      this.showToast('Nothing to Undo', 'undo');
      return;
    }

    const action = this.undoStack.pop();
    try {
      action.undo();
      this.redoStack.push(action);
      this.showToast(`Undo: ${action.name}`, 'undo');
    } catch (err) {
      console.error('Failed to undo action:', action.name, err);
    }

    if (this.editor.onHistoryChanged) {
      this.editor.onHistoryChanged();
    }
  }

  redo() {
    if (this.redoStack.length === 0) {
      this.showToast('Nothing to Redo', 'redo');
      return;
    }

    const action = this.redoStack.pop();
    try {
      action.redo();
      this.undoStack.push(action);
      this.showToast(`Redo: ${action.name}`, 'redo');
    } catch (err) {
      console.error('Failed to redo action:', action.name, err);
    }

    if (this.editor.onHistoryChanged) {
      this.editor.onHistoryChanged();
    }
  }

  onKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      return;
    }

    // Ctrl + Z = Undo
    // Ctrl + Shift + Z OR Ctrl + Y = Redo
    if (e.ctrlKey && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
    } else if (e.ctrlKey && e.code === 'KeyY') {
      e.preventDefault();
      this.redo();
    }
  }
}

