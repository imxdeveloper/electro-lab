import * as THREE from 'three';

const STORAGE_KEY = 'electroDesigner.codeEditor.source';

export class CodeEditorPanel {
  constructor(editor) {
    this.editor = editor;
    this.createDOM();
    this.bindEvents();
  }

  createDOM() {
    this.el = document.createElement('section');
    this.el.className = 'code-editor-panel';
    this.el.hidden = true;
    this.el.innerHTML = `
      <header class="code-editor-header">
        <div><strong>Code</strong><span>JavaScript · F4</span></div>
        <div class="code-editor-actions">
          <button type="button" data-code-save>Save</button>
          <button type="button" data-code-clear>Clear</button>
          <button type="button" data-code-run>Run</button>
          <button type="button" data-code-close aria-label="Close code editor">×</button>
        </div>
      </header>
      <textarea spellcheck="false" aria-label="JavaScript code editor" autocapitalize="off" autocomplete="off"></textarea>
      <footer data-code-status>Write JavaScript using the editor object, then choose Run.</footer>
    `;
    document.body.appendChild(this.el);
    this.textarea = this.el.querySelector('textarea');
    try {
      this.textarea.value = localStorage.getItem(STORAGE_KEY) ||
        "Code";
    } catch {
      this.textarea.value = "Code";
    }
  }

  bindEvents() {
    this.el.querySelector('[data-code-close]').addEventListener('click', () => this.setOpen(false));
    this.el.querySelector('[data-code-save]').addEventListener('click', () => this.save());
    this.el.querySelector('[data-code-clear]').addEventListener('click', () => {
      this.textarea.value = '';
      this.setStatus('Editor cleared.');
      this.textarea.focus();
    });
    this.el.querySelector('[data-code-run]').addEventListener('click', () => this.run());
    this.textarea.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        this.run();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        this.save();
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        this.textarea.setRangeText('  ', start, end, 'end');
      }
    });
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'F4' || event.repeat) return;
      event.preventDefault();
      this.setOpen(this.el.hidden);
    });
  }

  setOpen(open) {
    this.el.hidden = !open;
    if (open) this.textarea.focus();
  }

  setStatus(message, isError = false) {
    const status = this.el.querySelector('[data-code-status]');
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, this.textarea.value);
      this.setStatus('Code saved in this browser.');
    } catch {
      this.setStatus('Could not save code to browser storage.', true);
    }
  }

  async run() {
    this.setStatus('Running…');
    try {
      const result = await new Function('editor', 'THREE', `"use strict";\n${this.textarea.value}`)(this.editor, THREE);
      this.editor.sceneManager.render();
      this.setStatus(result === undefined ? 'Finished.' : `Finished: ${String(result)}`);
    } catch (error) {
      this.setStatus(`${error.name}: ${error.message}`, true);
      console.error('Code editor script failed:', error);
    }
  }
}
