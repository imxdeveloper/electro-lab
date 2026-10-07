# Electro Designer Web 3D Editor 🎨

A browser-based 3D workspace for exploring atoms and molecules, building circuit layouts, and modeling objects. Built with Three.js and WebGL, it includes editable 3D objects, viewport navigation, an animation timeline, and an Atom Lab / Circuit Lab workspace switch.

---

## 🚀 How to Run

1. **Quick Launch (Windows)**:
   - Double-click [`start.bat`](file:///c:/Users/SkyLeonK/Desktop/Circuit/AntiGravity/start.bat)
   - Or open terminal in this folder and run:
     ```bash
     npm run dev
     ```
   - Open [http://localhost:3000](http://localhost:3000) in your browser.

2. **Production Pre-built**:
   - The production build is already compiled inside `/dist`.

---

## 🖱️ Navigation: Emulate 3-Button Mouse

As requested, **Emulate 3 Button Mouse** is enabled by default:

| Action | Shortcut | Description |
| :--- | :--- | :--- |
| **Orbit / Rotate View** | <kbd>Alt</kbd> + **Left Click Drag** | Orbit around the 3D pivot point |
| **Pan View** | <kbd>Shift</kbd> + <kbd>Alt</kbd> + **Left Click Drag** | Pan parallel to the camera view plane |
| **Smooth Zoom / Dolly** | <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + **Left Click Drag** | Smoothly zoom in / out by dragging |
| **Step Zoom** | **Mouse Scroll Wheel** | Zoom in / out in discrete steps |
| **Standard Orbit** | **Middle Mouse Button Drag** | MMB drag still works as in classic Electro Designer |

---

## 📐 Viewport & Camera Presets (Emulate Numpad)

| View | Shortcut |
| :--- | :--- |
| **Front View** | <kbd>1</kbd> or <kbd>Numpad 1</kbd> (<kbd>Ctrl+1</kbd> for Back) |
| **Right View** | <kbd>3</kbd> or <kbd>Numpad 3</kbd> (<kbd>Ctrl+3</kbd> for Left) |
| **Top View** | <kbd>7</kbd> or <kbd>Numpad 7</kbd> (<kbd>Ctrl+7</kbd> for Bottom) |
| **Perspective / Orthographic** | <kbd>5</kbd> or <kbd>Numpad 5</kbd> |
| **Frame / Focus Selected** | <kbd>.</kbd> (Period) or <kbd>F</kbd> |
| **Frame All Objects** | <kbd>Home</kbd> |

---

## 🛠️ Electro Designer Modal Transforms (<kbd>G</kbd>, <kbd>R</kbd>, <kbd>S</kbd>)

Select any object and press:
- **<kbd>G</kbd>** – **Grab / Move**
- **<kbd>R</kbd>** – **Rotate**
- **<kbd>S</kbd>** – **Scale**

### Axis Constraints during Grab/Rotate/Scale:
- Press **<kbd>X</kbd>**, **<kbd>Y</kbd>**, or **<kbd>Z</kbd>** to lock movement strictly to that axis.
- Press **<kbd>Shift+X</kbd>**, **<kbd>Shift+Y</kbd>**, or **<kbd>Shift+Z</kbd>** to lock to a plane (e.g. XY plane).
- **Left Click** or **<kbd>Enter</kbd>** to confirm the transform.
- **Right Click** or **<kbd>Esc</kbd>** to cancel and restore original position.

---

## ↶ 100-Step Undo & Redo (<kbd>Ctrl + Z</kbd> / <kbd>Ctrl + Y</kbd>)

The editor maintains a history stack of **up to 100 steps** for all operations:
- **Undo**: Press <kbd>Ctrl + Z</kbd>
- **Redo**: Press <kbd>Ctrl + Y</kbd> or <kbd>Ctrl + Shift + Z</kbd>
- A live toast notification appears in the lower left corner showing the action name and history count (e.g. `Undo: Move Cube (14 / 100)`).
- **Supported Operations**:
  - Gizmo and modal transformations (Move, Rotate, Scale)
  - Adding primitives and lights
  - Deleting objects (<kbd>X</kbd>, <kbd>Delete</kbd>)
  - Duplicating objects (<kbd>Shift + D</kbd>)
  - Material changes (Color, Roughness, Metallic)
  - Modifiers (Add, Remove, Apply)
  - Edit Mode vertex modifications (Extrude, Subdivide)

---

## 🌟 Key Features

1. **Interactive 3D Navigation Gizmo**:
   - Interactive XYZ orientation widget in top-right corner. Click any axis ball to snap view.
   - Zoom tool, Pan tool, Camera focus tool, and Ortho/Persp toggle buttons.

2. **Electro Designer Startup Scene**:
   - Classic default Cube, Point Light, and Camera on a 3D floor grid with red X and green Y axes.
   - Interactive 3D Cursor (<kbd>Shift + RMB</kbd>).

3. **Add Menu (<kbd>Shift + A</kbd>)**:
   - Mesh primitives: Cube, UV Sphere, Cylinder, Cone, Torus, Plane, and **Monkey (Suzanne)**!
   - Lights: Sun Light, Point Light, Spot Light.

4. **Object & Edit Modes (<kbd>Tab</kbd>)**:
   - Press <kbd>Tab</kbd> to enter **Edit Mode**.
   - Select individual vertices with glowing vertex points.
   - Extrude vertices (<kbd>E</kbd>) and subdivide geometry.

5. **Electro Designer Modifier Stack**:
   - Non-destructive modifiers on meshes:
     - **Subdivision Surface** (Catmull-Clark smoothing)
     - **Wireframe**
     - **Mirror** (across X, Y, or Z)
     - **Array** (repeat copies with offset)
   - "Apply" modifier to bake into base geometry permanently.

6. **Principled BSDF Material Shader**:
   - Base Color, Roughness, Metallic, Wireframe rendering, and Flat/Smooth normal shading.

7. **Animation & Timeline**:
   - Scrubbable 250-frame animation timeline.
   - Press **<kbd>I</kbd>** to insert keyframes (Location, Rotation, Scale).
   - <kbd>Spacebar</kbd> to Play / Pause with automatic interpolation.

8. **Export & Import**:
   - Export models to **GLTF / GLB**, **OBJ**, and **STL**.
   - Drag & drop 3D files directly into the viewport or use File → Import.
=======
# Electro-Lab for EveryOne
Electro Lab is 3D design tool for matter and logic on Web UI for everyone 
