import './style.css';
import { Editor } from './core/Editor.js';

window.addEventListener('DOMContentLoaded', () => {
  const appContainer = document.getElementById('app');
  if (appContainer) {
    const editor = new Editor(appContainer);
    window.electroDesignerEditor = editor;
  }
});
