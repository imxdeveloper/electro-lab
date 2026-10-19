// Builds a minimal valid GLB (glTF 2.0 binary) containing a single triangle so
// the Chip View GLTF/GLB import path can be exercised in the browser tests.

export function createSampleGlb() {
  // 3 positions (vec3 float) + 3 indices (uint16, padded to 4 bytes).
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const binary = new Uint8Array(positions.byteLength + 8);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), positions.byteLength);

  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: 6, target: 34963 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }
    ]
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunk = new Uint8Array(jsonBytes.length + jsonPadding);
  jsonChunk.set(jsonBytes, 0);
  jsonChunk.fill(0x20, jsonBytes.length);

  const binPadding = (4 - (binary.length % 4)) % 4;
  const binChunk = new Uint8Array(binary.length + binPadding);
  binChunk.set(binary, 0);

  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  glb.set(jsonChunk, 20);
  const binHeader = 20 + jsonChunk.length;
  view.setUint32(binHeader, binChunk.length, true);
  view.setUint32(binHeader + 4, 0x004e4942, true); // 'BIN'
  glb.set(binChunk, binHeader + 8);
  return glb;
}