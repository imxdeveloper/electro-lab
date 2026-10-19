# Electro Designer Web 3D Editor 🎨

A browser-based 3D workspace for exploring atoms and molecules, building circuit layouts, and modeling objects. Built with Three.js and WebGL, it includes editable 3D objects, viewport navigation, an animation timeline, and an Atom Lab / Chip View / Circuit Lab workspace switch.

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

3. **Checks**:
   - Run unit tests with `npm test` and a production build with `npm run build`.
   - Install the Playwright Chromium browser once with `npx playwright install chromium`, then run the browser workflow checks with `npm run test:browser`.

---

## 🧩 Mask Lab

Mask Lab provides separate SKY130, GF180MCU, and process-agnostic educational profiles, each with independent editable layer masks. The 10 nm × 10 nm grid is an editor display raster, not a PDK manufacturing grid.

- Open the workspace selector and choose **Mask Lab**.
- Switch between the three technology sub-tabs and select a process layer from its layer stack; pixel data is maintained independently for each profile and layer.
- Draw and erase individual pixels on a square grid.
- Use the arrow keys to move between pixels and Enter or Space to toggle a pixel; only the focused pixel participates in Tab navigation.
- The educational profile uses 10 nm editor-raster cells, so a 64 × 64 canvas displays 640 nm × 640 nm.
- In the Educational profile, **Auto-fill from Chip Lab** rasterizes the current schematic's component outlines and routed connections onto the mask grid and records the source design with the export.
- Use Chip Lab's **Generate Mask** button to create the raster and jump directly to Mask Lab. Changing the grid size keeps pixels at their existing coordinates where they fit; shrinking the grid clips pixels beyond its new edges.
- SKY130 and GF180MCU tabs provide reference layer sets; GF180MCU includes documented GDS layer/datatype, mask number, and polarity metadata where listed by its design manual.
- Auto-fill from Chip Lab and pattern training are restricted to the process-agnostic educational profile so schematic artwork is not mistaken for a process layout.
- PDK tabs are educational drafting previews only: they do not run foundry DRC/LVS, implement a PDK grid or full layer map, or export verified GDSII/OASIS. GF180MCU's open PDK currently identifies itself as an experimental preview. Consult the [SKY130 layer reference](https://skywater-pdk.readthedocs.io/en/main/rules/layers.html), [GF180MCU drawn-layer table](https://gf180mcu-pdk.readthedocs.io/en/latest/physical_verification/design_manual/drm_04_1.html), and [GF180MCU mask-layer numbering](https://gf180mcu-pdk.readthedocs.io/en/latest/physical_verification/design_manual/drm_04_3.html) and use the matching installed PDK/tool flow for physical signoff.
- Chip Lab includes fixed V+ (logic HIGH) and GND (logic LOW) source terminals, with a wiring check for missing rails and both sources driving the same input. Those are digital checks only; they do not model voltage, current, copper continuity, or electrical safety.
- Export the current mask as JSON for reuse or downstream tooling.
- Mask edits autosave in the browser; if storage is blocked or full, Mask Lab reports the failure and recommends exporting a copy. Chip Lab source, power-check, simulation, and test-bench provenance stays with an untouched auto-filled mask and its JSON export.
- Use **Training** for four guided exercises: a single feature, a parallel line pair, a square frame, and a 4 × 4 array. Exact mask checks, hints, scores, and completion progress are saved in the browser. Training preserves and restores the mask you were editing.
- The 3D viewport animation pauses while a 2D lab is open or the browser tab is hidden, then resumes when returning to the 3D workspaces.

---

## 🎞️ Animated Counter Chip (Atom Lab)

A self-running chip demo — nothing to import. Press <kbd>Shift</kbd> + <kbd>G</kbd> or use <kbd>Shift</kbd> + <kbd>A</kbd> → **Add → Animated Chips → Animated Counter Chip**.

- An 8-bit counter die laid out as a layer stack: substrate, diffusion, eight standard cells with poly gates, a clock distribution line, metal 1 traces, vias, a metal 2 output bus, and passivation over the top.
- The clock free-runs at 1 Hz and the counter counts forever. Each cell's gate lights up for a `1` bit, the matching output trace carries an electron to its pad, the pad and via glow, and a floating readout shows the value in binary and hex.
- The die is placed beside the startup scene, or on the 3D cursor if you have moved it. It is an ordinary editable object: move, rotate, duplicate, or delete it with <kbd>X</kbd> like any other.
- The animation pauses with the rest of the 3D viewport while Chip Lab or Mask Lab is open or the tab is hidden, and a dropped frame still counts every clock edge it spanned. The clock period, bit width, and start value are parameters of `AnimatedChipModel` in `src/core/AnimatedChip.js`.

---

## 🔍 Chip View (Atom Lab Clone)

Chip View is an Atom Lab clone kept read-only. It shares the Atom Lab 3D viewport, grid, and camera, and its small panel has one job: importing chip files so you can look at them.

- Press <kbd>Shift</kbd> + <kbd>A</kbd> and choose **Add → Chip View → Open Chip View (view GDS / GLTF)**, or pick **Chip View** in the workspace selector.
- Use the panel's **Import 3D file (GDS / GDSII / GLTF / GLB)** button. For a `.gltf` with an external `.bin` buffer or textures, select every file of the model in one go.
- Imported files are listed with their format, layer or mesh count, and drawing size, with **Focus** to re-frame a model and **Remove** to dispose of it. Drag & drop onto the viewport imports into Chip View as well.
- Each GDSII import gets a **Layers** list with a color swatch, PDK layer name, element count, and coverage of the drawing. Toggle layers individually or use **Show all** / **Hide all**. Layers covering more than 75 % of the drawing (fill and plate artwork) are tagged **fill**, and the list opens automatically when one is present, because otherwise a single fill polygon hides the whole die.
- **Layers are named, not numbered.** `66/20` shows as `poly.drawing`, `65/20` as `diff.drawing`, `68/20` as `met1.drawing`. Names come from built-in PDK maps generated from the sky130 and GF180 tech files (`src/data/PdkLayerMaps.js`, regenerate with `node scripts/generate-layer-map.mjs <sky130A.lyp> <gf180mcu.lyp>`).
  - The PDK is detected from the layout's own layer numbers, and only when one map explains most of them. Layer numbers collide between technologies, so an unmatched layout is reported as **PDK not recognised** and keeps `Layer N/D` names rather than borrowing another PDK's.
  - Layers a tech file never documents are named from what they demonstrably contain: label datatypes become e.g. `met1 label`, a label layer whose text is all cell names becomes `cell name label`, and layer 0 becomes `cell reference`.
  - To add a PDK, drop its `.lyp` next to the others and re-run the generator. The Nangate45 layouts on this machine stay numbered because no Nangate45 tech file is installed.
- **The cell hierarchy is expanded.** Real layouts place standard cells with SREF and AREF references; Chip View resolves them, so cells appear where they were placed instead of stacked on the origin. Mirrored and rotated placements are respected.
- **Cell metadata and label layers are not drawn.** Two kinds of layer carry no artwork and are excluded from the 3D build:
  - *Cell markers* — GF180MCU streams one rectangle per placed cell on `V5_XTOR` (5 V transistor flag), `Dualgate`, and `LVPWELL`. Their positions were verified to sit on the cells that own them, so nothing was misplaced; they are technology flags, not geometry.
  - *Label artwork* — any layer the PDK classifies as a label, such as GF180's `Metal2_Label`, `Metal3_Label`, and `Metal4_Label`, which are written as polygons rather than text. They annotate the metal beneath them and only obscure it.
  The panel lists exactly what was left out, with shape counts and why. `buildGdsModel(buffer, { drawMarkerLayers: true })` brings them all back.
- **Transistors are extracted from the geometry.** A gate is where a polysilicon shape crosses a diffusion shape, so Chip View rasterizes each cell instance, counts the crossing regions, and types each one n- or p-channel from the `nsdm` marker. Each gate gets a coloured marker, the panel reports the totals per channel, and the result is per cell type so it can be checked against the standard cell library.
  - On your layouts: `counter8_sky130A` reports **796 transistors (398 n + 398 p across 138 cells)** and `alu8_sky130A` **3,202 (1,601 n + 1,601 p across 741 cells)**. The equal n/p counts are the expected result for CMOS.
  - Layouts that stream out pins and routing only, such as the GF180 and Nangate45 files here, report no devices and say why instead of inventing them.
- **Names** toggles small 3D text labels: PDK layer names along the die edge, and one label per cell type with its instance count (`dfrtp_1 x8`, `clkbuf_16 x3`). Labelling every instance instead of every type turns a dense design into unreadable text.
- **Gates (N)** toggles the transistor markers; they are lifted above the current stack so they stay visible.
- GDSII boundaries, boxes, and paths are extruded into shaded 3D solids, one mesh per layer/datatype, normalized to the viewport and colored per layer. Both GDSII record numberings are supported: the current table and the older table still emitted by some OpenLane/KLayout flows, which is detected from the stream itself.
- **Layers are stacked, not flat.** Each layer gets its own height, ordered by layer number (diffusion and implant low, metals and top layers high), so the import reads as a stack-up instead of overlapping planes. Use **Stack layers by number** to flatten every layer back onto the floor plane, and **Gap** to spread or compress the stack. The default gap shrinks automatically for layouts with many layers so the stack stays shorter than the drawing. Layer-number order is an approximation of a real process stack-up, not a PDK layer map.
- Structure references (SREF), array references (AREF), labels (TEXT), and nodes are counted and reported, not flattened into geometry. Layouts above 20 000 drawable elements are truncated and the panel reports how many were skipped.
- Database units come from the UNITS record. Some OpenLane layouts declare an implausible unit (for example 0.001 nm per database unit); Chip View then reports the size in database units and shows the caveat instead of printing a meaningless 0.0 µm. The 3D view is normalized to the drawing, so it is unaffected either way.
- Chip View is view-only: imported objects cannot be selected, moved, deleted, or edited in the viewport, and Atom Lab objects are hidden while Chip View is active. Remove imports from the panel. Unreadable or unsupported files report the failure in the panel instead of failing silently.
- Chip View is a preview, not a layout engine: it does not run DRC or LVS, does not implement a PDK grid or layer map, and produces no signoff-ready GDSII/OASIS. Use a real PDK tool flow for physical verification.

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
   - **Chip View: Open Chip View (view GDS / GLTF)** — see the Chip View section.

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
 - Use Shift + G function to add a self-running Animated Counter Chip (8-bit, no import needed) 

You can also add more fun things using more keys with ctrl + any or shift + something you might change anyhow :) Have Fun 

And maybe some Ctrl + or Shits + Something no one knows about :) Try and find out ^^

# Electro-Lab for EveryOne
Electro Lab is 3D design tool for matter and logic on Web UI for everyone 
