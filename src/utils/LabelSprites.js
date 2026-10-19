import * as THREE from 'three';

// Small text labels for the 3D viewport. One canvas per label, reused when the
// text changes so labels can be updated without reallocating textures.

const FONT = 'bold 44px monospace';
const WIDTH = 384;
const HEIGHT = 72;

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}

export function createLabel(text, options = {}) {
  const canvas = makeCanvas();
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: options.depthTest ?? false,
    depthWrite: false,
    sizeAttenuation: true
  }));
  sprite.userData.label = { canvas, context, texture };
  sprite.scale.set(options.width ?? 2.2, (options.width ?? 2.2) * (HEIGHT / WIDTH), 1);
  setLabel(sprite, text, options.color);
  return sprite;
}

export function setLabel(sprite, text, color = '#dff3ff') {
  const { canvas, context, texture } = sprite.userData.label ?? {};
  if (!context) return;
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.font = FONT;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  // A dark plate keeps text readable over bright artwork.
  context.fillStyle = 'rgba(8, 12, 20, 0.72)';
  context.fillRect(0, 8, WIDTH, HEIGHT - 16);
  context.fillStyle = color;
  context.fillText(String(text), WIDTH / 2, HEIGHT / 2);
  texture.needsUpdate = true;
}

export function disposeLabel(sprite) {
  sprite.userData.label?.texture?.dispose();
  sprite.material?.dispose?.();
}