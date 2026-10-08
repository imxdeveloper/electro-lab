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

## 🧩 Mask Lab

Mask Lab adds a 10 nm × 10 nm pixel-resolution drafting workspace for custom lithography masks.

- Open the workspace selector and choose **Mask Lab**.
- Draw and erase individual pixels on a square grid.
- Each pixel represents a 10 nm square, so a 64 × 64 mask covers 640 nm × 640 nm.
- **Auto-fill from Chip Lab** rasterizes the current schematic's component outlines and routed connections onto the mask grid and records the source design with the export.
- Chip Lab includes fixed V+ (logic HIGH) and GND (logic LOW) source terminals, with a wiring check for missing rails and both sources driving the same input.
- V+ / GND checks are digital-schematic checks only; they do not model voltage, current, physical copper continuity, or electrical safety. The auto-filled mask is a schematic raster preview, not a fabrication-ready chip layout.
- Export the current mask as JSON for reuse or downstream tooling.
- Use **Training** for four guided exercises: a single feature, a parallel line pair, a square frame, and a 4 × 4 array. Exact mask checks, hints, scores, and completion progress are saved in the browser. Training preserves and restores the mask you were editing.

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
   - Use **View → Animation Timeline** to show or hide the bottom timeline.
   - The View menu controls the tool shelf, Properties / Outliner sidebar, viewport information, navigation gizmo, Circuit Lab tools, Design Library, Board Tools, and Code Editor. Use **Show All Panels** to restore the main workspace panels.

8. **Export & Import**:
   - Export models to **GLTF / GLB**, **OBJ**, and **STL**.
   - Drag & drop 3D files directly into the viewport or use File → Import.

9. **Chip Lab — Digital Logic Design**:
   - Choose **Chip Lab** from the workspace selector to open a dedicated schematic editor.
   - Build with scalar Boolean gates, constants, clock sources, rising-edge D/SR flip-flops, bus registers, enabled counters, clock dividers, and a four-word synchronous RAM.
   - Use 2/4/8-bit bus inputs and outputs, splitters/joiners, bitwise logic, multiplexers, adders with carry-in/out, comparators, and configurable 2-to-4, 3-to-8, or 4-to-16 decoders. Bus connections must match in width; splitter bit 0 is the least-significant bit.
   - Simulate combinational logic live, manually pulse or automatically run clocked logic, set the clock period, and inspect signal waveforms (up to 48 captured transitions).
   - Use the clock-edge debugger to step one rising edge at a time, inspect register/counter/RAM state, pause automatic clocking, and review the latest state changes. Add signal watches from the component inspector and set sequential breakpoints to pause automatic clocking when a component changes state. Click a waveform row or watch entry to select its component on the schematic.
   - Run circuit checks for floating inputs, undriven outputs, incompatible nets, unresolved feedback, and unused logic. **Undo/Redo** restores the schematic, project identity, and its test bench. Search the **Find** box for component names, types, or signal labels to select and focus an item. Multi-select components to align or evenly distribute them, or drag a selected component to move the group together. Use **Tidy**, **Fit view**, mouse-wheel zoom, and middle/right-drag pan to edit and navigate schematics. Add design notes to components, optionally auto-name new nets, and follow signal direction arrows. Select wires to assign labels, curved/orthogonal/straight routing, and signal probes; probed wires focus the waveform viewer.
   - Copy and paste selected components with **Ctrl+C / Ctrl+V** (including connections internal to a multi-selection). Toggle **Snap: On/Off** to move components on or off the 20-unit design grid.
   - Create persistent test benches with input vectors, expected outputs, and optional clock edges. Generate exhaustive vectors for combinational designs up to 10 input bits, seeded randomized vectors, or bus boundary patterns; generated expected values start from the current design output and can be edited. Run the bench to compare expected and actual values in a per-vector pass/fail results table, review distinct-input coverage, and export test results as CSV. Re-import an exported CSV to append its input vectors, expected outputs, and clock markers to the current bench; rows and bus widths are validated before any vectors are added.
   - Capture signal transitions in the waveform viewer and export them as VCD (Value Change Dump) for inspection in external waveform viewers. The exported trace uses 1 ms sample steps and contains captured simulation samples only.
   - Create reusable combinational subcircuits from a selected closed block, edit their internals, and nest saved reusable chips.
   - Save up to 20 named local projects in browser storage and reopen or delete them from **Projects**.
   - Build a one-hot finite-state machine by listing states and guarded transitions (`FROM, SIGNAL, TO`; use `*` for unconditional transitions). The builder generates D flip-flops, state output pins, and combinational next-state logic; every transition advances on a rising clock edge.
   - Reference examples include half/full adders, an enabled 4-bit counter, a traffic-light state machine, a 4-bit accumulator, and a synchronous 4 × 4 RAM demonstration.
   - The **Learning path** provides five guided challenges: AND logic, half adders, bus multiplexers, decoders, and clocked registers. Starting a challenge loads unwired components; progressive hints are optional, and the circuit checker records attempts, best scores, and completion locally. Pass a challenge to jump directly into the next one.
   - Import/export editable `.chip.json` designs for sharing. Version 4 includes component state, RAM contents, test benches, and wire labels/routing; versions 1–3 remain importable.
   - Import a deliberately limited Verilog subset: one module with a plain port list, separate scalar or 2/4/8-bit declarations, and continuous assignments using Boolean/vector operators, literals, and conditional expressions. Sequential `always` blocks, ANSI-style port declarations, and general Verilog are not supported. Export supports only combinational designs and reports unsupported components instead of silently omitting them.
   - Clocked behavior is a functional digital-logic simulation, not a physical silicon, propagation-delay, or electrical model.
=======
# Functions For Fun
 - Use Shift + Q function to find subatomic compounds 
 - Use Shift + W function to find conductive elements 
 - Use Shift + E function to find electiric field atom
 - Use Shift + R function to find more subatomic compounds with another functions
 - Use Shift + T function to hide UI sidetab
 - Use Shift + O function to find more fun things
 - Use Shift + S function to add solar panel
 - Use Shift + B function to see what is right hand rule 

You can also add more fun things using more keys with ctrl + any or shift + something you might change anyhow :) Have Fun 

And maybe some Ctrl + or Shits + Something no one knows about :) Try and find out ^^

# Electro-Lab for EveryOne
Electro Lab is 3D design tool for matter and logic on Web UI for everyone 
