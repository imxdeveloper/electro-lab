import { Icons } from '../utils/Icons.js';

export class TimelineUI {
  constructor(editor, container) {
    this.editor = editor;
    this.container = container;

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.el = document.createElement('footer');
    this.el.className = 'electroDesigner-timeline';

    this.el.innerHTML = `
      <button class="timeline-collapse-btn" type="button" data-timeline-collapse aria-expanded="true" title="Minimize Timeline">⌄</button>
      <div class="timeline-controls">
        <button id="tl-btn-rewind" class="timeline-btn" title="Jump to Start">${Icons.rewind}</button>
        <button id="tl-btn-prev" class="timeline-btn" title="Previous Frame">${Icons.stepBackward}</button>
        <button id="tl-btn-play" class="timeline-btn play" title="Play / Pause (Space)">${Icons.play}</button>
        <button id="tl-btn-next" class="timeline-btn" title="Next Frame">${Icons.stepForward}</button>

        <div class="timeline-frame-input">
          <label>Frame:</label>
          <input type="number" id="tl-current-frame" min="1" max="250" value="1">
        </div>

        <button id="tl-btn-keyframe" class="timeline-btn keyframe-btn" title="Insert Keyframe (I)">
          ${Icons.keyframe}
          <span>Key</span>
        </button>
      </div>

      <div class="timeline-scrubber-track" id="tl-track">
        <div class="timeline-scrubber-cursor" id="tl-cursor" style="left: 0%;"></div>
        <div class="timeline-keyframes-layer" id="tl-keyframes"></div>
      </div>

      <div class="timeline-range-info">
        <span>1</span>
        <span>250</span>
      </div>
    `;

    this.container.appendChild(this.el);
    this.cursorEl = this.el.querySelector('#tl-cursor');
    this.trackEl = this.el.querySelector('#tl-track');
    this.frameInput = this.el.querySelector('#tl-current-frame');
    this.keyframesLayer = this.el.querySelector('#tl-keyframes');
    this.playBtn = this.el.querySelector('#tl-btn-play');
  }

  bindEvents() {
    const collapseButton = this.el.querySelector('[data-timeline-collapse]');
    collapseButton.addEventListener('click', () => {
      const collapsed = this.el.classList.toggle('timeline-collapsed');
      collapseButton.textContent = collapsed ? '⌃' : '⌄';
      collapseButton.setAttribute('aria-expanded', String(!collapsed));
      collapseButton.title = collapsed ? 'Expand Timeline' : 'Minimize Timeline';
    });

    this.playBtn.addEventListener('click', () => {
      this.editor.animationManager.togglePlay();
    });

    this.el.querySelector('#tl-btn-rewind').addEventListener('click', () => {
      this.editor.animationManager.rewind();
    });

    this.el.querySelector('#tl-btn-prev').addEventListener('click', () => {
      this.editor.animationManager.stepBackward();
    });

    this.el.querySelector('#tl-btn-next').addEventListener('click', () => {
      this.editor.animationManager.stepForward();
    });

    this.el.querySelector('#tl-btn-keyframe').addEventListener('click', () => {
      this.editor.animationManager.insertKeyframe();
    });

    this.frameInput.addEventListener('change', (e) => {
      const f = parseInt(e.target.value) || 1;
      this.editor.animationManager.setFrame(f);
    });

    // Scrubber click & drag
    let isScrubbing = false;
    const scrub = (e) => {
      const rect = this.trackEl.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const frame = Math.round(1 + pct * 249);
      this.editor.animationManager.setFrame(frame);
    };

    this.trackEl.addEventListener('pointerdown', (e) => {
      isScrubbing = true;
      scrub(e);
      this.trackEl.setPointerCapture(e.pointerId);
    });

    window.addEventListener('pointermove', (e) => {
      if (isScrubbing) {
        scrub(e);
      }
    });

    window.addEventListener('pointerup', () => {
      isScrubbing = false;
    });

    // Hooks from AnimationManager
    this.editor.animationManager.onFrameChanged = (f) => {
      this.updateCursor(f);
    };

    this.editor.animationManager.onPlayStateChanged = (isPlaying) => {
      this.playBtn.innerHTML = isPlaying ? Icons.pause : Icons.play;
    };

    this.editor.animationManager.onTracksUpdated = () => {
      this.updateKeyframeMarkers();
    };
  }

  updateCursor(frame) {
    this.frameInput.value = frame;
    const pct = ((frame - 1) / 249) * 100;
    this.cursorEl.style.left = `${pct}%`;
  }

  updateKeyframeMarkers() {
    const active = this.editor.selectionManager.activeObject;
    if (!active) {
      this.keyframesLayer.innerHTML = '';
      return;
    }

    const keyframes = this.editor.animationManager.getKeyframesForObject(active);
    let html = '';

    keyframes.forEach((kf) => {
      const pct = ((kf.frame - 1) / 249) * 100;
      html += `
        <div class="timeline-kf-diamond" style="left: ${pct}%;" title="Keyframe at ${kf.frame}">
          ${Icons.keyframe}
        </div>
      `;
    });

    this.keyframesLayer.innerHTML = html;
  }
}
