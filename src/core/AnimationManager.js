import * as THREE from 'three';

export class AnimationManager {
  constructor(sceneManager, selectionManager) {
    this.sceneManager = sceneManager;
    this.selectionManager = selectionManager;

    this.currentFrame = 1;
    this.startFrame = 1;
    this.endFrame = 250;
    this.fps = 30;
    this.isPlaying = false;
    this.lastTime = 0;
    this.frameAccumulator = 0;

    // object.uuid -> Array of keyframes sorted by frame
    // Keyframe: { frame, position: Vector3, quaternion: Quaternion, scale: Vector3 }
    this.tracks = new Map();

    this.onFrameChanged = null;
    this.onPlayStateChanged = null;

    this.animate = this.animate.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);

    window.addEventListener('keydown', this.onKeyDown);
    requestAnimationFrame(this.animate);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    this.isPlaying = false;
  }

  insertKeyframe(obj = null) {
    const target = obj || this.selectionManager.activeObject;
    if (!target) return;

    if (!this.tracks.has(target.uuid)) {
      this.tracks.set(target.uuid, []);
    }

    const keyframes = this.tracks.get(target.uuid);
    const existingIdx = keyframes.findIndex((k) => k.frame === this.currentFrame);

    const kfData = {
      frame: this.currentFrame,
      position: target.position.clone(),
      quaternion: target.quaternion.clone(),
      scale: target.scale.clone()
    };

    if (existingIdx !== -1) {
      keyframes[existingIdx] = kfData;
    } else {
      keyframes.push(kfData);
      keyframes.sort((a, b) => a.frame - b.frame);
    }

    if (this.onTracksUpdated) {
      this.onTracksUpdated();
    }
  }

  getKeyframesForObject(obj) {
    if (!obj || !this.tracks.has(obj.uuid)) return [];
    return this.tracks.get(obj.uuid);
  }

  setFrame(frame) {
    this.currentFrame = Math.max(this.startFrame, Math.min(this.endFrame, Math.round(frame)));
    this.evaluateSceneAtCurrentFrame();

    if (this.onFrameChanged) {
      this.onFrameChanged(this.currentFrame);
    }
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    this.lastTime = performance.now();

    if (this.onPlayStateChanged) {
      this.onPlayStateChanged(this.isPlaying);
    }
  }

  stepForward() {
    let next = this.currentFrame + 1;
    if (next > this.endFrame) next = this.startFrame;
    this.setFrame(next);
  }

  stepBackward() {
    let prev = this.currentFrame - 1;
    if (prev < this.startFrame) prev = this.endFrame;
    this.setFrame(prev);
  }

  rewind() {
    this.setFrame(this.startFrame);
  }

  evaluateSceneAtCurrentFrame() {
    this.tracks.forEach((keyframes, uuid) => {
      const obj = this.sceneManager.objectsList.find((o) => o.uuid === uuid);
      if (!obj || keyframes.length === 0) return;

      if (keyframes.length === 1) {
        obj.position.copy(keyframes[0].position);
        obj.quaternion.copy(keyframes[0].quaternion);
        obj.scale.copy(keyframes[0].scale);
        return;
      }

      // Find surrounding keyframes
      if (this.currentFrame <= keyframes[0].frame) {
        obj.position.copy(keyframes[0].position);
        obj.quaternion.copy(keyframes[0].quaternion);
        obj.scale.copy(keyframes[0].scale);
        return;
      }

      const lastKf = keyframes[keyframes.length - 1];
      if (this.currentFrame >= lastKf.frame) {
        obj.position.copy(lastKf.position);
        obj.quaternion.copy(lastKf.quaternion);
        obj.scale.copy(lastKf.scale);
        return;
      }

      // Linear/slerp interpolation between keyframe i and i+1
      for (let i = 0; i < keyframes.length - 1; i++) {
        const kfA = keyframes[i];
        const kfB = keyframes[i + 1];

        if (this.currentFrame >= kfA.frame && this.currentFrame <= kfB.frame) {
          const range = kfB.frame - kfA.frame;
          const alpha = range === 0 ? 0 : (this.currentFrame - kfA.frame) / range;

          // Smooth interpolation
          obj.position.lerpVectors(kfA.position, kfB.position, alpha);
          obj.quaternion.slerpQuaternions(kfA.quaternion, kfB.quaternion, alpha);
          obj.scale.lerpVectors(kfA.scale, kfB.scale, alpha);
          break;
        }
      }
    });

    if (this.selectionManager) {
      this.selectionManager.updateSelectionVisuals();
    }
  }

  animate(time) {
    if (this.isPlaying) {
      const delta = (time - this.lastTime) / 1000;
      this.lastTime = time;

      this.frameAccumulator += delta;
      const frameDuration = 1 / this.fps;

      while (this.frameAccumulator >= frameDuration) {
        this.frameAccumulator -= frameDuration;
        let next = this.currentFrame + 1;
        if (next > this.endFrame) {
          next = this.startFrame;
        }
        this.currentFrame = next;
        this.evaluateSceneAtCurrentFrame();

        if (this.onFrameChanged) {
          this.onFrameChanged(this.currentFrame);
        }
      }
    } else {
      this.lastTime = time;
    }

    requestAnimationFrame(this.animate);
  }

  onKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      return;
    }

    // Spacebar: Play/Pause animation
    if (e.code === 'Space') {
      e.preventDefault();
      this.togglePlay();
    }

    // I: Insert Keyframe (Electro Designer standard)
    if (e.code === 'KeyI' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      this.insertKeyframe();
    }
  }
}
