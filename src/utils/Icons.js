// Electro Designer interface icons
export const Icons = {
  electroDesignerLogo: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ea7600" stroke-width="1.6">
      <ellipse cx="12" cy="12" rx="10" ry="3.8"/>
      <ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(60 12 12)"/>
      <ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(120 12 12)"/>
      <circle cx="12" cy="12" r="2" fill="#fff" stroke="none"/>
    </svg>`,

  selectBox: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/>
      <path d="M7 7l5 12 2-5 5-2L7 7z" fill="currentColor" stroke="none"/>
    </svg>`,

  cursor: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
      <circle cx="12" cy="12" r="7" stroke="#ea5545" stroke-dasharray="3 3"/>
      <circle cx="12" cy="12" r="7" stroke="#ffffff" stroke-dasharray="3 3" stroke-dashoffset="3"/>
      <line x1="12" y1="2" x2="12" y2="7" stroke="#ffffff"/>
      <line x1="12" y1="17" x2="12" y2="22" stroke="#ffffff"/>
      <line x1="2" y1="12" x2="7" y2="12" stroke="#ffffff"/>
      <line x1="17" y1="12" x2="22" y2="12" stroke="#ffffff"/>
      <circle cx="12" cy="12" r="1.5" fill="#ea5545"/>
    </svg>`,

  move: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3"/>
      <path d="M2 12h20M12 2v20"/>
    </svg>`,

  rotate: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19"/>
    </svg>`,

  scale: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 3l-6 6M21 3h-6M21 3v6M3 21l6-6M3 21h6M3 21v-6"/>
      <rect x="8" y="8" width="8" height="8" rx="1" stroke-dasharray="2 2"/>
    </svg>`,

  transform: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 3v18M3 12h18"/>
      <rect x="10" y="10" width="4" height="4" fill="currentColor"/>
    </svg>`,

  extrude: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M4 16l8-4 8 4-8 4-8-4z"/>
      <path d="M4 10l8-4 8 4-8 4-8-4z" stroke-dasharray="2 2"/>
      <line x1="12" y1="12" x2="12" y2="4"/>
      <path d="M9 6l3-3 3 3"/>
    </svg>`,

  inset: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <rect x="7" y="7" width="10" height="10" rx="1"/>
    </svg>`,

  bevel: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4 20h8l8-8V4H12L4 12v8z"/>
      <line x1="12" y1="4" x2="4" y2="12"/>
      <line x1="20" y1="12" x2="12" y2="20"/>
    </svg>`,

  subdivide: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="12" y1="3" x2="12" y2="21"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
    </svg>`,

  shadingWireframe: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="8"/>
      <path d="M12 4c2.5 2.5 4 5 4 8s-1.5 5.5-4 8c-2.5-2.5-4-5-4-8s1.5-5.5 4-8z"/>
      <line x1="4" y1="12" x2="20" y2="12"/>
    </svg>`,

  shadingSolid: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity="0.25"/>
      <path d="M12 4a8 8 0 0 1 8 8 8 8 0 0 1-8 8V4z" fill="currentColor"/>
    </svg>`,

  shadingMaterial: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <circle cx="12" cy="12" r="8" fill="#e68523"/>
      <circle cx="9" cy="9" r="2.5" fill="#ffffff" fill-opacity="0.8"/>
    </svg>`,

  shadingRendered: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="8" fill="currentColor"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>`,

  eye: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`,

  eyeOff: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>`,

  lock: `
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>`,

  unlock: `
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
    </svg>`,

  meshIcon: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#e68523" stroke-width="2">
      <polygon points="12 2 2 8 12 14 22 8 12 2"/>
      <polygon points="2 8 2 16 12 22 12 14 2 8"/>
      <polygon points="22 8 22 16 12 22 12 14 22 8"/>
    </svg>`,

  lightIcon: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffcc00" stroke-width="2">
      <circle cx="12" cy="12" r="5" fill="#ffcc00" fill-opacity="0.3"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>`,

  cameraIcon: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#60a5fa" stroke-width="2">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>`,

  wrench: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>`,

  material: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#e68523" stroke-width="2">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 3a9 9 0 0 1 9 9c0 4.97-4.03 9-9 9" fill="#e68523" fill-opacity="0.4"/>
    </svg>`,

  world: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#a78bfa" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>`,

  scene: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>`,

  play: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>`,

  pause: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg>`,

  rewind: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <polygon points="11 19 2 12 11 5 11 19"/>
      <polygon points="22 19 13 12 22 5 22 19"/>
    </svg>`,

  stepForward: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <polygon points="5 4 15 12 5 20 5 4"/>
      <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"/>
    </svg>`,

  stepBackward: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <polygon points="19 20 9 12 19 4 19 20"/>
      <line x1="5" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="2"/>
    </svg>`,

  keyframe: `
    <svg viewBox="0 0 24 24" width="14" height="14" fill="#ffcc00">
      <polygon points="12 2 22 12 12 22 2 12 12 2"/>
    </svg>`,

  magnet: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M6 3v7a6 6 0 0 0 12 0V3"/>
      <line x1="6" y1="6" x2="10" y2="6"/>
      <line x1="14" y1="6" x2="18" y2="6"/>
    </svg>`,

  trash: `
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`,

  plus: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`,

  settings: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>`,

  help: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`,

  zoom: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="11" y1="8" x2="11" y2="14"/>
      <line x1="8" y1="11" x2="14" y2="11"/>
    </svg>`,

  panHand: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 11V6a2 2 0 0 0-4 0v5"/>
      <path d="M14 10V4a2 2 0 0 0-4 0v7"/>
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>
      <path d="M18 8a2 2 0 0 1 4 4v4a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6.2-2.8L3 17.5a2 2 0 0 1 3-2.6l1 1V6a2 2 0 0 1 4 0"/>
    </svg>`,

  orthoPersp: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>`,

  selectVertex: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <rect x="9" y="9" width="6" height="6" rx="1"/>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/>
    </svg>`,

  selectEdge: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="4" y1="20" x2="20" y2="4"/>
      <circle cx="4" cy="20" r="2.5" fill="currentColor"/>
      <circle cx="20" cy="4" r="2.5" fill="currentColor"/>
    </svg>`,

  selectFace: `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <polygon points="4 6 20 4 18 18 6 20" fill="currentColor" fill-opacity="0.4" stroke="currentColor" stroke-width="1.8"/>
      <circle cx="12" cy="12" r="2" fill="currentColor"/>
    </svg>`
};
