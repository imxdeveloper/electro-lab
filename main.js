// Main entry point for AntiGravity 3D Editor using Three.js
// Enhanced version: Includes Grid Helper and Particle System simulation for energy flow.

import * as THREE from 'three';
// NOTE: Assuming OrbitControls is correctly installed/bundled
let camera, scene, renderer, controls, object, gridHelper, particles;

function init() {
    // --- SCENE SETUP ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050814); // Deeper space/circuit background

    // 1. ADD GROUND GRID (Editor feature)
    const size = 20;
    const divisions = 20;
    gridHelper = new THREE.GridHelper(size, divisions, 0x333366, 0x333333);
    scene.add(gridHelper);

    // --- CAMERA SETUP ---
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 8, 25); // Pull camera back to see the full grid

    // --- RENDERER SETUP ---
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // Better quality on high-DPI screens
    document.getElementById('app').appendChild(renderer.domElement);

    // --- INTERACTIVITY & CONTROLS ---
    try {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 1, 0); 
        controls.update();
    } catch (e) {
        console.warn("Could not initialize OrbitControls.");
    }

    // --- OBJECT CREATION (The Anti-Gravity Core) ---
    const geometry = new THREE.TorusGeometry(2, 1, 16, 100); 
    const material = new THREE.MeshStandardMaterial({ color: 0x4c8dff, emissive: 0x1a29ff, emissiveIntensity: 0.7 }); // Increased glow
    object = new THREE.Mesh(geometry, material);
    scene.add(object);

    // --- PARTICLE SYSTEM (Energy Flow Simulation) ---
    const particleGeometry = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < 500; i++) {
        // Spread particles in a sphere/circuit pattern around the origin
        vertices.push((Math.random() * 2 - 1) * 4); // x: -4 to 4
        vertices.push((Math.random() * 2 - 1) * 4); // y
        vertices.push(Math.random() * 5 - 2.5);     // z: -2.5 to 2.5
    }
    particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    const particleMaterial = new THREE.PointsMaterial({ 
        color: 0x8dff4c, // Green/Cyan energy color
        size: 0.15,
        blending: THREE.AdditiveBlending, // Makes particles glow when overlapping
        transparent: true,
        opacity: 0.7
    });
    particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);


    // --- LIGHTING (Atmosphere enhancement) ---
    const ambientLight = new THREE.AmbientLight(0x4444ff, 1); // Subtle blue ambiance
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5); // Stronger key light
    directionalLight.position.set(10, 20, 15);
    scene.add(directionalLight);


    // --- EVENT HANDLERS & ANIMATION START ---
    window.addEventListener('resize', onWindowResize);

    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/** The core animation loop: called repeatedly by requestAnimationFrame */
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now() * 0.001;

    // --- Object Movement (Anti-Gravity Core) ---
    object.rotation.x += 0.005;
    object.rotation.y += 0.008;
    
    // Enhanced Oscillation: More complex movement pattern
    const baseHeight = 1 + Math.sin(time * 0.8) * 0.6; // Vertical oscillation increased range
    object.position.y = baseHeight;
    object.position.x = Math.cos(time * 0.7) * 3;  // Horizontal drift slightly changed frequency

    // --- Particle System Update (Energy Flow Simulation) ---
    const positions = particles.geometry.attributes.position.array;
    for (let i = 0; i < 500; i++) {
        const pX = positions[i * 3];
        const pY = positions[i * 3 + 1];
        const pZ = positions[i * 3 + 2];

        // Simulate flow: Particles drift slightly away from the object's current center
        let dx = (Math.sin(pX*0.5 + time*2) * 0.1);
        let dy = Math.cos(pY*0.5 + time*3) * 0.1;
        let dz = Math.sin(pZ*0.5 + time*4) * 0.1;

        // Apply a slight attraction/repulsion force based on the object's position
        const attractorForceX = (object.position.x - pX) * 0.001;
        const attractorForceY = (object.position.y - pY) * 0.001;

        positions[i * 3] += dx + attractorForceX;
        positions[i * 3 + 1] += dy + attractorForceY;
        positions[i * 3 + 2] += dz;
    }
    particles.geometry.attributes.position.needsUpdate = true;


    // --- Rendering ---
    controls?.update();
    renderer.render(scene, camera);
}

init();