const GATES = {
  AND: { inputs: 2, description: 'High only when every input is high.' },
  OR: { inputs: 2, description: 'High when one or more inputs are high.' },
  NOT: { inputs: 1, description: 'Inverts its input.' },
  XOR: { inputs: 2, description: 'High when the inputs are different.' },
  NAND: { inputs: 2, description: 'Inverted AND gate.' },
  NOR: { inputs: 2, description: 'Inverted OR gate.' },
  XNOR: { inputs: 2, description: 'High when the inputs are equal.' },
  BUF: { inputs: 1, description: 'Copies its input to the output.' },
  DFF: { inputs: 2, description: 'Captures D on the rising edge of CLK and holds Q.' },
  BUS_AND: { inputs: 2, description: 'Bitwise AND of two buses.' },
  BUS_OR: { inputs: 2, description: 'Bitwise OR of two buses.' },
  BUS_XOR: { inputs: 2, description: 'Bitwise XOR of two buses.' },
  BUS_NOT: { inputs: 1, description: 'Inverts every bit in a bus.' },
  MUX: { inputs: 3, description: 'Selects one of two buses.' },
  ADDER: { inputs: 3, description: 'Adds two buses and a carry-in.' },
  COMPARATOR: { inputs: 2, description: 'Compares two buses.' },
  DECODER: { inputs: 2, description: 'Decodes a binary address to one-hot outputs.' },
  REGISTER: { inputs: 2, description: 'Captures a bus on the rising clock edge.' },
  COUNTER: { inputs: 3, description: 'Counts up on enabled clock edges.' },
  CLOCK_DIVIDER: { inputs: 2, description: 'Divides an input clock frequency.' },
  SR_DFF: { inputs: 4, description: 'D flip-flop with synchronous set and reset.' },
  RAM: { inputs: 4, description: 'Four-word synchronous read/write memory.' }
};
const CHIP_LIBRARY_KEY = 'electroDesigner.chipLab.library';
const CHIP_TESTBENCH_KEY = 'electroDesigner.chipLab.testbenches';
const CHIP_PROJECTS_KEY = 'electroDesigner.chipLab.projects';
const TRACE_LIMIT = 48;
const BUS_WIDTHS = [2, 4, 8];
const BUS_INPUT_TYPES = new Set(['BUS_INPUT', 'JOINER']);
const BUS_OUTPUT_TYPES = new Set(['BUS_OUTPUT', 'SPLITTER']);
const BUS_GATE_TYPES = new Set(['BUS_AND', 'BUS_OR', 'BUS_XOR', 'BUS_NOT']);
const BUS_TYPES = new Set(['BUS_INPUT', 'BUS_OUTPUT', 'BUS_CONST', 'SPLITTER', 'JOINER', ...BUS_GATE_TYPES, 'MUX', 'ADDER', 'COMPARATOR', 'REGISTER', 'COUNTER', 'CLOCK_DIVIDER', 'RAM']);
const SEQUENTIAL_TYPES = new Set(['DFF', 'SR_DFF', 'REGISTER', 'COUNTER', 'CLOCK_DIVIDER', 'RAM']);
const BUS_MASK = (width) => (1 << width) - 1;
const HISTORY_LIMIT = 80;
const LEARNING_PROGRESS_KEY = 'electroDesigner.chipLab.learningProgress';
const LEARNING_STATS_KEY = 'electroDesigner.chipLab.learningStats';
const LEARNING_LESSONS = [
  { id: 'and-gate', title: '1 · First logic gate', objective: 'Build an AND gate: the output should be HIGH only when both inputs are HIGH.', hints: ['Connect both input pins to the two AND inputs.', 'Connect the AND output to the output pin.'] },
  { id: 'half-adder', title: '2 · Add binary bits', objective: 'Build a half-adder with separate SUM and CARRY outputs.', hints: ['XOR produces the sum bit; AND produces the carry bit.', 'Route both inputs to both gates, then connect XOR to SUM and AND to CARRY.'] },
  { id: 'bus-mux', title: '3 · Select a data bus', objective: 'Use SEL to choose between two 2-bit data buses.', hints: ['When SEL is LOW choose A; when HIGH choose B.', 'Connect A and B to the MUX data pins, SEL to its selector, and the output bus to Y.'] },
  { id: 'decoder', title: '4 · Decode an address', objective: 'Create a 2-to-4 decoder with exactly one active output for each address.', hints: ['Connect A0 and A1 to the decoder in least-significant-bit order.', 'Connect decoder outputs 0–3 to Y0–Y3 in the same order.'] },
  { id: 'register', title: '5 · Store a value', objective: 'Capture a 2-bit bus in a clocked register and retain it until another edge.', hints: ['Connect the data bus to D and the clock source to CLK.', 'Pulse the clock after changing the data; the register output should retain the captured value.'] }
];

const truth = (type, inputs) => {
  const [a = false, b = false] = inputs;
  if (type === 'AND') return a && b;
  if (type === 'OR') return a || b;
  if (type === 'NOT') return !a;
  if (type === 'XOR') return a !== b;
  if (type === 'NAND') return !(a && b);
  if (type === 'NOR') return !(a || b);
  if (type === 'XNOR') return a === b;
  return a;
};

const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export class ChipLabPanel {
  constructor(editor) {
    this.editor = editor;
    this.nodes = [];
    this.wires = [];
    this.selectedNodeId = null;
    this.pendingPort = null;
    this.nodeSequence = 0;
    this.dragState = null;
    this.chipName = 'Untitled Logic Chip';
    this.selectedNodeIds = new Set();
    this.nodeClipboard = null;
    this.gridSnap = true;
    this.customChips = this.loadCustomChips();
    this.designId = `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.testBench = { name: 'Untitled test bench', steps: [] };
    this.trace = [];
    this.clockPeriod = 1000;
    this.clockTimer = null;
    this.clockHigh = false;
    this.clockEdgeCount = 0;
    this.clockEdgeLog = [];
    this.editStack = [];
    this.undoStack = [];
    this.redoStack = [];
    this.selectedWireIndex = null;
    this.watchNodeIds = new Set();
    this.breakpointNodeIds = new Set();
    this.breakpointHit = null;
    this.learningProgress = this.loadLearningProgress();
    this.learningStats = this.loadLearningStats();
    this.learningLesson = null;
    this.learningLessonIndex = 0;
    this.learningHintCount = 0;
    this.learningLastResult = null;
    this.historyCapture = null;
    this.loadTestBench();
    this.el = document.createElement('section');
    this.el.className = 'chip-lab';
    this.el.hidden = true;
    this.el.innerHTML = `
      <header class="chip-topbar">
        <div class="chip-brand"><span class="chip-brand-mark">IC</span><div><strong>Chip Lab</strong><small data-chip-context>Digital logic · schematic design</small></div></div>
        <label class="chip-name-label">DESIGN NAME<input data-chip-name maxlength="48" value="Untitled Logic Chip" aria-label="Chip design name"></label>
        <div class="chip-top-actions">
          <button type="button" data-chip-action="new">New</button>
          <button type="button" data-chip-action="open-projects">Projects</button>
          <button type="button" data-chip-action="import">Import</button>
          <button type="button" data-chip-action="import-hdl">Import Verilog</button>
          <button type="button" data-chip-action="export-hdl">Export Verilog</button>
          <button type="button" data-chip-action="generate-mask">Generate Mask</button>
          <button type="button" data-chip-action="export" class="chip-primary">Export design</button>
          <input type="file" accept=".json,application/json" data-chip-file hidden>
          <input type="file" accept=".v,.sv,text/plain" data-chip-hdl-file hidden>
        </div>
      </header>
      <div class="chip-workbench">
        <aside class="chip-library">
          <div class="chip-panel-title"><span>COMPONENTS</span><small>Click to place</small></div>
          <div class="chip-library-group">
            <h3>Chip I/O</h3>
            <button data-chip-add="INPUT"><i class="chip-io-icon">IN</i><span><b>Input pin</b><small>Toggle logic level</small></span><kbd>I</kbd></button>
            <button data-chip-add="OUTPUT"><i class="chip-io-icon output">OUT</i><span><b>Output pin</b><small>Observe logic level</small></span><kbd>O</kbd></button>
            <button data-chip-add="BUS_INPUT"><i class="chip-io-icon">BUS</i><span><b>Bus input</b><small>Drive 2, 4, or 8 bits</small></span><kbd>+</kbd></button>
            <button data-chip-add="BUS_OUTPUT"><i class="chip-io-icon output">BUS</i><span><b>Bus output</b><small>Monitor a multi-bit value</small></span><kbd>+</kbd></button>
            <button data-chip-add="CONST"><i class="chip-io-icon">0/1</i><span><b>Logic constant</b><small>Choose LOW or HIGH</small></span><kbd>+</kbd></button>
          </div>
          <div class="chip-library-group">
            <h3>Logic power rails</h3>
            <button data-chip-add="VPLUS"><i class="chip-io-icon output">V+</i><span><b>V+ logic-high rail</b><small>Fixed HIGH / 1 source</small></span><kbd>+</kbd></button>
            <button data-chip-add="GROUND"><i class="chip-io-icon">GND</i><span><b>GND logic-low rail</b><small>Fixed LOW / 0 source</small></span><kbd>+</kbd></button>
            <button type="button" data-chip-action="check-power-rails">Check V+ / GND wiring</button>
          </div>
          <div class="chip-library-group">
            <h3>Logic gates</h3>
            ${['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR', 'XNOR', 'BUF'].map((gate) => `<button data-chip-add="${gate}"><i class="chip-gate-icon">${gate}</i><span><b>${gate} gate</b><small>${GATES[gate].description}</small></span><kbd>+</kbd></button>`).join('')}
          </div>
          <div class="chip-library-group">
            <h3>Clock</h3>
            <button data-chip-add="CLOCK"><i class="chip-gate-icon clock">CLK</i><span><b>Clock source</b><small>Pulse sequential logic</small></span><kbd>+</kbd></button>
            <button data-chip-add="REGISTER"><i class="chip-gate-icon clock">REG</i><span><b>Bus register</b><small>Edge-triggered storage</small></span><kbd>+</kbd></button>
            <button data-chip-add="COUNTER"><i class="chip-gate-icon clock">CNT</i><span><b>Counter</b><small>Enabled binary counter</small></span><kbd>+</kbd></button>
            <button data-chip-add="CLOCK_DIVIDER"><i class="chip-gate-icon clock">÷N</i><span><b>Clock divider</b><small>Divide clock by 2ⁿ</small></span><kbd>+</kbd></button>
            <button data-chip-add="SR_DFF"><i class="chip-gate-icon clock">SR</i><span><b>Set/reset DFF</b><small>Synchronous set and reset</small></span><kbd>+</kbd></button>
            <button data-chip-add="RAM"><i class="chip-gate-icon clock">RAM</i><span><b>4 × 4 RAM</b><small>Four 4-bit words</small></span><kbd>+</kbd></button>
          </div>
          <div class="chip-library-group">
            <h3>Bus logic · 2/4/8 bits</h3>
            <button data-chip-add="SPLITTER"><i class="chip-gate-icon">SPLIT</i><span><b>Bus splitter</b><small>Bus to individual bits</small></span><kbd>+</kbd></button>
            <button data-chip-add="JOINER"><i class="chip-gate-icon">JOIN</i><span><b>Bus joiner</b><small>Bits to a bus · B0 is LSB</small></span><kbd>+</kbd></button>
            <button data-chip-add="BUS_AND"><i class="chip-gate-icon">ANDₙ</i><span><b>Bus AND</b><small>Bitwise bus operation</small></span><kbd>+</kbd></button>
            <button data-chip-add="BUS_OR"><i class="chip-gate-icon">ORₙ</i><span><b>Bus OR</b><small>Bitwise bus operation</small></span><kbd>+</kbd></button>
            <button data-chip-add="BUS_XOR"><i class="chip-gate-icon">XORₙ</i><span><b>Bus XOR</b><small>Bitwise bus operation</small></span><kbd>+</kbd></button>
            <button data-chip-add="BUS_NOT"><i class="chip-gate-icon">NOTₙ</i><span><b>Bus NOT</b><small>Invert every bus bit</small></span><kbd>+</kbd></button>
            <button data-chip-add="MUX"><i class="chip-gate-icon">MUX</i><span><b>Multiplexer</b><small>Select between two buses</small></span><kbd>+</kbd></button>
            <button data-chip-add="ADDER"><i class="chip-gate-icon">Σ</i><span><b>Bus adder</b><small>Sum with carry in/out</small></span><kbd>+</kbd></button>
            <button data-chip-add="COMPARATOR"><i class="chip-gate-icon">A≷B</i><span><b>Comparator</b><small>Greater, equal, less</small></span><kbd>+</kbd></button>
            <button data-chip-add="DECODER"><i class="chip-gate-icon">DEC</i><span><b>Decoder</b><small>Binary address to one-hot</small></span><kbd>+</kbd></button>
          </div>
          <div class="chip-library-group" data-chip-library-group>
            <h3>Reusable chips</h3>
            <div data-chip-library-list></div>
            <button class="chip-create-subcircuit" data-chip-action="create-subcircuit">Create from selection</button>
          </div>
          <div class="chip-library-group">
            <h3>Reference designs</h3>
            <button data-chip-preset="half-adder"><i class="chip-gate-icon preset">Σ</i><span><b>Half adder</b><small>Sum and carry outputs</small></span><span class="chip-add-mark">↗</span></button>
            <button data-chip-preset="full-adder"><i class="chip-gate-icon preset">∑</i><span><b>Full adder</b><small>Three-input addition</small></span><span class="chip-add-mark">↗</span></button>
            <button data-chip-preset="counter"><i class="chip-gate-icon clock">CNT</i><span><b>Enabled counter</b><small>4-bit clocked counter with reset</small></span><span class="chip-add-mark">↗</span></button>
            <button data-chip-preset="traffic-light"><i class="chip-gate-icon clock">FSM</i><span><b>Traffic light FSM</b><small>One-hot three-state controller</small></span><span class="chip-add-mark">↗</span></button>
            <button data-chip-preset="accumulator"><i class="chip-gate-icon preset">Σ+</i><span><b>4-bit accumulator</b><small>Clocked running sum</small></span><span class="chip-add-mark">↗</span></button>
            <button data-chip-preset="ram-demo"><i class="chip-gate-icon clock">RAM</i><span><b>RAM read/write</b><small>4 × 4 synchronous memory</small></span><span class="chip-add-mark">↗</span></button>
            <button data-chip-action="open-fsm-builder"><i class="chip-gate-icon clock">FSM+</i><span><b>Build a state machine</b><small>Define states and transitions</small></span><span class="chip-add-mark">↗</span></button>
          </div>
          <div class="chip-library-foot"><span class="chip-led"></span> Mixed combinational / clocked logic</div>
        </aside>
        <main class="chip-design-area">
          <div class="chip-toolbar">
            <div class="chip-breadcrumb"><span>PROJECT</span><b data-chip-title>Untitled Logic Chip</b><span class="chip-rev">REV A</span></div>
            <label class="chip-design-search"><span>FIND</span><input type="search" data-chip-find placeholder="Component or signal…" autocomplete="off" aria-label="Find a component or signal"><div data-chip-find-results hidden></div></label>
            <div class="chip-canvas-actions">
              <button type="button" data-chip-action="undo" title="Undo (Ctrl+Z)">Undo</button>
              <button type="button" data-chip-action="redo" title="Redo (Ctrl+Y)">Redo</button>
              <button type="button" data-chip-action="copy" title="Copy selected components (Ctrl+C)">Copy</button>
              <button type="button" data-chip-action="paste" title="Paste copied components (Ctrl+V)">Paste</button>
              <button type="button" data-chip-action="grid-snap" class="active" title="Toggle 20-unit grid snapping">Snap: On</button>
              <button type="button" data-chip-action="group" title="Toggle multi-select">Select group</button>
              <button type="button" data-chip-action="auto-label-nets" title="Automatically name new nets from their source component">Auto-name nets: Off</button>
              <button type="button" data-chip-action="align-x" title="Align selected components horizontally">Align X</button>
              <button type="button" data-chip-action="align-y" title="Align selected components vertically">Align Y</button>
              <button type="button" data-chip-action="distribute-x" title="Distribute selected components horizontally">Space X</button>
              <button type="button" data-chip-action="distribute-y" title="Distribute selected components vertically">Space Y</button>
              <button type="button" data-chip-action="back-chip" hidden>Back</button>
              <button type="button" data-chip-action="save-chip-edits" hidden>Save chip</button>
              <button type="button" data-chip-action="fit" title="Fit schematic">Fit view</button>
              <button type="button" data-chip-action="tidy" title="Automatically arrange components">Tidy</button>
              <button type="button" data-chip-action="clear" title="Remove all components">Clear</button>
            </div>
          </div>
          <div class="chip-canvas-wrap">
            <svg class="chip-canvas" viewBox="0 0 1200 740" role="application" aria-label="Logic chip schematic canvas">
              <defs>
                <pattern id="chip-grid-small" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#243041" stroke-width="0.7"/></pattern>
                <pattern id="chip-grid-large" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#chip-grid-small)"/><path d="M 100 0 L 0 0 0 100" fill="none" stroke="#344357" stroke-width="1"/></pattern>
                <marker id="chip-wire-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L7 3.5 L0 7 Z" fill="#a8b7ca"/></marker>
              </defs>
              <rect width="1200" height="740" fill="url(#chip-grid-large)"/>
              <g data-chip-wires></g><g data-chip-nodes></g>
            </svg>
            <div class="chip-empty-state" data-chip-empty><span class="chip-empty-icon">⌘</span><strong>Start your logic design</strong><p>Add input pins and gates from the component library.<br>Connect output dots to input dots to build a circuit.</p><button data-chip-preset="half-adder">Load a half-adder example</button></div>
            <div class="chip-canvas-legend"><span><i class="legend-low"></i> LOW / 0</span><span><i class="legend-high"></i> HIGH / 1</span><span><i class="legend-wire"></i> Signal wire</span></div>
          </div>
          <footer class="chip-statusbar"><span data-chip-status>Ready · Select a component to inspect it</span><span data-chip-count>0 components · 0 nets</span><span>GRID 20 px</span></footer>
        </main>
        <aside class="chip-inspector">
          <nav class="chip-inspector-tabs"><button class="active" data-chip-tab="inspect">Inspector</button><button data-chip-tab="simulate">Simulation</button></nav>
          <div class="chip-inspector-content" data-chip-inspector></div>
          <div class="chip-simulation-content" data-chip-simulation hidden></div>
        </aside>
      </div>
      <div class="chip-truth-modal" data-chip-truth-modal hidden>
        <section><header><div><strong>Truth table</strong><span data-chip-truth-caption></span></div><button data-chip-action="close-truth" aria-label="Close truth table">×</button></header><div class="chip-truth-body" data-chip-truth-body></div></section>
      </div>
      <div class="chip-subcircuit-modal" data-chip-subcircuit-modal hidden>
        <section><header><div><strong>Create reusable chip</strong><span>Selected components become a reusable subcircuit</span></div><button data-chip-action="cancel-subcircuit" aria-label="Cancel">×</button></header>
          <label>CHIP NAME<input data-subcircuit-name maxlength="40" value="Custom Chip"></label>
          <p data-subcircuit-summary></p>
          <footer><button data-chip-action="cancel-subcircuit">Cancel</button><button class="chip-primary" data-chip-action="save-subcircuit">Create chip</button></footer>
        </section>
      </div>
      <div class="chip-testbench-modal" data-chip-testbench-modal hidden>
        <section><header><div><strong>Test benches</strong><span>Build a sequence of input vectors and expected outputs</span></div><button data-chip-action="close-testbench" aria-label="Close test benches">×</button></header>
          <label>TEST BENCH NAME<input data-testbench-name maxlength="48" value="Untitled test bench"></label>
          <div class="chip-testbench-steps" data-testbench-steps></div>
          <div class="chip-testbench-results" data-testbench-results aria-live="polite"></div>
          <footer><label class="chip-testbench-clock"><input type="checkbox" data-testbench-clock> Clock edge for next step</label><button data-chip-action="add-test-step">Add current vector</button><button data-chip-action="generate-exhaustive">Generate exhaustive</button><label class="chip-testbench-seed">Seed <input data-random-seed type="number" min="0" max="4294967295" step="1" placeholder="optional"></label><button data-chip-action="generate-random">Add 32 random</button><button data-chip-action="generate-boundary">Boundary cases</button><button class="chip-primary" data-chip-action="run-testbench">Run tests</button><button data-chip-action="import-testbench-csv">Import CSV (append)</button><button data-chip-action="export-testbench-csv">Export CSV</button><input type="file" accept=".csv,text/csv" data-testbench-csv-file hidden></footer>
          <p data-testbench-result></p>
        </section>
      </div>
      <div class="chip-learning-modal" data-chip-learning-modal hidden>
        <section><header><div><strong>Chip Lab learning path</strong><span>Build and test small circuits, one skill at a time</span></div><button data-chip-action="close-learning" aria-label="Close learning path">×</button></header>
          <div class="chip-learning-layout"><nav data-learning-list></nav><article data-learning-content></article></div>
          <footer><button data-chip-action="load-lesson">Start challenge</button><button class="chip-primary" data-chip-action="check-lesson">Check my circuit</button></footer>
        </section>
      </div>
      <div class="chip-project-modal" data-chip-project-modal hidden>
        <section><header><div><strong>Local chip projects</strong><span>Save named designs in this browser</span></div><button data-chip-action="close-projects" aria-label="Close projects">×</button></header>
          <label>PROJECT NAME<input data-project-name maxlength="48" value="Untitled Logic Chip"></label>
          <div class="chip-project-list" data-project-list></div>
          <footer><button data-chip-action="save-project" class="chip-primary">Save current design</button><button data-chip-action="close-projects">Close</button></footer>
        </section>
      </div>
      <div class="chip-fsm-modal" data-chip-fsm-modal hidden>
        <section><header><div><strong>Finite-state machine builder</strong><span>Generates a one-hot DFF implementation</span></div><button data-chip-action="close-fsm-builder" aria-label="Close FSM builder">×</button></header>
          <label>STATE NAMES · comma or newline separated<input data-fsm-states value="IDLE, ACTIVE, DONE"></label>
          <label>INITIAL STATE<input data-fsm-initial value="IDLE"></label>
          <label>TRANSITIONS · one per line: FROM, CONDITION, TO<textarea data-fsm-transitions rows="5">IDLE, START, ACTIVE\nACTIVE, FINISH, DONE\nDONE, *, IDLE</textarea></label>
          <p>Use * for an unconditional transition, a signal name for active-high, or !signal for active-low. Input pins are created for referenced signals. All transitions advance on the next rising clock edge.</p>
          <footer><button data-chip-action="close-fsm-builder">Cancel</button><button data-chip-action="create-fsm" class="chip-primary">Create state machine</button></footer>
          <p data-fsm-error role="status"></p>
        </section>
      </div>
    `;
    document.body.appendChild(this.el);
    this.bindEvents();
    this.render();
  }

  setActive(active) {
    this.el.hidden = !active;
    if (!active) this.stopClock();
    if (active) {
      this.render();
      this.runSimulation();
    }
  }

  bindEvents() {
    this.el.addEventListener('click', (event) => {
      const waveform = event.target.closest('[data-wave-node-id]');
      if (waveform) {
        this.focusWaveSignal(waveform.dataset.waveNodeId);
        return;
      }
      const button = event.target.closest('button');
      if (button) {
        if (button.dataset.chipAdd) this.addNode(button.dataset.chipAdd);
        if (button.dataset.chipPreset) this.loadPreset(button.dataset.chipPreset);
        if (button.dataset.chipTab) this.setTab(button.dataset.chipTab);
        if (button.dataset.chipAction) this.handleAction(button.dataset.chipAction, button.dataset);
        if (button.dataset.chipToggle) this.toggleInput(button.dataset.chipToggle);
        if (button.dataset.chipDelete) this.deleteNode(button.dataset.chipDelete);
        if (button.dataset.chipDeleteWire !== undefined) this.deleteWire(Number(button.dataset.chipDeleteWire));
        if (button.dataset.chipInsert) this.insertCustomChip(button.dataset.chipInsert);
      }
      const port = event.target.closest('[data-chip-port]');
      if (port) {
        event.stopPropagation();
        this.handlePort(port.dataset.nodeId, port.dataset.direction, Number(port.dataset.portIndex));
        return;
      }
      const wire = event.target.closest('[data-chip-delete-wire]');
      if (wire && !button) {
        const index = Number(wire.dataset.chipDeleteWire);
        if (event.detail > 1) this.deleteWire(index);
        else {
          this.selectedWireIndex = index;
          this.selectedNodeId = null;
          this.selectedNodeIds.clear();
          this.render();
        }
        return;
      }
      const toggle = event.target.closest('[data-chip-toggle]');
      if (toggle && !button) {
        this.toggleInput(toggle.dataset.chipToggle);
        return;
      }
      const node = event.target.closest('[data-chip-node]');
      if (node && !port) {
        this.selectNode(node.dataset.nodeId, event.shiftKey || this.groupSelectMode);
      }
    });
    this.el.addEventListener('input', (event) => {
      if (event.target.matches('[data-chip-find]')) this.renderFindResults(event.target.value);
      if (event.target.matches('[data-chip-name]')) {
        this.chipName = event.target.value.trim() || 'Untitled Logic Chip';
        this.el.querySelector('[data-chip-title]').textContent = this.chipName;
        if (!this.selectedNodeId) this.renderInspector();
      }
      if (event.target.matches('[data-chip-label]')) {
        const node = this.nodes.find((entry) => entry.id === this.selectedNodeId);
        if (node) {
          node.label = event.target.value.trim() || node.type;
          this.renderCanvas();
        }
      }
      if (event.target.matches('[data-chip-note]')) {
        const node = this.nodes.find((entry) => entry.id === event.target.dataset.nodeId);
        if (node) {
          node.note = event.target.value.slice(0, 160);
          this.renderCanvas();
        }
      }
      if (event.target.matches('[data-testbench-name]')) {
        this.testBench.name = event.target.value.trim() || 'Untitled test bench';
        this.persistTestBenches();
      }
      if (event.target.matches('[data-wire-label]')) {
        const wire = this.wires[this.selectedWireIndex];
        if (wire) {
          wire.label = event.target.value.slice(0, 32);
          this.renderCanvas();
        }
      }
    });
    this.el.addEventListener('change', (event) => {
      if (event.target.matches('[data-chip-label]')) this.renderInspector();
      if (event.target.matches('[data-wire-route]')) {
        const wire = this.wires[this.selectedWireIndex];
        if (wire) {
          wire.route = event.target.value;
          this.commitHistory(this.historyCapture);
          this.historyCapture = null;
          this.renderCanvas();
        }
      }
      if (event.target.matches('[data-chip-width]')) this.changeBusWidth(event.target.dataset.nodeId, Number(event.target.value));
      if (event.target.matches('[data-bus-value]')) this.changeBusValue(event.target.dataset.nodeId, event.target.value);
      if (event.target.matches('[data-chip-clock-period]')) {
        this.clockPeriod = Number(event.target.value);
        if (this.clockTimer) this.startClock();
      }
      if (event.target.matches('[data-testbench-expected]')) {
        const { stepIndex, outputId } = event.target.dataset;
        const output = this.nodes.find((node) => node.id === outputId);
        if (!output || !this.testBench.steps[Number(stepIndex)]) return;
        this.invalidateTestBenchResults();
        this.testBench.steps[Number(stepIndex)].expected[outputId] = output.type === 'BUS_OUTPUT'
          ? Number(event.target.value) : Boolean(Number(event.target.value));
        this.persistTestBenches();
        this.renderTestBenchSteps();
      }
    });
    this.el.querySelector('[data-chip-find]').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const match = this.findDesignItems(event.currentTarget.value)[0];
      if (!match) return;
      event.preventDefault();
      this.focusFoundItem({
        findKind: match.kind,
        findId: match.id || '',
        findIndex: match.index === undefined ? '' : String(match.index)
      });
    });
    this.el.querySelector('[data-chip-file]').addEventListener('change', (event) => this.importDesign(event.target.files?.[0]));
    this.el.querySelector('[data-chip-hdl-file]').addEventListener('change', (event) => this.importVerilog(event.target.files?.[0]));
    this.el.querySelector('[data-testbench-csv-file]').addEventListener('change', (event) => this.importTestBenchCsv(event.target.files?.[0]));
    this.el.addEventListener('focusin', (event) => {
      if (event.target.matches('[data-chip-label],[data-chip-name],[data-wire-label],[data-wire-route],[data-chip-note]')) {
        this.historyCapture = this.snapshotDesign();
      }
    });
    this.el.addEventListener('change', (event) => {
      if (event.target.matches('[data-chip-label],[data-chip-name],[data-wire-label],[data-chip-note]')) {
        this.commitHistory(this.historyCapture);
        this.historyCapture = null;
      }
    });
    const canvas = this.el.querySelector('.chip-canvas');
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.zoomCanvas(event.deltaY < 0 ? 0.88 : 1.14, event);
    }, { passive: false });
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button === 1 || event.button === 2 || event.code === 'Space') {
        const view = this.readViewBox();
        this.dragState = { pan: true, pointerX: event.clientX, pointerY: event.clientY, view, moved: false };
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
      const nodeElement = event.target.closest('[data-chip-node]');
      if (!nodeElement || event.target.closest('[data-chip-port]') || event.target.closest('[data-chip-toggle]')) return;
      const node = this.nodes.find((entry) => entry.id === nodeElement.dataset.nodeId);
      if (!node) return;
      const point = this.svgPoint(event);
      const moveIds = this.selectedNodeIds.has(node.id) && this.selectedNodeIds.size > 1
        ? [...this.selectedNodeIds]
        : [node.id];
      this.dragState = {
        node,
        moveIds,
        x: point.x - node.x,
        y: point.y - node.y,
        pointerSvgX: point.x,
        pointerSvgY: point.y,
        pointerX: event.clientX,
        pointerY: event.clientY,
        moved: false,
        multiSelect: event.shiftKey || this.groupSelectMode,
        before: this.snapshotDesign()
      };
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.dragState) return;
      if (this.dragState.pan) {
        const { pointerX, pointerY, view } = this.dragState;
        const rect = canvas.getBoundingClientRect();
        const scaleX = view.width / rect.width;
        const scaleY = view.height / rect.height;
        const dx = (event.clientX - pointerX) * scaleX;
        const dy = (event.clientY - pointerY) * scaleY;
        canvas.setAttribute('viewBox', `${view.x - dx} ${view.y - dy} ${view.width} ${view.height}`);
        this.dragState.moved = true;
        return;
      }
      if (Math.hypot(event.clientX - this.dragState.pointerX, event.clientY - this.dragState.pointerY) > 3) {
        if (!this.dragState.moved) canvas.setPointerCapture(event.pointerId);
        this.dragState.moved = true;
      }
      if (!this.dragState.moved) return;
      const point = this.svgPoint(event);
      const dx = point.x - this.dragState.pointerSvgX;
      const dy = point.y - this.dragState.pointerSvgY;
      const originals = this.dragState.before.nodes.filter((entry) => this.dragState.moveIds.includes(entry.id));
      const snapDelta = (delta) => this.gridSnap ? Math.round(delta / 20) * 20 : Math.round(delta);
      let moveX = snapDelta(dx);
      let moveY = snapDelta(dy);
      moveX = Math.max(-Math.min(...originals.map((entry) => entry.x)) + 20,
        Math.min(1030 - Math.max(...originals.map((entry) => entry.x)), moveX));
      moveY = Math.max(-Math.min(...originals.map((entry) => entry.y)) + 20,
        Math.min(630 - Math.max(...originals.map((entry) => entry.y)), moveY));
      for (const original of originals) {
        const current = this.nodes.find((entry) => entry.id === original.id);
        if (current) {
          current.x = original.x + moveX;
          current.y = original.y + moveY;
        }
      }
      this.renderCanvas();
    });
    canvas.addEventListener('pointerup', () => {
      if (!this.dragState) return;
      if (this.dragState.pan) {
        this.dragState = null;
        return;
      }
      const { node, moved, multiSelect, moveIds, before } = this.dragState;
      this.dragState = null;
      if (moved) {
        this.commitHistory(before);
        if (moveIds.length > 1) {
          this.selectedNodeId = node.id;
          this.selectedNodeIds = new Set(moveIds);
          this.render();
        } else this.selectNode(node.id, multiSelect);
      } else if (multiSelect) {
        this.selectNode(node.id, true);
      }
    });
    window.addEventListener('keydown', (event) => {
      if (this.el.hidden || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        this.undo();
      } else if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || event.key.toLowerCase() === 'z' && event.shiftKey)) {
        event.preventDefault();
        this.redo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        if (this.copySelection()) event.preventDefault();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        if (this.pasteClipboard()) event.preventDefault();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (this.selectedNodeId) this.deleteNode(this.selectedNodeId);
        else if (this.selectedWireIndex !== null) this.deleteWire(this.selectedWireIndex);
      } else if (event.key === 'Escape') {
        this.pendingPort = null;
        this.render();
      }
    });
  }

  handleAction(action, detail = {}) {
    if (action === 'generate-mask') {
      this.editor.setWorkspaceMode('masks').then(() => {
        if (this.editor.workspaceMode === 'masks') {
          this.editor.maskLabPanel?.autoFillFromChipDesign();
        }
      });
    }
    if (action === 'new') {
      this.commitHistory();
      this.stopClock();
      this.resetTrace();
      this.clockEdgeCount = 0;
      this.clockEdgeLog = [];
      this.editStack = [];
      this.designId = `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      this.testBench = { name: 'Untitled test bench', steps: [] };
      this.nodes = [];
      this.wires = [];
      this.selectedNodeId = null;
      this.selectedNodeIds.clear();
      this.nodeSequence = 0;
      this.setGroupSelectionMode(false);
      this.chipName = 'Untitled Logic Chip';
      this.el.querySelector('[data-chip-name]').value = this.chipName;
      this.el.querySelector('[data-chip-title]').textContent = this.chipName;
      this.render();
    }
    if (action === 'clear') {
      this.commitHistory();
      this.stopClock();
      this.resetTrace();
      this.clockEdgeCount = 0;
      this.clockEdgeLog = [];
      this.nodes = [];
      this.wires = [];
      this.selectedNodeId = null;
      this.selectedNodeIds.clear();
      this.nodeSequence = 0;
      this.setGroupSelectionMode(false);
      this.render();
    }
    if (action === 'fit') this.fitCanvas();
    if (action === 'export') this.exportDesign();
    if (action === 'import') this.el.querySelector('[data-chip-file]').click();
    if (action === 'import-hdl') this.el.querySelector('[data-chip-hdl-file]').click();
    if (action === 'export-hdl') this.exportVerilog();
    if (action === 'undo') this.undo();
    if (action === 'redo') this.redo();
    if (action === 'tidy') this.tidyLayout();
    if (action === 'align-x') this.alignSelection('x');
    if (action === 'align-y') this.alignSelection('y');
    if (action === 'distribute-x') this.distributeSelection('x');
    if (action === 'distribute-y') this.distributeSelection('y');
    if (action === 'focus-found-item') this.focusFoundItem(detail);
    if (action === 'truth') this.showTruthTable();
    if (action === 'close-truth') this.el.querySelector('[data-chip-truth-modal]').hidden = true;
    if (action === 'simulate') {
      this.runSimulation();
      this.setTab('simulate');
    }
    if (action === 'delete-selected' && this.selectedNodeId) this.deleteNode(this.selectedNodeId);
    if (action === 'group') {
      this.setGroupSelectionMode(!this.groupSelectMode);
      this.setStatus(this.groupSelectMode ? 'Group selection enabled · click components to add or remove them.' : 'Group selection disabled.');
    }
    if (action === 'auto-label-nets') {
      this.autoLabelNets = !this.autoLabelNets;
      const button = this.el.querySelector('[data-chip-action="auto-label-nets"]');
      button.classList.toggle('active', this.autoLabelNets);
      button.textContent = `Auto-name nets: ${this.autoLabelNets ? 'On' : 'Off'}`;
      this.setStatus(this.autoLabelNets
        ? 'New signal connections will inherit a name from their source component.'
        : 'Automatic signal naming is off.');
    }
    if (action === 'toggle-watch') this.toggleWatch(detail.nodeId);
    if (action === 'toggle-breakpoint') this.toggleBreakpoint(detail.nodeId);
    if (action === 'focus-watch') this.focusWaveSignal(detail.watchId);
    if (action === 'create-subcircuit') this.openSubcircuitDialog();
    if (action === 'cancel-subcircuit') this.el.querySelector('[data-chip-subcircuit-modal]').hidden = true;
    if (action === 'save-subcircuit') this.createSubcircuit();
    if (action === 'pulse-clock') this.pulseClock();
    if (action === 'step-clock') this.stepClock();
    if (action === 'clock-start') this.startClock();
    if (action === 'clock-stop') this.stopClock();
    if (action === 'edit-custom') this.openCustomChipEditor();
    if (action === 'save-chip-edits') this.saveCustomChipEdits();
    if (action === 'back-chip') this.cancelCustomChipEdit();
    if (action === 'open-testbench') this.openTestBench();
    if (action === 'close-testbench') this.el.querySelector('[data-chip-testbench-modal]').hidden = true;
    if (action === 'add-test-step') this.addTestBenchStep();
    if (action === 'delete-test-step') this.deleteTestBenchStep(Number(detail.testStepIndex));
    if (action === 'run-testbench') this.runTestBench();
    if (action === 'generate-exhaustive') this.generateTestVectors('exhaustive');
    if (action === 'generate-random') {
      const rawSeed = this.el.querySelector('[data-random-seed]').value;
      this.generateTestVectors('random', 32, rawSeed === '' ? undefined : Number(rawSeed));
    }
    if (action === 'generate-boundary') this.generateTestVectors('boundary');
    if (action === 'export-testbench-csv') this.exportTestBenchCsv();
    if (action === 'import-testbench-csv') this.el.querySelector('[data-testbench-csv-file]').click();
    if (action === 'export-vcd') this.exportVcd();
    if (action === 'clear-waveforms') {
      this.resetTrace();
      this.renderSimulation();
    }
    if (action === 'diagnose') {
      const diagnostics = this.analyzeDesign();
      this.render();
      this.setStatus(diagnostics.length
        ? `Circuit checks complete · ${diagnostics.length} item${diagnostics.length === 1 ? '' : 's'} to review.`
        : 'Circuit checks complete · no issues found.');
    }
    if (action === 'check-power-rails') this.checkPowerRails();
    if (action === 'delete-selected-wire' && this.selectedWireIndex !== null) this.deleteWire(this.selectedWireIndex);
    if (action === 'toggle-wire-probe' && this.selectedWireIndex !== null) {
      const wire = this.wires[this.selectedWireIndex];
      if (wire) {
        this.commitHistory();
        wire.probe = !wire.probe;
        this.render();
        this.setStatus(wire.probe ? 'Signal probe enabled · waveform view is focused on probed wires.' : 'Signal probe removed from this wire.');
      }
    }
    if (action === 'focus-probe') this.setTab('simulate');
    if (action === 'copy') this.copySelection();
    if (action === 'paste') this.pasteClipboard();
    if (action === 'grid-snap') {
      this.gridSnap = !this.gridSnap;
      const button = this.el.querySelector('[data-chip-action="grid-snap"]');
      button.classList.toggle('active', this.gridSnap);
      button.textContent = `Snap: ${this.gridSnap ? 'On' : 'Off'}`;
      this.setStatus(`Grid snapping ${this.gridSnap ? 'enabled' : 'disabled'} · component positions ${this.gridSnap ? 'snap to 20-unit intervals' : 'move freely'}.`);
    }
    if (action === 'open-learning') this.openLearningPath();
    if (action === 'close-learning') this.el.querySelector('[data-chip-learning-modal]').hidden = true;
    if (action === 'select-lesson') this.selectLearningLesson(Number(detail.lessonIndex));
    if (action === 'load-lesson') this.loadLearningLesson();
    if (action === 'check-lesson') this.checkLearningLesson();
    if (action === 'reveal-learning-hint') this.revealLearningHint();
    if (action === 'next-learning-lesson') this.nextLearningLesson();
    if (action === 'insert-library-chip') this.insertCustomChip(this.el.querySelector('[data-chip-action="insert-library-chip"]')?.dataset.chipId);
    if (action === 'open-projects') this.openProjects();
    if (action === 'close-projects') this.el.querySelector('[data-chip-project-modal]').hidden = true;
    if (action === 'save-project') this.saveProject();
    if (action === 'load-project') this.loadProject(detail.projectId);
    if (action === 'delete-project') this.deleteProject(detail.projectId);
    if (action === 'open-fsm-builder') this.openFsmBuilder();
    if (action === 'close-fsm-builder') this.el.querySelector('[data-chip-fsm-modal]').hidden = true;
    if (action === 'create-fsm') this.createStateMachine();
  }

  openProjects() {
    this.el.querySelector('[data-project-name]').value = this.chipName;
    this.el.querySelector('[data-chip-project-modal]').hidden = false;
    this.renderProjects();
  }

  readSavedProjects() {
    try {
      const projects = JSON.parse(localStorage.getItem(CHIP_PROJECTS_KEY) || '[]');
      return Array.isArray(projects) ? projects.filter((project) =>
        project && typeof project.id === 'string' && typeof project.name === 'string' &&
        project.design?.format === 'electro-lab-chip-design' && [1, 2, 3, 4].includes(project.design.version)
      ) : [];
    } catch (error) {
      console.error('Could not load Chip Lab projects:', error);
      this.setStatus(`Could not read saved projects: ${error.message}`);
      return [];
    }
  }

  renderProjects() {
    const list = this.el.querySelector('[data-project-list]');
    const projects = this.readSavedProjects();
    list.innerHTML = projects.length ? projects.map((project) =>
      `<article class="chip-project-item"><div><strong>${escapeHTML(project.name)}</strong><small>${project.design.components.length} components · ${project.design.wires.length} nets · ${escapeHTML(project.updatedAt || '')}</small></div><button data-chip-action="load-project" data-project-id="${escapeHTML(project.id)}">Open</button><button data-chip-action="delete-project" data-project-id="${escapeHTML(project.id)}" aria-label="Delete ${escapeHTML(project.name)}">Delete</button></article>`
    ).join('') : '<p class="chip-sim-empty">No local projects saved yet.</p>';
  }

  saveProject() {
    const name = this.el.querySelector('[data-project-name]').value.trim().slice(0, 48);
    if (!name) {
      this.setStatus('Enter a project name before saving.');
      return false;
    }
    const projects = this.readSavedProjects();
    const existing = projects.find((project) => project.id === this.designId);
    const project = {
      id: this.designId,
      name,
      updatedAt: new Date().toLocaleString(),
      design: {
        format: 'electro-lab-chip-design', version: 4, designId: this.designId, name,
        components: structuredClone(this.nodes),
        wires: structuredClone(this.wires),
        testBench: structuredClone(this.testBench)
      }
    };
    if (existing) projects[projects.indexOf(existing)] = project;
    else if (projects.length >= 20) {
      this.setStatus('The local project library holds at most 20 projects. Delete an old project before adding another.');
      return false;
    } else projects.unshift(project);
    try {
      localStorage.setItem(CHIP_PROJECTS_KEY, JSON.stringify(projects));
    } catch (error) {
      this.setStatus(`Could not save project: ${error.message}`);
      return false;
    }
    this.chipName = name;
    this.el.querySelector('[data-chip-name]').value = name;
    this.el.querySelector('[data-chip-title]').textContent = name;
    this.renderProjects();
    this.setStatus(`Saved project "${name}" in this browser.`);
    return true;
  }

  async loadProject(projectId) {
    const project = this.readSavedProjects().find((entry) => entry.id === projectId);
    if (!project) {
      this.setStatus('That local project could not be found.');
      this.renderProjects();
      return false;
    }
    await this.importDesign({ text: async () => JSON.stringify(project.design) });
    if (this.el.querySelector('[data-chip-status]').textContent.startsWith('Imported ')) {
      this.el.querySelector('[data-chip-project-modal]').hidden = true;
      return true;
    }
    return false;
  }

  deleteProject(projectId) {
    const projects = this.readSavedProjects();
    const next = projects.filter((project) => project.id !== projectId);
    if (next.length === projects.length) {
      this.setStatus('That local project could not be found.');
      return false;
    }
    try {
      localStorage.setItem(CHIP_PROJECTS_KEY, JSON.stringify(next));
      this.renderProjects();
      this.setStatus('Deleted the saved local project.');
      return true;
    } catch (error) {
      this.setStatus(`Could not delete project: ${error.message}`);
      return false;
    }
  }

  openFsmBuilder() {
    this.el.querySelector('[data-fsm-error]').textContent = '';
    this.el.querySelector('[data-chip-fsm-modal]').hidden = false;
  }

  createStateMachine() {
    const stateEntries = this.el.querySelector('[data-fsm-states]').value.split(/[,\n]/).map((state) => state.trim()).filter(Boolean);
    const states = [...new Set(stateEntries)];
    const initialState = this.el.querySelector('[data-fsm-initial]').value.trim();
    const rows = this.el.querySelector('[data-fsm-transitions]').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const error = this.el.querySelector('[data-fsm-error]');
    if (states.length < 2 || states.length > 12 || states.length !== stateEntries.length ||
        states.some((state) => !/^[A-Za-z_]\w*$/.test(state))) {
      error.textContent = 'Enter 2–12 unique state names using letters, digits, or underscores.';
      return false;
    }
    if (!states.includes(initialState)) {
      error.textContent = 'Initial state must exactly match one of the listed states.';
      return false;
    }
    const transitions = [];
    for (const [index, line] of rows.entries()) {
      const fields = line.split(',').map((part) => part.trim());
      if (fields.length !== 3 || !states.includes(fields[0]) || !states.includes(fields[2]) ||
          fields[1] !== '*' && !/^!?[A-Za-z_]\w*$/.test(fields[1])) {
        error.textContent = `Transition line ${index + 1} must be FROM, CONDITION, TO; use * for unconditional.`;
        return false;
      }
      transitions.push({ from: fields[0], condition: fields[1], to: fields[2] });
    }
    if (!transitions.length) {
      error.textContent = 'Add at least one transition.';
      return false;
    }
    for (const state of states) {
      const outgoing = transitions.filter((transition) => transition.from === state);
      const conditions = outgoing.map((transition) => transition.condition);
      if (conditions.length !== new Set(conditions).size ||
          conditions.includes('*') && conditions.length > 1) {
        error.textContent = `State "${state}" has duplicate or ambiguous transition conditions.`;
        return false;
      }
    }
    for (const transition of transitions) {
      const condition = transition.condition.replace(/^!/, '');
      if (transition.condition !== '*' && !/^[A-Za-z_]\w*$/.test(condition)) {
        error.textContent = `Invalid transition signal "${condition}".`;
        return false;
      }
    }
    this.buildStateMachine(states, transitions, initialState);
    this.el.querySelector('[data-chip-fsm-modal]').hidden = true;
    return true;
  }

  buildStateMachine(states, transitions, initialState, name = 'State Machine') {
    this.commitHistory();
    this.stopClock();
    this.resetTrace();
    this.nodes = [];
    this.wires = [];
    this.nodeSequence = 0;
    this.clockEdgeCount = 0;
    this.clockEdgeLog = [];
    const add = (type, label, x, y, options = {}) => {
      const node = {
        id: `u${++this.nodeSequence}`, type, label: label.slice(0, 32), x, y,
        value: options.value ?? false, q: options.q ?? false,
        width: BUS_TYPES.has(type) ? options.width || 4 : undefined
      };
      this.nodes.push(node);
      return node;
    };
    const wire = (from, output, to, input) => this.wires.push({ from: from.id, output, to: to.id, input });
    const clock = add('CLOCK', 'CLK', 50, 120);
    const stateNodes = new Map();
    states.forEach((state, index) => {
      const node = add('DFF', `STATE · ${state}`, 500, 70 + index * 140, { q: state === initialState });
      stateNodes.set(state, node);
      wire(clock, 0, node, 1);
      const output = add('OUTPUT', state, 900, 70 + index * 140);
      wire(node, 0, output, 0);
    });
    const inputNodes = new Map();
    for (const transition of transitions) {
      if (transition.condition === '*') continue;
      const signal = transition.condition.replace(/^!/, '');
      if (!inputNodes.has(signal)) inputNodes.set(signal, add('INPUT', signal, 50, 300 + inputNodes.size * 100));
    }
    const conditionNodes = new Map();
    for (const transition of transitions) {
      if (transition.condition === '*' || conditionNodes.has(transition.condition)) continue;
      const signalName = transition.condition.replace(/^!/, '');
      let conditionNode = inputNodes.get(signalName);
      if (transition.condition.startsWith('!')) {
        const invert = add('NOT', `NOT · ${signalName}`, 250, 50 + conditionNodes.size * 70);
        wire(conditionNode, 0, invert, 0);
        conditionNode = invert;
      }
      conditionNodes.set(transition.condition, conditionNode);
    }
    for (const state of states) {
      const incoming = transitions.filter((transition) => transition.to === state);
      const terms = incoming.map((transition, index) => {
        const source = stateNodes.get(transition.from);
        if (transition.condition === '*') return { node: source, output: 0 };
        const condition = conditionNodes.get(transition.condition);
        const and = add('AND', `${transition.from} → ${state}`, 330, 50 + index * 80);
        wire(source, 0, and, 0);
        wire(condition, 0, and, 1);
        return { node: and, output: 0 };
      });
      const outgoing = transitions.filter((transition) => transition.from === state);
      if (outgoing.length && !outgoing.some((transition) => transition.condition === '*')) {
        let anyCondition = conditionNodes.get(outgoing[0].condition);
        for (const transition of outgoing.slice(1)) {
          const or = add('OR', `ANY · ${state}`, 270, 430 + stateNodes.get(state).y + outgoing.indexOf(transition) * 25);
          wire(anyCondition, 0, or, 0);
          wire(conditionNodes.get(transition.condition), 0, or, 1);
          anyCondition = or;
        }
        const noTransition = add('NOT', `HOLD · ${state}`, 350, 430 + stateNodes.get(state).y);
        wire(anyCondition, 0, noTransition, 0);
        const hold = add('AND', `HOLD STATE · ${state}`, 420, 430 + stateNodes.get(state).y);
        wire(stateNodes.get(state), 0, hold, 0);
        wire(noTransition, 0, hold, 1);
        terms.push({ node: hold, output: 0 });
      }
      if (!terms.length) terms.push({ node: stateNodes.get(state), output: 0 });
      while (terms.length > 1) {
        const left = terms.shift(), right = terms.shift();
        const or = add('OR', `NEXT · ${state}`, 420, 70 + stateNodes.get(state).y + terms.length * 26);
        wire(left.node, left.output, or, 0);
        wire(right.node, right.output, or, 1);
        terms.push({ node: or, output: 0 });
      }
      wire(terms[0].node, terms[0].output, stateNodes.get(state), 0);
    }
    this.chipName = name;
    this.el.querySelector('[data-chip-name]').value = name;
    this.el.querySelector('[data-chip-title]').textContent = name;
    this.selectedNodeId = null;
    this.selectedNodeIds.clear();
    this.selectedWireIndex = null;
    this.setGroupSelectionMode(false);
    this.fitCanvas();
    this.render();
    this.runSimulation();
    this.setTab('simulate');
    this.setStatus(`Created one-hot FSM with ${states.length} states and ${transitions.length} transitions.`);
  }

  setTab(tab) {
    this.el.querySelectorAll('[data-chip-tab]').forEach((button) => button.classList.toggle('active', button.dataset.chipTab === tab));
    this.el.querySelector('[data-chip-inspector]').hidden = tab !== 'inspect';
    this.el.querySelector('[data-chip-simulation]').hidden = tab !== 'simulate';
    if (tab === 'simulate') this.renderSimulation();
  }

  snapshotDesign() {
    return {
      nodes: structuredClone(this.nodes),
      wires: structuredClone(this.wires),
      chipName: this.chipName,
      designId: this.designId,
      testBench: structuredClone(this.testBench),
      viewBox: this.el.querySelector('.chip-canvas')?.getAttribute('viewBox') || '0 0 1200 740'
    };
  }

  commitHistory(snapshot = this.snapshotDesign()) {
    if (!snapshot) return;
    this.undoStack.push(snapshot);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.updateHistoryControls();
  }

  restoreSnapshot(snapshot) {
    this.stopClock();
    this.nodes = structuredClone(snapshot.nodes);
    this.wires = structuredClone(snapshot.wires);
    this.chipName = snapshot.chipName;
    if (typeof snapshot.designId === 'string') this.designId = snapshot.designId;
    if (snapshot.testBench) this.testBench = structuredClone(snapshot.testBench);
    this.el.querySelector('[data-chip-name]').value = this.chipName;
    this.el.querySelector('[data-chip-title]').textContent = this.chipName;
    this.el.querySelector('.chip-canvas').setAttribute('viewBox', snapshot.viewBox);
    this.selectedNodeId = null;
    this.selectedNodeIds.clear();
    this.selectedWireIndex = null;
    this.pendingPort = null;
    this.resetTrace();
    this.persistTestBenches();
    this.runSimulation();
  }

  undo() {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return;
    this.redoStack.push(this.snapshotDesign());
    this.restoreSnapshot(snapshot);
    this.setStatus('Undo complete.');
    this.updateHistoryControls();
  }

  redo() {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return;
    this.undoStack.push(this.snapshotDesign());
    this.restoreSnapshot(snapshot);
    this.setStatus('Redo complete.');
    this.updateHistoryControls();
  }

  updateHistoryControls() {
    const undo = this.el?.querySelector('[data-chip-action="undo"]');
    const redo = this.el?.querySelector('[data-chip-action="redo"]');
    if (undo) undo.disabled = this.undoStack.length === 0;
    if (redo) redo.disabled = this.redoStack.length === 0;
  }

  readViewBox() {
    const values = this.el.querySelector('.chip-canvas').getAttribute('viewBox').split(/\s+/).map(Number);
    return { x: values[0], y: values[1], width: values[2], height: values[3] };
  }

  zoomCanvas(factor, event) {
    const view = this.readViewBox();
    const rect = this.el.querySelector('.chip-canvas').getBoundingClientRect();
    const cursorX = view.x + (event.clientX - rect.left) / rect.width * view.width;
    const cursorY = view.y + (event.clientY - rect.top) / rect.height * view.height;
    const width = Math.max(140, Math.min(3600, view.width * factor));
    const height = Math.max(100, Math.min(2400, view.height * factor));
    const relativeX = (cursorX - view.x) / view.width;
    const relativeY = (cursorY - view.y) / view.height;
    this.el.querySelector('.chip-canvas').setAttribute('viewBox',
      `${cursorX - relativeX * width} ${cursorY - relativeY * height} ${width} ${height}`);
  }

  tidyLayout() {
    if (this.nodes.length < 2) return;
    this.commitHistory();
    const nodeById = new Map(this.nodes.map((node) => [node.id, node]));
    const depth = new Map(this.nodes.map((node) => [node.id, 0]));
    for (let pass = 0; pass < this.nodes.length; pass += 1) {
      let changed = false;
      for (const wire of this.wires) {
        const next = Math.max(depth.get(wire.to) || 0, (depth.get(wire.from) || 0) + 1);
        if (next !== depth.get(wire.to)) {
          depth.set(wire.to, next);
          changed = true;
        }
      }
      if (!changed) break;
    }
    const columns = new Map();
    for (const node of this.nodes) {
      const column = Math.min(this.nodes.length - 1, depth.get(node.id) || 0);
      if (!columns.has(column)) columns.set(column, []);
      columns.get(column).push(node);
    }
    for (const [column, nodes] of columns) {
      nodes.forEach((node, row) => {
        node.x = 60 + column * 220;
        node.y = 50 + row * 130;
      });
    }
    this.nodes = this.nodes.map((node) => nodeById.get(node.id));
    this.fitCanvas();
    this.runSimulation();
    this.setStatus(`Arranged ${this.nodes.length} components by signal flow.`);
  }

  alignSelection(axis) {
    const selected = this.nodes.filter((node) => this.selectedNodeIds.has(node.id));
    if (selected.length < 2) {
      this.setStatus('Select at least two components to align them.');
      return false;
    }
    this.commitHistory();
    const coordinate = axis === 'x' ? 'y' : 'x';
    const target = selected[0][coordinate];
    selected.slice(1).forEach((node) => { node[coordinate] = target; });
    this.render();
    this.setStatus(`Aligned ${selected.length} selected components on the ${axis === 'x' ? 'horizontal' : 'vertical'} axis.`);
    return true;
  }

  distributeSelection(axis) {
    const selected = this.nodes.filter((node) => this.selectedNodeIds.has(node.id));
    if (selected.length < 3) {
      this.setStatus('Select at least three components to distribute them evenly.');
      return false;
    }
    const coordinate = axis === 'x' ? 'x' : 'y';
    const ordered = [...selected].sort((a, b) => a[coordinate] - b[coordinate]);
    const first = ordered[0][coordinate];
    const last = ordered.at(-1)[coordinate];
    if (last === first) {
      this.setStatus('Move the first or last selected component apart before distributing.');
      return false;
    }
    this.commitHistory();
    const step = (last - first) / (ordered.length - 1);
    ordered.slice(1, -1).forEach((node, index) => {
      node[coordinate] = this.gridSnap ? Math.round((first + step * (index + 1)) / 20) * 20
        : Math.round(first + step * (index + 1));
    });
    this.render();
    this.setStatus(`Evenly spaced ${selected.length} components along the ${axis === 'x' ? 'horizontal' : 'vertical'} axis.`);
    return true;
  }

  findDesignItems(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    const matches = [];
    for (const node of this.nodes) {
      if (`${node.label} ${node.type} ${node.id}`.toLowerCase().includes(normalized)) {
        matches.push({ kind: 'component', id: node.id, label: node.label, detail: node.type });
      }
    }
    for (let index = 0; index < this.wires.length; index += 1) {
      const wire = this.wires[index];
      const source = this.nodes.find((node) => node.id === wire.from);
      const target = this.nodes.find((node) => node.id === wire.to);
      const label = wire.label || `${source?.label || wire.from} → ${target?.label || wire.to}`;
      if (`${label} ${source?.label || ''} ${target?.label || ''}`.toLowerCase().includes(normalized)) {
        matches.push({ kind: 'signal', index, label, detail: 'Signal net' });
      }
    }
    return matches.slice(0, 8);
  }

  renderFindResults(query) {
    const list = this.el.querySelector('[data-chip-find-results]');
    const matches = this.findDesignItems(query);
    list.hidden = !query.trim();
    list.innerHTML = matches.length
      ? matches.map((item) => `<button type="button" data-chip-action="focus-found-item" data-find-kind="${item.kind}" data-find-id="${escapeHTML(item.id || '')}" data-find-index="${item.index ?? ''}"><b>${escapeHTML(item.label)}</b><small>${escapeHTML(item.detail)}</small></button>`).join('')
      : query.trim() ? '<p>No matching components or signals.</p>' : '';
  }

  focusFoundItem(detail) {
    const canvas = this.el.querySelector('.chip-canvas');
    if (detail.findKind === 'signal') {
      const index = Number(detail.findIndex);
      const wire = this.wires[index];
      const source = wire && this.nodes.find((node) => node.id === wire.from);
      const target = wire && this.nodes.find((node) => node.id === wire.to);
      if (!wire || !source || !target) return;
      this.selectedWireIndex = index;
      this.selectedNodeId = null;
      this.selectedNodeIds.clear();
      const left = Math.min(source.x, target.x);
      const top = Math.min(source.y, target.y);
      canvas.setAttribute('viewBox', `${left - 30} ${top - 35} ${Math.max(420, Math.abs(source.x - target.x) + 220)} ${Math.max(180, Math.abs(source.y - target.y) + 120)}`);
      this.render();
      this.setStatus(`Focused signal "${wire.label || `${source.label} → ${target.label}`}".`);
    } else {
      const node = this.nodes.find((entry) => entry.id === detail.findId);
      if (!node) return;
      this.selectedWireIndex = null;
      this.selectedNodeId = node.id;
      this.selectedNodeIds = new Set([node.id]);
      canvas.setAttribute('viewBox', `${node.x - 140} ${node.y - 90} 440 ${Math.max(220, this.nodeHeight(node) + 180)}`);
      this.render();
      this.setTab('inspect');
      this.setStatus(`Focused component "${node.label}".`);
    }
    const search = this.el.querySelector('[data-chip-find]');
    search.value = '';
    this.renderFindResults('');
  }

  selectNode(nodeId, multiSelect = false) {
    this.selectedWireIndex = null;
    if (multiSelect) {
      if (this.selectedNodeIds.has(nodeId)) this.selectedNodeIds.delete(nodeId);
      else this.selectedNodeIds.add(nodeId);
      this.selectedNodeId = nodeId;
    } else {
      this.selectedNodeIds = new Set([nodeId]);
      this.selectedNodeId = nodeId;
    }
    this.render();
  }

  setGroupSelectionMode(active) {
    this.groupSelectMode = active;
    this.el.querySelector('[data-chip-action="group"]')?.classList.toggle('active', active);
  }

  copySelection() {
    const selectedIds = this.selectedNodeIds.size
      ? new Set(this.selectedNodeIds)
      : this.selectedNodeId ? new Set([this.selectedNodeId]) : new Set();
    const selected = this.nodes.filter((node) => selectedIds.has(node.id));
    if (!selected.length) {
      this.setStatus('Select one or more components before copying.');
      return false;
    }
    const copiedIds = new Set(selected.map((node) => node.id));
    this.nodeClipboard = {
      nodes: structuredClone(selected),
      wires: structuredClone(this.wires.filter((wire) => copiedIds.has(wire.from) && copiedIds.has(wire.to)))
    };
    this.setStatus(`Copied ${selected.length} component${selected.length === 1 ? '' : 's'} and ${this.nodeClipboard.wires.length} internal connection${this.nodeClipboard.wires.length === 1 ? '' : 's'}.`);
    return true;
  }

  pasteClipboard() {
    if (!this.nodeClipboard?.nodes?.length) {
      this.setStatus('Copy one or more components before pasting.');
      return false;
    }
    this.commitHistory();
    const idMap = new Map();
    const offset = 40;
    const copies = this.nodeClipboard.nodes.map((source) => {
      const id = `u${++this.nodeSequence}`;
      idMap.set(source.id, id);
      return { ...structuredClone(source), id, label: `${source.label} copy`.slice(0, 32), x: source.x + offset, y: source.y + offset };
    });
    const copiedWires = this.nodeClipboard.wires.map((wire) => ({
      ...structuredClone(wire),
      from: idMap.get(wire.from),
      to: idMap.get(wire.to)
    }));
    this.nodes.push(...copies);
    this.wires.push(...copiedWires);
    this.selectedNodeIds = new Set(copies.map((node) => node.id));
    this.selectedNodeId = copies.at(-1).id;
    this.selectedWireIndex = null;
    this.resetTrace();
    this.runSimulation();
    this.setStatus(`Pasted ${copies.length} component${copies.length === 1 ? '' : 's'} with ${copiedWires.length} internal connection${copiedWires.length === 1 ? '' : 's'}.`);
    return true;
  }

  addNode(type, position) {
    const customChip = this.customChips.find((chip) => chip.id === type);
    const componentType = ['INPUT', 'OUTPUT', 'CLOCK', 'BUS_INPUT', 'BUS_OUTPUT', 'SPLITTER', 'JOINER', 'CONST', 'BUS_CONST', 'VPLUS', 'GROUND'].includes(type) ||
      GATES[type] || customChip ? type : null;
    if (!componentType) return;
    this.commitHistory();
    const siblings = this.nodes.filter((node) => node.type === type).length;
    const placement = this.nodes.length;
    const node = {
      id: `u${++this.nodeSequence}`,
      type: componentType,
      label: `${type === 'INPUT' ? 'Input' : type === 'OUTPUT' ? 'Output' : type === 'CLOCK' ? 'Clock' : type === 'VPLUS' ? 'V+' : type === 'GROUND' ? 'GND' : customChip?.name || type} ${siblings + 1}`,
      x: position?.x ?? 100 + (placement % 4) * 240,
      y: position?.y ?? 100 + Math.floor(placement / 4) * 130,
      value: componentType === 'VPLUS' ? true :
        BUS_INPUT_TYPES.has(componentType) || componentType === 'BUS_CONST' ? 0 : false,
      q: false,
      width: BUS_TYPES.has(componentType) ? componentType === 'DECODER' ? 2 : 4 : undefined,
      memory: componentType === 'RAM' ? Array(4).fill(0) : undefined,
      counter: 0,
      phase: 0,
      addressWidth: componentType === 'RAM' ? 2 : undefined,
      definition: customChip ? structuredClone(customChip) : undefined
    };
    this.resetTrace();
    this.nodes.push(node);
    this.selectedNodeId = node.id;
    this.selectedNodeIds = new Set([node.id]);
    this.pendingPort = null;
    this.runSimulation();
    this.setTab('inspect');
  }

  loadPreset(preset) {
    this.commitHistory();
    this.resetTrace();
    this.stopClock();
    this.nodes = [];
    this.wires = [];
    this.nodeSequence = 0;
    this.clockEdgeCount = 0;
    this.clockEdgeLog = [];
    this.selectedNodeIds.clear();
    this.setGroupSelectionMode(false);
    const add = (type, label, x, y, options = {}) => {
      const node = {
        id: `u${++this.nodeSequence}`, type, label, x, y,
        value: options.value ?? false, q: options.q ?? false,
        width: BUS_TYPES.has(type) ? options.width || 4 : undefined,
        phase: options.phase || 0,
        memory: type === 'RAM' ? Array(4).fill(0) : undefined,
        addressWidth: type === 'RAM' ? 2 : undefined
      };
      this.nodes.push(node);
      return node;
    };
    if (preset === 'traffic-light') {
      this.buildStateMachine(
        ['RED', 'GREEN', 'YELLOW'],
        [{ from: 'RED', condition: '*', to: 'GREEN' },
          { from: 'GREEN', condition: '*', to: 'YELLOW' },
          { from: 'YELLOW', condition: '*', to: 'RED' }],
        'RED',
        'Traffic Light FSM'
      );
      return;
    }
    if (preset === 'half-adder') {
      const a = add('INPUT', 'A · A0', 140, 260);
      const b = add('INPUT', 'B · A1', 140, 420);
      const xor = add('XOR', 'XOR · SUM', 500, 260);
      const and = add('AND', 'AND · CARRY', 500, 440);
      const sum = add('OUTPUT', 'SUM · S', 850, 260);
      const carry = add('OUTPUT', 'CARRY · C', 850, 440);
      this.connect(a, 0, xor, 0); this.connect(a, 0, and, 0);
      this.connect(b, 0, xor, 1); this.connect(b, 0, and, 1);
      this.connect(xor, 0, sum, 0); this.connect(and, 0, carry, 0);
      this.chipName = 'Half Adder';
    } else if (preset === 'full-adder') {
      const a = add('INPUT', 'A · A0', 80, 170);
      const b = add('INPUT', 'B · A1', 80, 330);
      const cin = add('INPUT', 'CIN · A2', 80, 500);
      const xor1 = add('XOR', 'XOR1 · A ⊕ B', 350, 220);
      const xor2 = add('XOR', 'XOR2 · SUM', 650, 260);
      const and1 = add('AND', 'AND1 · A · B', 350, 440);
      const and2 = add('AND', 'AND2 · X · CIN', 650, 450);
      const or = add('OR', 'OR · CARRY', 900, 430);
      const sum = add('OUTPUT', 'SUM · S', 930, 180);
      const carry = add('OUTPUT', 'CARRY · COUT', 1030, 430);
      this.connect(a, 0, xor1, 0); this.connect(a, 0, and1, 0);
      this.connect(b, 0, xor1, 1); this.connect(b, 0, and1, 1);
      this.connect(xor1, 0, xor2, 0); this.connect(xor1, 0, and2, 0);
      this.connect(cin, 0, xor2, 1); this.connect(cin, 0, and2, 1);
      this.connect(and1, 0, or, 0); this.connect(and2, 0, or, 1);
      this.connect(xor2, 0, sum, 0); this.connect(or, 0, carry, 0);
      this.chipName = 'Full Adder';
    } else if (preset === 'counter') {
      const enable = add('INPUT', 'ENABLE', 70, 160, { value: true });
      const reset = add('INPUT', 'RESET', 70, 330);
      const clock = add('CLOCK', 'CLK', 70, 500);
      const counter = add('COUNTER', '4-bit counter', 430, 260, { width: 4, q: 0 });
      const output = add('BUS_OUTPUT', 'COUNT[3:0]', 830, 260, { width: 4 });
      this.connect(enable, 0, counter, 0);
      this.connect(reset, 0, counter, 1);
      this.connect(clock, 0, counter, 2);
      this.connect(counter, 0, output, 0);
      this.chipName = 'Enabled 4-bit Counter';
    } else if (preset === 'accumulator') {
      const data = add('BUS_INPUT', 'ADDEND[3:0]', 50, 170, { width: 4, value: 1 });
      const clock = add('CLOCK', 'CLK', 50, 430);
      const accumulator = add('REGISTER', 'ACC[3:0]', 450, 280, { width: 4, q: 0 });
      const adder = add('ADDER', 'ACC + ADDEND', 230, 280, { width: 4 });
      const carryIn = add('CONST', 'CIN · 0', 230, 500, { value: false });
      const output = add('BUS_OUTPUT', 'SUM[3:0]', 820, 280, { width: 4 });
      this.connect(accumulator, 0, adder, 0);
      this.connect(data, 0, adder, 1);
      this.connect(carryIn, 0, adder, 2);
      this.connect(adder, 0, accumulator, 0);
      this.connect(clock, 0, accumulator, 1);
      this.connect(accumulator, 0, output, 0);
      this.chipName = '4-bit Accumulator';
    } else if (preset === 'ram-demo') {
      const data = add('BUS_INPUT', 'DATA[3:0]', 40, 100, { width: 4, value: 9 });
      const address = add('BUS_INPUT', 'ADDR[1:0]', 40, 250, { width: 2, value: 1 });
      const write = add('INPUT', 'WRITE ENABLE', 40, 400, { value: true });
      const clock = add('CLOCK', 'CLK', 40, 540);
      const ram = add('RAM', '4 × 4 RAM', 440, 260, { width: 4, q: 0 });
      const output = add('BUS_OUTPUT', 'READ DATA[3:0]', 850, 260, { width: 4 });
      this.connect(data, 0, ram, 0);
      this.connect(address, 0, ram, 1);
      this.connect(write, 0, ram, 2);
      this.connect(clock, 0, ram, 3);
      this.connect(ram, 0, output, 0);
      this.chipName = 'Synchronous RAM Demo';
    }
    this.el.querySelector('[data-chip-name]').value = this.chipName;
    this.el.querySelector('[data-chip-title]').textContent = this.chipName;
    this.selectedNodeId = null;
    this.render();
    this.runSimulation();
    this.setTab('simulate');
  }

  connect(source, outputIndex, target, inputIndex) {
    this.commitHistory();
    const portNames = source.type === 'ADDER' ? ['SUM', 'COUT']
      : source.type === 'COMPARATOR' ? ['GT', 'EQ', 'LT'] : null;
    const label = this.autoLabelNets
      ? `${source.label}${this.outputCount(source) > 1 ? `.${portNames?.[outputIndex] || `Q${outputIndex}`}` : ''}`.slice(0, 32)
      : undefined;
    this.wires.push({ from: source.id, output: outputIndex, to: target.id, input: inputIndex, label });
    this.selectedWireIndex = null;
    this.resetTrace();
  }

  inputCount(node) {
    if (node.type === 'BUS_INPUT' || node.type === 'BUS_CONST' || node.type === 'CONST') return 0;
    if (node.type === 'SPLITTER') return 1;
    if (node.type === 'JOINER') return node.width || 4;
    if (node.type === 'BUS_OUTPUT') return 1;
    if (node.type === 'OUTPUT') return 1;
    if (node.type === 'DFF') return 2;
    if (node.type === 'SR_DFF' || node.type === 'RAM') return 4;
    if (node.type === 'REGISTER' || node.type === 'CLOCK_DIVIDER') return 2;
    if (node.type === 'COUNTER' || node.type === 'MUX' || node.type === 'ADDER') return 3;
    if (node.type === 'COMPARATOR') return 2;
    if (node.type === 'DECODER') return node.width || 2;
    if (node.type === 'CUSTOM') return node.definition?.inputs?.length || 0;
    return GATES[node.type]?.inputs || 0;
  }

  outputCount(node) {
    if (node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT') return 0;
    if (node.type === 'BUS_INPUT' || node.type === 'BUS_CONST' || node.type === 'CONST' || node.type === 'JOINER' ||
        BUS_GATE_TYPES.has(node.type) || ['MUX', 'REGISTER', 'COUNTER', 'CLOCK_DIVIDER', 'RAM'].includes(node.type)) return 1;
    if (node.type === 'SPLITTER') return node.width || 4;
    if (node.type === 'ADDER') return 2;
    if (node.type === 'COMPARATOR') return 3;
    if (node.type === 'DECODER') return 1 << (node.width || 2);
    if (node.type === 'CUSTOM') return node.definition?.outputs?.length || 0;
    return 1;
  }

  portSignalKind(node, direction, index) {
    if ((node.type === 'BUS_INPUT' || node.type === 'BUS_CONST') && direction === 'out' ||
        node.type === 'BUS_OUTPUT' && direction === 'in' ||
        node.type === 'SPLITTER' && direction === 'in' ||
        node.type === 'JOINER' && direction === 'out' ||
        BUS_GATE_TYPES.has(node.type) ||
        ['MUX', 'REGISTER', 'COUNTER', 'RAM'].includes(node.type) && (direction === 'out' || node.type === 'MUX' && index < 2 || node.type === 'REGISTER' && index === 0 || node.type === 'RAM' && (index === 0 || index === 1)) ||
        node.type === 'ADDER' && (direction === 'in' ? index < 2 : index === 0) ||
        node.type === 'COMPARATOR' && direction === 'in') return 'bus';
    return 'bit';
  }

  portWidth(node, direction, index) {
    if (node.type === 'RAM' && direction === 'in' && index === 1) return node.addressWidth || 2;
    return this.portSignalKind(node, direction, index) === 'bus' ? node.width || 4 : 1;
  }

  portsCompatible(source, output, target, input) {
    return this.portSignalKind(source, 'out', output) === this.portSignalKind(target, 'in', input) &&
      this.portWidth(source, 'out', output) === this.portWidth(target, 'in', input);
  }

  signalValue(outputs, wire) {
    const value = outputs.get(wire.from);
    return Array.isArray(value) ? value[wire.output] : wire.output === 0 ? value : undefined;
  }

  loadCustomChips() {
    try {
      const chips = JSON.parse(localStorage.getItem(CHIP_LIBRARY_KEY) || '[]');
      const valid = (chip, depth = 0) => depth < 16 && chip && typeof chip.id === 'string' && typeof chip.name === 'string' &&
        Array.isArray(chip.inputs) && chip.inputs.every((pin) => typeof pin.id === 'string' && typeof pin.label === 'string') &&
        Array.isArray(chip.outputs) && chip.outputs.every((pin) => typeof pin.id === 'string' && typeof pin.label === 'string') &&
        Array.isArray(chip.components) && chip.components.every((node) =>
          node && typeof node.id === 'string' && typeof node.type === 'string' && typeof node.label === 'string' &&
          Number.isFinite(node.x) && Number.isFinite(node.y) &&
          (['INPUT', 'OUTPUT', 'CLOCK', 'BUS_INPUT', 'BUS_OUTPUT', 'SPLITTER', 'JOINER', 'CONST', 'BUS_CONST', 'VPLUS', 'GROUND'].includes(node.type) ||
            Object.hasOwn(GATES, node.type) || node.type === 'CUSTOM' && valid(node.definition, depth + 1)) &&
          (!BUS_TYPES.has(node.type) ||
            BUS_WIDTHS.includes(node.width || 4))
        ) && Array.isArray(chip.wires) && chip.wires.every((wire) =>
          wire && typeof wire.from === 'string' && typeof wire.to === 'string' &&
          Number.isInteger(wire.output) && Number.isInteger(wire.input)
        );
      return Array.isArray(chips) ? chips.filter((chip) =>
        chip && typeof chip.id === 'string' && typeof chip.name === 'string' &&
        valid(chip)
      ) : [];
    } catch (error) {
      console.error('Could not load reusable chip library:', error);
      return [];
    }
  }

  validateCustomDefinition(chip, depth = 0, budget = { count: 0 }) {
    if (depth > 16 || !chip || typeof chip.id !== 'string' || typeof chip.name !== 'string' ||
        !Array.isArray(chip.inputs) || !Array.isArray(chip.outputs) ||
        !Array.isArray(chip.components) || !Array.isArray(chip.wires)) return false;
    budget.count += chip.components.length + chip.wires.length;
    if (budget.count > 4000) return false;
    const componentIds = new Set();
    for (const node of chip.components) {
      if (!node || typeof node.id !== 'string' || componentIds.has(node.id) ||
          typeof node.label !== 'string' || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return false;
      componentIds.add(node.id);
      if (!(node.type === 'INPUT' || node.type === 'OUTPUT' || node.type === 'CLOCK' ||
          node.type === 'BUS_INPUT' || node.type === 'BUS_OUTPUT' || node.type === 'SPLITTER' || node.type === 'JOINER' || node.type === 'CONST' || node.type === 'BUS_CONST' || node.type === 'VPLUS' || node.type === 'GROUND' ||
          Object.hasOwn(GATES, node.type) ||
          node.type === 'CUSTOM' && this.validateCustomDefinition(node.definition, depth + 1, budget))) return false;
      if (BUS_TYPES.has(node.type) &&
          !BUS_WIDTHS.includes(node.width || 4)) return false;
    }
    const inputPins = chip.components.filter((node) => node.type === 'INPUT');
    const outputPins = chip.components.filter((node) => node.type === 'OUTPUT');
    if (inputPins.length !== chip.inputs.length || outputPins.length !== chip.outputs.length ||
        chip.inputs.some((pin, index) => pin?.id !== inputPins[index]?.id || typeof pin.label !== 'string') ||
        chip.outputs.some((pin, index) => pin?.id !== outputPins[index]?.id || typeof pin.label !== 'string')) return false;
    const seenInputs = new Set();
    for (const wire of chip.wires) {
      const source = chip.components.find((node) => node.id === wire?.from);
      const target = chip.components.find((node) => node.id === wire?.to);
      if (!source || !target || source.type === 'OUTPUT' || target.type === 'INPUT' ||
          !Number.isInteger(wire.output) || wire.output < 0 || wire.output >= this.outputCount(source) ||
          !Number.isInteger(wire.input) || wire.input < 0 || wire.input >= this.inputCount(target) ||
          !this.portsCompatible(source, wire.output, target, wire.input) ||
          seenInputs.has(`${target.id}:${wire.input}`)) return false;
      seenInputs.add(`${target.id}:${wire.input}`);
    }
    return true;
  }

  saveCustomChips() {
    try {
      localStorage.setItem(CHIP_LIBRARY_KEY, JSON.stringify(this.customChips));
    } catch (error) {
      this.setStatus(`Could not save reusable chip library: ${error.message}`);
      throw error;
    }
  }

  renderCustomChipLibrary() {
    const list = this.el.querySelector('[data-chip-library-list]');
    list.innerHTML = this.customChips.length
      ? this.customChips.map((chip) => `<button class="chip-library-item" data-chip-insert="${escapeHTML(chip.id)}"><i class="chip-gate-icon custom">IC</i><span><b>${escapeHTML(chip.name)}</b><small>${chip.inputs.length} inputs · ${chip.outputs.length} outputs</small></span></button>`).join('')
      : '<p class="chip-library-empty">No saved subcircuits yet. Select a block with I/O pins and create one.</p>';
  }

  openSubcircuitDialog() {
    const selected = this.nodes.filter((node) => this.selectedNodeIds.has(node.id));
    const ids = new Set(selected.map((node) => node.id));
    const crossingWire = this.wires.some((wire) => ids.has(wire.from) !== ids.has(wire.to));
    const inputs = selected.filter((node) => node.type === 'INPUT');
    const outputs = selected.filter((node) => node.type === 'OUTPUT');
    const internals = selected.some((node) => node.type !== 'INPUT' && node.type !== 'OUTPUT');
    const sequential = selected.some((node) => this.containsSequentialLogic(node));
    const unsupportedBus = selected.some((node) => BUS_TYPES.has(node.type) || node.type === 'BUS_CONST');
    if (!selected.length || crossingWire || !inputs.length || !outputs.length || !internals || sequential || unsupportedBus) {
      this.setStatus('Select a closed, single-bit combinational block with I/O pins; bus circuits, clocked logic, and boundary-crossing wires are not supported yet.');
      return;
    }
    const modal = this.el.querySelector('[data-chip-subcircuit-modal]');
    modal.querySelector('[data-subcircuit-name]').value = `${this.chipName} Block`;
    modal.querySelector('[data-subcircuit-summary]').textContent =
      `${selected.length} components · ${inputs.length} input pins · ${outputs.length} output pins. Selected logic must be fully wired within this block; no external wires can cross its boundary.`;
    modal.hidden = false;
  }

  createSubcircuit() {
    this.commitHistory();
    const selected = this.nodes.filter((node) => this.selectedNodeIds.has(node.id));
    const ids = new Set(selected.map((node) => node.id));
    const inputs = selected.filter((node) => node.type === 'INPUT');
    const outputs = selected.filter((node) => node.type === 'OUTPUT');
    const hasCrossingWire = this.wires.some((wire) => ids.has(wire.from) !== ids.has(wire.to));
    const hasLogic = selected.some((node) => node.type !== 'INPUT' && node.type !== 'OUTPUT');
    const unsupportedBus = selected.some((node) => BUS_TYPES.has(node.type) || node.type === 'BUS_CONST');
    if (!selected.length || !inputs.length || !outputs.length || !hasLogic || hasCrossingWire || unsupportedBus || selected.some((node) => this.containsSequentialLogic(node))) {
      this.el.querySelector('[data-chip-subcircuit-modal]').hidden = true;
      this.setStatus('Selection changed. Select a closed, single-bit combinational block with input and output pins, then try again.');
      return;
    }
    const wires = this.wires.filter((wire) => ids.has(wire.from) && ids.has(wire.to));
    const x = Math.max(20, Math.min(1000, Math.min(...selected.map((node) => node.x))));
    const y = Math.max(20, Math.min(620, Math.min(...selected.map((node) => node.y))));
    const rawName = this.el.querySelector('[data-subcircuit-name]').value.trim();
    const name = rawName || 'Custom Chip';
    const definition = {
      id: `chip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.slice(0, 40),
      inputs: inputs.map(({ id, label }) => ({ id, label })),
      outputs: outputs.map(({ id, label }) => ({ id, label })),
      components: structuredClone(selected),
      wires: structuredClone(wires)
    };
    this.resetTrace();
    this.customChips.push(definition);
    try {
      this.saveCustomChips();
    } catch {
      this.customChips.pop();
      return;
    }
    this.wires = this.wires.filter((wire) => !ids.has(wire.from) || !ids.has(wire.to));
    this.nodes = this.nodes.filter((node) => !ids.has(node.id));
    const instance = {
      id: `u${++this.nodeSequence}`,
      type: 'CUSTOM',
      label: definition.name,
      x,
      y,
      definition,
      value: false
    };
    this.nodes.push(instance);
    this.selectedNodeId = instance.id;
    this.selectedNodeIds = new Set([instance.id]);
    this.el.querySelector('[data-chip-subcircuit-modal]').hidden = true;
    this.setGroupSelectionMode(false);
    this.renderCustomChipLibrary();
    this.runSimulation();
    this.setStatus(`Created reusable chip "${definition.name}" and replaced its ${selected.length} selected components.`);
  }

  insertCustomChip(chipId) {
    const definition = this.customChips.find((chip) => chip.id === chipId);
    if (!definition) return;
    this.commitHistory();
    const index = this.nodes.filter((node) => node.type === 'CUSTOM' && node.definition?.id === chipId).length + 1;
    const placement = this.nodes.length;
    const node = {
      id: `u${++this.nodeSequence}`,
      type: 'CUSTOM',
      label: `${definition.name} ${index}`,
      x: 100 + (placement % 4) * 240,
      y: 100 + Math.floor(placement / 4) * 130,
      definition: structuredClone(definition),
      value: false
    };
    this.nodes.push(node);
    this.selectedNodeId = node.id;
    this.selectedNodeIds = new Set([node.id]);
    this.runSimulation();
    this.setTab('inspect');
  }

  containsSequentialLogic(node, depth = 0) {
    if (depth > 16 || node.type === 'CLOCK' || SEQUENTIAL_TYPES.has(node.type)) return true;
    return node.type === 'CUSTOM' && node.definition.components.some((component) =>
      this.containsSequentialLogic(component, depth + 1)
    );
  }

  handlePort(nodeId, direction, portIndex) {
    const node = this.nodes.find((entry) => entry.id === nodeId);
    if (!node) return;
    if (!this.pendingPort) {
      if (direction !== 'out') {
        this.setStatus('Start a connection at an output pin.');
        return;
      }
      this.pendingPort = { nodeId, direction, portIndex };
      this.selectedNodeId = nodeId;
      this.selectedNodeIds = new Set([nodeId]);
      this.setStatus(`Wire from ${node.label}: choose a destination input.`);
      this.renderCanvas();
      return;
    }
    if (direction !== 'in') {
      this.setStatus('Choose an input pin to complete the wire, or press Esc to cancel.');
      return;
    }
    if (this.pendingPort.nodeId === nodeId) {
      this.setStatus('A component cannot connect to itself.');
      return;
    }
    const source = this.nodes.find((entry) => entry.id === this.pendingPort.nodeId);
    if (!source || !this.portsCompatible(source, this.pendingPort.portIndex, node, portIndex)) {
      this.setStatus('These ports have incompatible signal types or bus widths.');
      return;
    }
    const occupied = this.wires.some((wire) => wire.to === nodeId && wire.input === portIndex);
    if (occupied) {
      this.setStatus('That input is already connected. Remove its wire before reconnecting.');
      return;
    }
    this.connect(source, this.pendingPort.portIndex, node, portIndex);
    this.pendingPort = null;
    this.runSimulation();
  }

  toggleInput(nodeId) {
    const node = this.nodes.find((entry) => entry.id === nodeId && (entry.type === 'INPUT' || entry.type === 'CONST'));
    if (!node) return;
    this.commitHistory();
    node.value = !node.value;
    this.runSimulation();
    this.recordTrace();
  }

  changeBusValue(nodeId, rawValue) {
    const node = this.nodes.find((entry) => entry.id === nodeId && (entry.type === 'BUS_INPUT' || entry.type === 'BUS_CONST'));
    const value = Number(rawValue);
    if (!node || !Number.isInteger(value) || value < 0 || value > BUS_MASK(node.width || 4)) {
      this.setStatus('Bus input must be a whole number within its configured width.');
      this.renderInspector();
      return;
    }
    this.commitHistory();
    node.value = value;
    this.runSimulation();
    this.recordTrace();
  }

  changeBusWidth(nodeId, width) {
    const node = this.nodes.find((entry) => entry.id === nodeId);
    if (!node || !BUS_TYPES.has(node.type)) return;
    const allowedWidths = node.type === 'DECODER' ? [2, 3, 4] : BUS_WIDTHS;
    if (!allowedWidths.includes(width)) {
      this.renderInspector();
      return;
    }
    this.commitHistory();
    node.width = width;
    if (node.type === 'BUS_INPUT' || node.type === 'BUS_CONST') node.value = Number(node.value) & BUS_MASK(width);
    const before = this.wires.length;
    this.wires = this.wires.filter((wire) => {
      const source = this.nodes.find((entry) => entry.id === wire.from);
      const target = this.nodes.find((entry) => entry.id === wire.to);
      return source && target && wire.output < this.outputCount(source) && wire.input < this.inputCount(target) &&
        this.portsCompatible(source, wire.output, target, wire.input);
    });
    this.resetTrace();
    this.runSimulation();
    this.setStatus(before === this.wires.length
      ? `Bus width set to ${width} bits.`
      : `Bus width set to ${width} bits; removed ${before - this.wires.length} incompatible connection(s).`);
  }

  deleteNode(nodeId) {
    const deleting = this.nodes.find((node) => node.id === nodeId);
    if (this.editStack.length && (deleting?.type === 'INPUT' || deleting?.type === 'OUTPUT')) {
      this.setStatus('Chip interface pins cannot be deleted while editing a reusable chip.');
      return;
    }
    this.resetTrace();
    this.commitHistory();
    this.nodes = this.nodes.filter((node) => node.id !== nodeId);
    if (!this.nodes.some((node) => node.type === 'CLOCK') || !this.nodes.some((node) => SEQUENTIAL_TYPES.has(node.type))) this.stopClock();
    this.wires = this.wires.filter((wire) => wire.from !== nodeId && wire.to !== nodeId);
    if (this.selectedNodeId === nodeId) this.selectedNodeId = null;
    this.selectedNodeIds.delete(nodeId);
    this.pendingPort = null;
    this.runSimulation();
  }

  deleteWire(index) {
    this.commitHistory();
    this.wires.splice(index, 1);
    this.selectedWireIndex = null;
    this.resetTrace();
    this.runSimulation();
  }

  pulseClock() {
    if (this.clockTimer) this.stopClock();
    const clocks = this.nodes.filter((node) => node.type === 'CLOCK');
    const sequential = this.nodes.filter((node) => SEQUENTIAL_TYPES.has(node.type));
    if (!clocks.length || !sequential.length) {
      this.setStatus('Add a clock source and connect it to a sequential component first.');
      return;
    }
    clocks.forEach((clock) => { clock.value = false; });
    clocks.forEach((clock) => { clock.value = true; });
    const captured = this.captureClockEdge();
    this.runSimulation();
    this.recordTrace();
    clocks.forEach((clock) => { clock.value = false; });
    this.runSimulation();
    this.recordTrace();
    this.setStatus(captured
      ? `Rising clock edge · updated ${captured} sequential component${captured === 1 ? '' : 's'}.`
      : 'Clock pulse sent · no sequential component had a connected clock.');
  }

  captureClockEdge() {
    const edgeState = this.evaluate();
    const previousSignals = new Map(edgeState.outputs);
    this.clockEdgeLog ||= [];
    this.clockEdgeCount ||= 0;
    const previous = new Map(this.nodes.filter((node) => SEQUENTIAL_TYPES.has(node.type))
      .map((node) => [node.id, this.describeSequentialState(node)]));
    let captured = 0;
    const sample = (node, input) => {
      const wire = this.wires.find((entry) => entry.to === node.id && entry.input === input);
      if (!wire) return { wire: null, value: undefined };
      return { wire, value: this.signalValue(edgeState.outputs, wire) };
    };
    const rising = (node, input) => {
      const { wire, value } = sample(node, input);
      return wire && this.nodes.find((entry) => entry.id === wire.from)?.type === 'CLOCK' && value === true;
    };
    for (const node of this.nodes.filter((entry) => SEQUENTIAL_TYPES.has(entry.type))) {
      if (node.type === 'DFF' || node.type === 'SR_DFF') {
        const clockIndex = 1;
        if (!rising(node, clockIndex)) continue;
        const data = sample(node, 0).value;
        if (typeof data !== 'boolean') continue;
        const set = node.type === 'SR_DFF' && sample(node, 2).value === true;
        const reset = node.type === 'SR_DFF' && sample(node, 3).value === true;
        node.q = reset ? false : set ? true : data;
        captured += 1;
      } else if (node.type === 'REGISTER') {
        if (!rising(node, 1)) continue;
        const data = sample(node, 0).value;
        if (typeof data !== 'number') continue;
        node.q = data & BUS_MASK(node.width || 4);
        captured += 1;
      } else if (node.type === 'COUNTER') {
        if (!rising(node, 2)) continue;
        const enabled = sample(node, 0).value === true;
        const reset = sample(node, 1).value === true;
        node.q = reset ? 0 : enabled ? ((Number(node.q) || 0) + 1) & BUS_MASK(node.width || 4) : Number(node.q) || 0;
        captured += 1;
      } else if (node.type === 'CLOCK_DIVIDER') {
        if (!rising(node, 0)) continue;
        if (sample(node, 1).value === true) {
          node.phase = 0;
          node.q = false;
        } else {
          node.phase = (node.phase || 0) + 1;
          const divisor = 2 ** (node.width || 2);
          if (node.phase >= divisor) {
            node.phase = 0;
            node.q = !node.q;
          }
        }
        captured += 1;
      } else if (node.type === 'RAM') {
        if (!rising(node, 3)) continue;
        const data = sample(node, 0).value;
        const address = sample(node, 1).value;
        const write = sample(node, 2).value === true;
        if (typeof address !== 'number') continue;
        node.memory ||= Array(2 ** (node.addressWidth || 2)).fill(0);
        const location = address & (node.memory.length - 1);
        if (write && typeof data === 'number') node.memory[location] = data & BUS_MASK(node.width || 4);
        node.q = node.memory[location];
        captured += 1;
      }
    }
    if (captured) {
      this.clockEdgeCount += 1;
      const changes = this.nodes.filter((node) => SEQUENTIAL_TYPES.has(node.type) &&
        previous.get(node.id) !== this.describeSequentialState(node))
        .map((node) => `${node.label}: ${previous.get(node.id)} → ${this.describeSequentialState(node)}`);
      this.clockEdgeLog.unshift({ edge: this.clockEdgeCount, changes });
      this.clockEdgeLog = this.clockEdgeLog.slice(0, 12);
      if (this.clockTimer) {
        this.breakpointNodeIds ||= new Set();
        const nextSignals = this.evaluate().outputs;
        const changedBreakpoint = this.nodes.find((node) => this.breakpointNodeIds.has(node.id) &&
          JSON.stringify(previousSignals.get(node.id)) !== JSON.stringify(nextSignals.get(node.id)));
        if (changedBreakpoint) this.breakpointHit = changedBreakpoint.label;
      }
    }
    return captured;
  }

  describeSequentialState(node) {
    if (node.type === 'RAM') return `Q=${Number(node.q) || 0}, RAM=[${(node.memory || [0, 0, 0, 0]).join(',')}]`;
    if (node.type === 'REGISTER' || node.type === 'COUNTER') return `Q=${Number(node.q) || 0}`;
    if (node.type === 'CLOCK_DIVIDER') return `Q=${Number(Boolean(node.q))}, phase=${Number(node.phase) || 0}`;
    return `Q=${Number(Boolean(node.q))}`;
  }

  stepClock() {
    this.pulseClock();
  }

  startClock() {
    if (!this.nodes.some((node) => node.type === 'CLOCK') || !this.nodes.some((node) => SEQUENTIAL_TYPES.has(node.type))) {
      this.setStatus('Add a clock source and a sequential component before starting automatic clocking.');
      return;
    }
    this.stopClock();
    this.clockHigh = false;
    this.clockTimer = window.setInterval(() => {
      this.clockHigh = !this.clockHigh;
      const clocks = this.nodes.filter((node) => node.type === 'CLOCK');
      clocks.forEach((clock) => { clock.value = this.clockHigh; });
      if (this.clockHigh) {
        this.breakpointHit = null;
        this.captureClockEdge();
      }
      if (this.breakpointHit) {
        window.clearInterval(this.clockTimer);
        this.clockTimer = null;
        this.clockHigh = false;
        clocks.forEach((clock) => { clock.value = false; });
      }
      this.runSimulation();
      this.recordTrace();
      if (this.breakpointHit) {
        this.setStatus(`Clock paused at breakpoint · "${this.breakpointHit}" changed.`);
        this.breakpointHit = null;
      }
    }, Math.max(100, this.clockPeriod / 2));
    this.renderSimulation();
    this.setStatus(`Automatic clock running · ${this.clockPeriod} ms period.`);
  }

  stopClock() {
    if (this.clockTimer) window.clearInterval(this.clockTimer);
    this.clockTimer = null;
    this.clockHigh = false;
    this.nodes.filter((node) => node.type === 'CLOCK').forEach((clock) => { clock.value = false; });
    if (this.el && !this.el.hidden) {
      this.renderCanvas();
      if (!this.el.querySelector('[data-chip-simulation]').hidden) this.renderSimulation();
    }

  }

  toggleWatch(nodeId) {
    this.watchNodeIds ||= new Set();
    const node = this.nodes.find((entry) => entry.id === nodeId);
    if (!node) return false;
    if (this.watchNodeIds.has(nodeId)) this.watchNodeIds.delete(nodeId);
    else this.watchNodeIds.add(nodeId);
    this.render();
    this.setStatus(this.watchNodeIds.has(nodeId)
      ? `Watching "${node.label}" in the simulation panel.`
      : `Removed "${node.label}" from the watch list.`);
    return true;
  }

  toggleBreakpoint(nodeId) {
    this.breakpointNodeIds ||= new Set();
    const node = this.nodes.find((entry) => entry.id === nodeId);
    if (!node || !SEQUENTIAL_TYPES.has(node.type)) {
      this.setStatus('Clock breakpoints can only be set on sequential components.');
      return false;
    }
    if (this.breakpointNodeIds.has(nodeId)) this.breakpointNodeIds.delete(nodeId);
    else this.breakpointNodeIds.add(nodeId);
    this.render();
    this.setStatus(this.breakpointNodeIds.has(nodeId)
      ? `Automatic clock will pause when "${node.label}" changes state.`
      : `Removed the clock breakpoint on "${node.label}".`);
    return true;
  }

  openCustomChipEditor() {
    const instance = this.nodes.find((node) => node.id === this.selectedNodeId && node.type === 'CUSTOM');
    if (!instance?.definition) return;
    const ancestors = this.editStack.map((frame) => frame.definition.id);
    if (ancestors.includes(instance.definition.id)) {
      this.setStatus('This chip is already open above; editing it here would create a recursive definition.');
      return;
    }
    this.stopClock();
    this.editStack.push({
      nodes: this.nodes,
      wires: this.wires,
      chipName: this.chipName,
      selectedNodeId: this.selectedNodeId,
      selectedNodeIds: new Set(this.selectedNodeIds),
      instanceId: instance.id,
      definition: structuredClone(instance.definition),
      inputs: instance.definition.inputs.map((pin) => pin.id),
      outputs: instance.definition.outputs.map((pin) => pin.id)
    });
    this.nodes = structuredClone(instance.definition.components);
    this.wires = structuredClone(instance.definition.wires);
    this.chipName = instance.definition.name;
    this.el.querySelector('[data-chip-name]').value = this.chipName;
    this.el.querySelector('[data-chip-title]').textContent = this.chipName;
    this.selectedNodeId = null;
    this.selectedNodeIds.clear();
    this.resetTrace();
    this.updateEditControls();
    this.render();
    this.setStatus(`Editing internals of "${this.chipName}". Its input and output interface pins are fixed.`);
  }

  saveCustomChipEdits() {
    const frame = this.editStack[this.editStack.length - 1];
    if (!frame) return;
    const inputs = this.nodes.filter((node) => node.type === 'INPUT');
    const outputs = this.nodes.filter((node) => node.type === 'OUTPUT');
    if (inputs.length !== frame.inputs.length || outputs.length !== frame.outputs.length ||
        frame.inputs.some((id, index) => inputs[index]?.id !== id) ||
        frame.outputs.some((id, index) => outputs[index]?.id !== id)) {
      this.setStatus('The reusable chip input/output pins must remain in their original order and cannot be removed.');
      return;
    }
    const updated = {
      ...frame.definition,
      name: this.chipName.slice(0, 40),
      inputs: inputs.map(({ id, label }) => ({ id, label })),
      outputs: outputs.map(({ id, label }) => ({ id, label })),
      components: structuredClone(this.nodes),
      wires: structuredClone(this.wires)
    };
    const hasRecursiveChild = updated.components.some((node) =>
      node.type === 'CUSTOM' && this.definitionContains(node.definition, updated.id)
    );
    if (hasRecursiveChild) {
      this.setStatus('A chip cannot contain itself, directly or through another reusable chip.');
      return;
    }
    const previousLibrary = this.customChips;
    const nextLibrary = previousLibrary.map((definition) => this.replaceChipDefinition(definition, updated.id, updated));
    this.customChips = nextLibrary;
    try {
      this.saveCustomChips();
    } catch {
      this.customChips = previousLibrary;
      return;
    }
    this.editStack.pop();
    this.nodes = frame.nodes;
    this.wires = frame.wires;
    this.nodes = this.nodes.map((node) => this.replaceNodeDefinition(node, updated.id, updated));
    const instance = this.nodes.find((node) => node.id === frame.instanceId);
    if (instance) instance.definition = structuredClone(updated);
    this.chipName = frame.chipName;
    this.el.querySelector('[data-chip-name]').value = this.chipName;
    this.el.querySelector('[data-chip-title]').textContent = this.chipName;
    this.selectedNodeId = frame.instanceId;
    this.selectedNodeIds = new Set([frame.instanceId]);
    this.resetTrace();
    this.updateEditControls();
    this.render();
    this.runSimulation();
    this.setStatus(`Saved updates to reusable chip "${updated.name}".`);
  }

  cancelCustomChipEdit() {
    const frame = this.editStack.pop();
    if (!frame) return;
    this.nodes = frame.nodes;
    this.wires = frame.wires;
    this.chipName = frame.chipName;
    this.el.querySelector('[data-chip-name]').value = this.chipName;
    this.el.querySelector('[data-chip-title]').textContent = this.chipName;
    this.selectedNodeId = frame.selectedNodeId;
    this.selectedNodeIds = frame.selectedNodeIds;
    this.updateEditControls();
    this.render();
    this.setStatus('Discarded changes to the reusable chip.');
  }

  updateEditControls() {
    const editing = this.editStack.length > 0;
    this.el.querySelector('[data-chip-context]').textContent = editing
      ? `Editing reusable chip · ${this.editStack.length} level${this.editStack.length === 1 ? '' : 's'} deep`
      : 'Digital logic · schematic design';
    this.el.querySelector('[data-chip-action="back-chip"]').hidden = !editing;
    this.el.querySelector('[data-chip-action="save-chip-edits"]').hidden = !editing;
    this.el.querySelector('[data-chip-action="group"]').hidden = editing;
    this.el.querySelector('[data-chip-action="new"]').hidden = editing;
    this.el.querySelector('[data-chip-action="import"]').hidden = editing;
    this.el.querySelector('[data-chip-action="export"]').hidden = editing;
  }

  definitionContains(definition, id, seen = new Set()) {
    if (!definition || seen.has(definition.id)) return false;
    if (definition.id === id) return true;
    seen.add(definition.id);
    return definition.components.some((node) =>
      node.type === 'CUSTOM' && this.definitionContains(node.definition, id, seen)
    );
  }

  replaceChipDefinition(definition, id, updated) {
    if (definition.id === id) return structuredClone(updated);
    const copy = structuredClone(definition);
    copy.components = copy.components.map((node) => this.replaceNodeDefinition(node, id, updated));
    return copy;
  }

  replaceNodeDefinition(node, id, updated) {
    if (node.type !== 'CUSTOM' || !node.definition) return node;
    if (node.definition.id === id) return { ...node, definition: structuredClone(updated) };
    return { ...node, definition: this.replaceChipDefinition(node.definition, id, updated) };
  }

  loadTestBench() {
    try {
      const saved = JSON.parse(localStorage.getItem(`${CHIP_TESTBENCH_KEY}.${this.designId}`) || 'null');
      if (saved && typeof saved.name === 'string' && Array.isArray(saved.steps)) {
        const valid = saved.steps.length <= 512 && saved.steps.every((step) =>
          step && step.inputs && typeof step.inputs === 'object' && !Array.isArray(step.inputs) &&
          step.expected && typeof step.expected === 'object' && !Array.isArray(step.expected) &&
          (step.clock === undefined || typeof step.clock === 'boolean')
        );
        if (valid) this.testBench = { name: saved.name.slice(0, 48), steps: saved.steps };
      }
    } catch (error) {
      console.error('Could not load Chip Lab test bench:', error);
    }
  }

  persistTestBenches() {
    try {
      localStorage.setItem(`${CHIP_TESTBENCH_KEY}.${this.designId}`, JSON.stringify(this.testBench));
    } catch (error) {
      this.setStatus(`Could not save test bench: ${error.message}`);
    }
  }

  openTestBench() {
    this.el.querySelector('[data-chip-testbench-modal]').hidden = false;
    this.renderTestBenchSteps();
  }

  addTestBenchStep() {
    const inputs = this.nodes.filter((node) => node.type === 'INPUT' || node.type === 'BUS_INPUT' || node.type === 'BUS_CONST' || node.type === 'CONST');
    const outputs = this.nodes.filter((node) => node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT');
    if (!inputs.length || !outputs.length) {
      this.setStatus('Add at least one input and one output pin before creating test vectors.');
      return;
    }
    const result = this.evaluate();
    const expected = Object.fromEntries(outputs.map((node) => [
      node.id, result.outputs.has(node.id) ? result.outputs.get(node.id) : node.type === 'BUS_OUTPUT' ? 0 : false
    ]));
    this.testBench.name = this.el.querySelector('[data-testbench-name]').value.trim() || 'Untitled test bench';
    this.invalidateTestBenchResults();
    this.testBench.steps.push({
      inputs: Object.fromEntries(inputs.map((node) => [node.id, node.value])),
      expected,
      clock: this.el.querySelector('[data-testbench-clock]').checked
    });
    this.el.querySelector('[data-testbench-clock]').checked = false;
    this.persistTestBenches();
    this.renderTestBenchSteps();
    this.setStatus(`Added test vector ${this.testBench.steps.length} to "${this.testBench.name}".`);
  }

  generateTestVectors(mode, requestedCount = undefined, seed = undefined) {
    const inputs = this.nodes.filter((node) => ['INPUT', 'BUS_INPUT', 'BUS_CONST', 'CONST'].includes(node.type));
    const outputs = this.nodes.filter((node) => node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT');
    const remaining = 512 - this.testBench.steps.length;
    if (!inputs.length || !outputs.length) {
      this.setStatus('Add at least one input and one output pin before generating tests.');
      return 0;
    }
    if (this.nodes.some((node) => SEQUENTIAL_TYPES.has(node.type) || node.type === 'CLOCK')) {
      this.setStatus('Automatic test generation currently supports combinational designs only; use clocked test vectors for sequential circuits.');
      return 0;
    }
    if (remaining <= 0) {
      this.setStatus('This test bench already contains the maximum of 512 vectors.');
      return 0;
    }
    if (seed !== undefined && (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)) {
      this.setStatus('Random seed must be a whole number from 0 to 4294967295.');
      return 0;
    }
    const bitCount = inputs.reduce((total, node) =>
      total + (node.type === 'BUS_INPUT' || node.type === 'BUS_CONST' ? node.width || 4 : 1), 0);
    if (!Number.isInteger(bitCount) || bitCount < 1 || bitCount > 10) {
      this.setStatus(`Automatic exhaustive tests support 1–10 input bits; this design has ${bitCount}.`);
      return 0;
    }
    const total = mode === 'exhaustive' ? 2 ** bitCount
      : mode === 'boundary' ? 4 : Math.min(requestedCount || 32, 512);
    if (mode === 'exhaustive' && total > remaining) {
      this.setStatus(`Exhaustive testing needs ${total} slots, but only ${remaining} remain. Remove vectors or start a new test bench.`);
      return 0;
    }
    const count = Math.min(total, remaining);
    const steps = [];
    let randomState = seed === undefined ? null : seed || 0x6d2b79f5;
    const nextRandom = () => {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      return (randomState >>> 0) / 0x100000000;
    };
    for (let vector = 0; vector < count; vector += 1) {
      let bits = mode === 'exhaustive' ? vector
        : mode === 'boundary' ? 0
          : Math.floor((randomState === null ? Math.random() : nextRandom()) * (2 ** bitCount));
      const values = new Map();
      const inputValues = {};
      for (const [inputIndex, node] of inputs.entries()) {
        const width = node.type === 'BUS_INPUT' || node.type === 'BUS_CONST' ? node.width || 4 : 1;
        const mask = BUS_MASK(width);
        const boundary = [0, mask, mask & 0x55555555, mask & 0xaaaaaaaa];
        const value = mode === 'boundary' ? boundary[(vector + inputIndex) % boundary.length] : bits & mask;
        if (mode !== 'boundary') bits >>>= width;
        const inputValue = width === 1 ? Boolean(value) : value;
        values.set(node.id, inputValue);
        inputValues[node.id] = inputValue;
      }
      const result = this.evaluate(values);
      const expected = Object.fromEntries(outputs.map((node) => [
        node.id, result.outputs.has(node.id) ? result.outputs.get(node.id) : node.type === 'BUS_OUTPUT' ? 0 : false
      ]));
      steps.push({ inputs: inputValues, expected, clock: false });
    }
    this.testBench.name = this.el.querySelector('[data-testbench-name]').value.trim() || 'Untitled test bench';
    this.invalidateTestBenchResults();
    this.testBench.steps.push(...steps);
    this.persistTestBenches();
    this.renderTestBenchSteps();
    const kind = mode === 'exhaustive' ? 'exhaustive' : mode === 'boundary' ? 'boundary' : 'random';
    this.setStatus(`Added ${steps.length} ${kind} test vector${steps.length === 1 ? '' : 's'} to "${this.testBench.name}".${mode === 'random' && seed !== undefined ? ` Seed: ${seed}.` : ''}`);
    return steps.length;
  }

  deleteTestBenchStep(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.testBench.steps.length) return;
    this.invalidateTestBenchResults();
    this.testBench.steps.splice(index, 1);
    this.persistTestBenches();
    this.renderTestBenchSteps();
  }

  renderTestBenchSteps() {
    const list = this.el.querySelector('[data-testbench-steps]');
    this.el.querySelector('[data-testbench-name]').value = this.testBench.name;
    if (!this.testBench.steps.length) {
      list.innerHTML = '<p class="chip-sim-empty">No vectors yet. Set circuit inputs, then add the current vector.</p>';
      this.renderTestBenchResults();
      return;
    }
    const outputs = this.nodes.filter((node) => node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT');
    list.innerHTML = this.testBench.steps.map((step, index) => {
      const vector = Object.entries(step.inputs).map(([id, value]) => {
        const node = this.nodes.find((entry) => entry.id === id);
        return `${escapeHTML(node?.label || id)}=${typeof value === 'number' ? value.toString(2).padStart(node?.width || 4, '0') : Number(value)}`;
      }).join(' · ');
      return `<article class="chip-testbench-step ${step.result === false ? 'failed' : step.result === true ? 'passed' : ''}" title="${escapeHTML(step.failure || '')}"><header><b>Step ${index + 1}${step.clock ? ' · CLOCK' : ''}</b><button data-chip-action="delete-test-step" data-test-step-index="${index}" aria-label="Delete test step">×</button></header><p>${vector}</p><div>${outputs.map((node) => {
        const expected = step.expected[node.id];
        const choices = node.type === 'BUS_OUTPUT' ? Array.from({ length: BUS_MASK(node.width || 4) + 1 }, (_, value) => value) : [0, 1];
        return `<label>${escapeHTML(node.label)}<select data-testbench-expected data-step-index="${index}" data-output-id="${escapeHTML(node.id)}">${choices.map((value) => `<option value="${value}" ${Number(expected) === value ? 'selected' : ''}>${node.type === 'BUS_OUTPUT' ? value.toString(2).padStart(node.width || 4, '0') : value}</option>`).join('')}</select></label>`;
      }).join('')}</div><small class="chip-testbench-result">${step.result === undefined ? 'Not run' : step.result ? 'PASS' : `FAIL · ${escapeHTML(step.failure || 'Check expected output values.')}`}</small></article>`;
    }).join('');
    this.renderTestBenchResults();
  }

  invalidateTestBenchResults() {
    for (const step of this.testBench.steps) {
      delete step.result;
      delete step.failure;
      delete step.actual;
    }
    const summary = this.el.querySelector('[data-testbench-result]');
    if (summary) summary.textContent = '';
  }

  renderTestBenchResults() {
    const panel = this.el.querySelector('[data-testbench-results]');
    if (!panel) return;
    const completed = this.testBench.steps.some((step) => typeof step.result === 'boolean');
    if (!completed) {
      panel.innerHTML = '<p class="chip-sim-empty">Run the test bench to see expected and actual outputs for every vector.</p>';
      return;
    }
    const inputNodes = this.nodes.filter((node) => ['INPUT', 'BUS_INPUT', 'BUS_CONST', 'CONST'].includes(node.type));
    const combinations = new Set(this.testBench.steps.map((step) =>
      JSON.stringify(inputNodes.map((node) => step.inputs?.[node.id] ?? null))
    ));
    const inputs = this.nodes.filter((node) => ['INPUT', 'BUS_INPUT', 'BUS_CONST', 'CONST'].includes(node.type));
    const outputs = this.nodes.filter((node) => node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT');
    const formatValues = (nodes, values) => nodes.map((node) =>
      `${escapeHTML(node.label)}=${escapeHTML(this.formatTestValue(node, values?.[node.id]))}`
    ).join(' · ') || '—';
    const inputBits = inputNodes.reduce((total, node) => total +
      (node.type === 'BUS_INPUT' || node.type === 'BUS_CONST' ? node.width || 4 : 1), 0);
    const possible = inputBits <= 10 && !this.nodes.some((node) => SEQUENTIAL_TYPES.has(node.type) || node.type === 'CLOCK')
      ? 2 ** inputBits : null;
    panel.innerHTML = `<p class="chip-testbench-coverage">Input combinations covered: ${combinations.size}${possible ? ` / ${possible} (${Math.round(combinations.size / possible * 100)}%)` : ' distinct vectors'}</p><div class="chip-testbench-results-scroll"><table><thead><tr><th>#</th><th>Inputs</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead><tbody>${this.testBench.steps.map((step, index) => {
      const status = step.result === true ? 'PASS' : step.result === false ? 'FAIL' : 'NOT RUN';
      return `<tr><td>${index + 1}</td><td>${formatValues(inputs, step.inputs)}</td><td>${formatValues(outputs, step.expected)}</td><td>${formatValues(outputs, step.actual)}</td><td class="${step.result === true ? 'passed' : step.result === false ? 'failed' : ''}">${status}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  buildTestBenchCsv() {
    const inputs = this.nodes.filter((node) => ['INPUT', 'BUS_INPUT', 'BUS_CONST', 'CONST'].includes(node.type));
    const outputs = this.nodes.filter((node) => node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT');
    const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const columns = ['Test', 'Clock', ...inputs.map((node) => `Input: ${node.label}`),
      ...outputs.flatMap((node) => [`Expected: ${node.label}`, `Actual: ${node.label}`]), 'Result', 'Failure'];
    return [columns, ...this.testBench.steps.map((step, index) => [
      index + 1, step.clock ? 'rising edge' : '',
      ...inputs.map((node) => this.formatTestValue(node, step.inputs?.[node.id])),
      ...outputs.flatMap((node) => [
        this.formatTestValue(node, step.expected?.[node.id]),
        this.formatTestValue(node, step.actual?.[node.id])
      ]),
      step.result === true ? 'PASS' : step.result === false ? 'FAIL' : 'NOT RUN',
      step.failure || ''
    ])].map((row) => row.map(csvCell).join(',')).join('\r\n');
  }

  parseTestBenchCsv(content) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    let closedQuote = false;
    for (let index = content.charCodeAt(0) === 0xfeff ? 1 : 0; index < content.length; index += 1) {
      const character = content[index];
      if (quoted) {
        if (character === '"' && content[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
          closedQuote = true;
        } else cell += character;
      } else if (character === ',' || character === '\r' || character === '\n') {
        row.push(cell);
        cell = '';
        closedQuote = false;
        if (character !== ',') {
          if (character === '\r' && content[index + 1] === '\n') index += 1;
          if (row.some((value) => value !== '')) rows.push(row);
          row = [];
        }
      } else if (character === '"' && cell === '' && !closedQuote) {
        quoted = true;
      } else {
        if (closedQuote) throw new Error('Unexpected content after a quoted CSV field.');
        cell += character;
      }
    }
    if (quoted) throw new Error('The CSV file ends inside a quoted field.');
    row.push(cell);
    if (row.some((value) => value !== '')) rows.push(row);
    if (rows.length < 2) throw new Error('The CSV file needs a header and at least one vector row.');

    const headers = rows[0].map((header) => header.trim());
    if (new Set(headers).size !== headers.length) throw new Error('The CSV file contains duplicate column names.');
    const column = (name) => headers.indexOf(name);
    const inputs = this.nodes.filter((node) => ['INPUT', 'BUS_INPUT', 'BUS_CONST', 'CONST'].includes(node.type));
    const outputs = this.nodes.filter((node) => node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT');
    const inputColumns = inputs.map((node) => {
      const index = column(`Input: ${node.label}`);
      if (index < 0) throw new Error(`The CSV is missing input column "${node.label}".`);
      return index;
    });
    const outputColumns = outputs.map((node) => {
      const index = column(`Expected: ${node.label}`);
      if (index < 0) throw new Error(`The CSV is missing expected-output column "${node.label}".`);
      return index;
    });
    const clockColumn = column('Clock');
    const parseValue = (raw, node) => {
      const value = raw.trim();
      const isBus = ['BUS_INPUT', 'BUS_CONST', 'BUS_OUTPUT'].includes(node.type);
      if (!isBus) {
        if (/^(?:HIGH\s*\(1\)|1)$/i.test(value)) return true;
        if (/^(?:LOW\s*\(0\)|0)$/i.test(value)) return false;
        throw new Error(`Invalid logic value "${raw}" for ${node.label}; use HIGH (1) or LOW (0).`);
      }
      const formatted = value.match(/^([01]+)\s+\((\d+)\)$/);
      const numeric = formatted ? Number(formatted[2]) : /^\d+$/.test(value) ? Number(value) : NaN;
      if (!Number.isSafeInteger(numeric) || numeric < 0 || numeric > BUS_MASK(node.width || 4) ||
        formatted && parseInt(formatted[1], 2) !== numeric) {
        throw new Error(`Invalid ${node.width || 4}-bit bus value "${raw}" for ${node.label}.`);
      }
      return numeric;
    };
    const vectors = rows.slice(1).map((values, index) => {
      if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}.`);
      const clock = clockColumn < 0 ? '' : values[clockColumn].trim().toLowerCase();
      if (clock && clock !== 'rising edge') throw new Error(`CSV row ${index + 2} has unsupported clock value "${values[clockColumn]}".`);
      return {
        inputs: Object.fromEntries(inputs.map((node, inputIndex) =>
          [node.id, parseValue(values[inputColumns[inputIndex]], node)])),
        expected: Object.fromEntries(outputs.map((node, outputIndex) =>
          [node.id, parseValue(values[outputColumns[outputIndex]], node)])),
        clock: clock === 'rising edge'
      };
    });
    return vectors;
  }

  async importTestBenchCsv(file) {
    if (!file) return false;
    try {
      if (file.size > 1024 * 1024) throw new Error('CSV files must be 1 MB or smaller.');
      const vectors = this.parseTestBenchCsv(await file.text());
      const remaining = 512 - this.testBench.steps.length;
      if (vectors.length > remaining) {
        throw new Error(`The CSV contains ${vectors.length} vectors, but this test bench has room for only ${remaining}.`);
      }
      if (!vectors.length) throw new Error('The CSV contains no test vectors.');
      this.invalidateTestBenchResults();
      this.testBench.steps.push(...vectors);
      this.persistTestBenches();
      this.renderTestBenchSteps();
      this.setStatus(`Imported ${vectors.length} CSV test vector${vectors.length === 1 ? '' : 's'} and appended them to "${this.testBench.name}".`);
      return true;
    } catch (error) {
      this.setStatus(`Could not import test bench CSV: ${error.message}`);
      return false;
    } finally {
      this.el.querySelector('[data-testbench-csv-file]').value = '';
    }
  }

  exportTestBenchCsv() {
    if (!this.testBench.steps.length) {
      this.setStatus('Add at least one vector before exporting test results.');
      return false;
    }
    const blob = new Blob([this.buildTestBenchCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.testBench.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chip-tests'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.setStatus(`Exported ${this.testBench.steps.length} test vectors as CSV.`);
    return true;
  }

  runTestBench() {
    if (!this.testBench.steps.length) {
      this.setStatus('Add at least one input vector to this test bench first.');
      return;
    }
    const inputNodes = this.nodes.filter((node) => node.type === 'INPUT' || node.type === 'BUS_INPUT' || node.type === 'BUS_CONST' || node.type === 'CONST');
    const outputs = this.nodes.filter((node) => node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT');
    this.stopClock();
    const savedInputs = inputNodes.map((node) => [node, node.value]);
    const savedStates = this.nodes.filter((node) => SEQUENTIAL_TYPES.has(node.type)).map((node) => [node, structuredClone({ q: node.q, phase: node.phase, counter: node.counter, memory: node.memory })]);
    this.nodes.filter((node) => SEQUENTIAL_TYPES.has(node.type)).forEach((node) => {
      node.q = typeof node.q === 'number' ? 0 : false;
      node.phase = 0;
      node.counter = 0;
      if (node.type === 'RAM') node.memory = Array(2 ** (node.addressWidth || 2)).fill(0);
    });
    let passed = 0;
    this.resetTrace();
    for (const step of this.testBench.steps) {
      inputNodes.forEach((node) => { if (Object.hasOwn(step.inputs, node.id)) node.value = step.inputs[node.id]; });
      if (step.clock) {
        this.nodes.filter((node) => node.type === 'CLOCK').forEach((node) => { node.value = true; });
        this.captureClockEdge();
        this.nodes.filter((node) => node.type === 'CLOCK').forEach((node) => { node.value = false; });
      }
      const result = this.evaluate();
      const failures = outputs.filter((node) => !Object.hasOwn(step.expected, node.id) ||
        result.outputs.get(node.id) !== step.expected[node.id] || result.unresolved.has(node.id));
      step.result = failures.length === 0;
      step.failure = failures.map((node) => {
        const actual = result.outputs.get(node.id);
        const expected = step.expected[node.id];
        return `${node.label} expected ${this.formatTestValue(node, expected)} but got ${this.formatTestValue(node, actual)}${result.unresolved.has(node.id) ? ' (unresolved)' : ''}`;
      }).join('; ');
      step.actual = Object.fromEntries(outputs.map((node) => [node.id, result.outputs.get(node.id)]));
      if (step.result) passed += 1;
      this.recordTrace();
    }
    savedInputs.forEach(([node, value]) => { node.value = value; });
    savedStates.forEach(([node, state]) => Object.assign(node, state));
    this.persistTestBenches();
    this.runSimulation();
    this.renderTestBenchSteps();
    const summary = `${passed}/${this.testBench.steps.length} tests passed`;
    this.el.querySelector('[data-testbench-result]').textContent = summary;
    this.renderTestBenchResults();
    this.setStatus(`Test bench "${this.testBench.name}" complete · ${summary}.`);
  }

  evaluate(values = new Map(this.nodes.filter((node) =>
    node.type === 'INPUT' || node.type === 'BUS_INPUT' || node.type === 'CLOCK' || node.type === 'CONST' || node.type === 'BUS_CONST' ||
    node.type === 'VPLUS' || node.type === 'GROUND'
  ).map((node) => [node.id, node.type === 'VPLUS' ? true : node.type === 'GROUND' ? false : node.value])), nodes = this.nodes, wires = this.wires, depth = 0) {
    const outputs = new Map(values);
    for (const node of nodes) {
      if (node.type === 'VPLUS') outputs.set(node.id, true);
      if (node.type === 'GROUND') outputs.set(node.id, false);
    }
    const unresolved = new Set(nodes.filter((node) =>
      !['INPUT', 'BUS_INPUT', 'BUS_CONST', 'CONST', 'CLOCK', 'VPLUS', 'GROUND'].includes(node.type) && !SEQUENTIAL_TYPES.has(node.type)
    ).map((node) => node.id));
    for (const node of nodes) {
      if (SEQUENTIAL_TYPES.has(node.type)) outputs.set(node.id, Boolean(node.q));
      if (['REGISTER', 'COUNTER', 'RAM'].includes(node.type)) outputs.set(node.id, Number(node.q) || 0);
    }
    if (depth > 16) return { outputs, unresolved: new Set(nodes.map((node) => node.id)) };
    for (let pass = 0; pass <= nodes.length && unresolved.size; pass += 1) {
      for (const node of nodes) {
        if (!unresolved.has(node.id)) continue;
        const inputCount = this.inputCount(node);
        if (!inputCount && node.type !== 'CUSTOM') continue;
        const sources = [];
        let ready = true;
        for (let pin = 0; pin < inputCount; pin += 1) {
          const wire = wires.find((entry) => entry.to === node.id && entry.input === pin);
          if (!wire) {
            sources.push(this.portSignalKind(node, 'in', pin) === 'bus' ? 0 : false);
          } else {
            const sourceValue = this.signalValue(outputs, wire);
            if (this.portSignalKind(node, 'in', pin) === 'bus'
                ? typeof sourceValue !== 'number'
                : typeof sourceValue !== 'boolean') {
              ready = false;
              break;
            }
            sources.push(sourceValue);
          }
        }
        if (!ready) continue;
        if (node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT') {
          outputs.set(node.id, sources[0]);
        } else if (node.type === 'CUSTOM' && node.definition) {
          const inputValues = new Map(node.definition.inputs.map((pin, index) => [pin.id, sources[index]]));
          const nested = this.evaluate(inputValues, node.definition.components, node.definition.wires, depth + 1);
          outputs.set(node.id, node.definition.outputs.map((pin) => nested.outputs.get(pin.id)));
        } else if (node.type === 'SPLITTER') {
          outputs.set(node.id, Array.from({ length: node.width || 4 }, (_, bit) => Boolean((Number(sources[0]) || 0) & (1 << bit))));
        } else if (node.type === 'JOINER') {
          outputs.set(node.id, sources.reduce((value, bit, index) => value | (bit ? (1 << index) : 0), 0));
        } else if (node.type === 'MUX') {
          outputs.set(node.id, (sources[2] ? sources[1] : sources[0]) & BUS_MASK(node.width || 4));
        } else if (node.type === 'ADDER') {
          const sum = (sources[0] & BUS_MASK(node.width || 4)) + (sources[1] & BUS_MASK(node.width || 4)) + Number(sources[2]);
          outputs.set(node.id, [sum & BUS_MASK(node.width || 4), sum > BUS_MASK(node.width || 4)]);
        } else if (node.type === 'COMPARATOR') {
          outputs.set(node.id, [sources[0] > sources[1], sources[0] === sources[1], sources[0] < sources[1]]);
        } else if (node.type === 'DECODER') {
          const address = sources.reduce((value, bit, index) => value | (bit ? 1 << index : 0), 0);
          outputs.set(node.id, Array.from({ length: 1 << (node.width || 2) }, (_, index) => index === address));
        } else if (BUS_GATE_TYPES.has(node.type)) {
          const mask = BUS_MASK(node.width || 4);
          const [a = 0, b = 0] = sources.map((value) => Number(value) || 0);
          const value = node.type === 'BUS_AND' ? a & b : node.type === 'BUS_OR' ? a | b : node.type === 'BUS_XOR' ? a ^ b : ~a;
          outputs.set(node.id, value & mask);
        } else if (GATES[node.type] && !SEQUENTIAL_TYPES.has(node.type)) {
          outputs.set(node.id, truth(node.type, sources));
        } else {
          continue;
        }
        unresolved.delete(node.id);
      }
    }
    return { outputs, unresolved };
  }

  runSimulation() {
    const { outputs, unresolved } = this.evaluate();
    for (const node of this.nodes) {
      const value = outputs.get(node.id);
      node.simulatedValues = Array.isArray(value) ? value : [value];
      node.simulatedValue = node.simulatedValues[0] ?? null;
    }
    this.render();
    const cyclic = unresolved.size > 0;
    this.setStatus(cyclic ? `Simulation stopped: ${unresolved.size} component(s) have unresolved feedback.` : 'Simulation complete · outputs updated.');
  }

  resetTrace() {
    this.trace = [];
  }

  recordTrace() {
    const result = this.evaluate();
    this.trace.push({ outputs: [...result.outputs.entries()].map(([id, value]) => [id, Array.isArray(value) ? value.slice() : value]) });
    if (this.trace.length > TRACE_LIMIT) this.trace.shift();
    if (!this.el.querySelector('[data-chip-simulation]').hidden) this.renderSimulation();
  }

  showTruthTable() {
    const inputs = this.nodes.filter((node) => node.type === 'INPUT');
    const outputs = this.nodes.filter((node) => node.type === 'OUTPUT');
    if (this.nodes.some((node) => SEQUENTIAL_TYPES.has(node.type) || BUS_TYPES.has(node.type) || node.type === 'BUS_CONST')) {
      this.setStatus('Truth tables support single-bit combinational logic; use a test bench for sequential or bus-based circuits.');
      return;
    }
    if (!inputs.length || !outputs.length) {
      this.setStatus('Add at least one input and one output pin to generate a truth table.');
      return;
    }
    if (inputs.length > 8) {
      this.setStatus('Truth-table generation is limited to 8 input pins (256 test vectors).');
      return;
    }
    const table = this.el.querySelector('[data-chip-truth-body]');
    this.el.querySelector('[data-chip-truth-caption]').textContent = `${inputs.length} inputs · ${2 ** inputs.length} vectors`;
    let content = `<table><thead><tr><th colspan="${inputs.length}">INPUTS</th><th colspan="${outputs.length}">OUTPUTS</th></tr><tr>${inputs.map((node) => `<th>${escapeHTML(node.label)}</th>`).join('')}${outputs.map((node) => `<th>${escapeHTML(node.label)}</th>`).join('')}</tr></thead><tbody>`;
    for (let row = 0; row < 2 ** inputs.length; row += 1) {
      const overrides = new Map(inputs.map((node, index) => [node.id, Boolean(row & (1 << (inputs.length - index - 1)))]));
      const result = this.evaluate(overrides);
      content += `<tr>${inputs.map((node) => `<td>${Number(overrides.get(node.id))}</td>`).join('')}${outputs.map((node) => `<td class="${result.outputs.get(node.id) ? 'is-high' : ''}">${result.outputs.has(node.id) ? Number(result.outputs.get(node.id)) : '—'}</td>`).join('')}</tr>`;
    }
    table.innerHTML = `${content}</tbody></table>`;
    this.el.querySelector('[data-chip-truth-modal]').hidden = false;
  }

  portPosition(node, direction, index) {
    const height = this.nodeHeight(node);
    if (node.type === 'INPUT' || node.type === 'BUS_INPUT' || node.type === 'CONST' || node.type === 'BUS_CONST' ||
        node.type === 'VPLUS' || node.type === 'GROUND') return { x: node.x + 150, y: node.y + height / 2 };
    if (node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT') return { x: node.x, y: node.y + height / 2 };
    if (direction === 'in') return { x: node.x, y: node.y + 34 + index * 24 };
    const count = this.outputCount(node);
    return { x: node.x + 150, y: node.y + (count > 1 ? 34 + index * 24 : height / 2) };
  }

  nodeHeight(node) {
    if (node.type === 'INPUT' || node.type === 'OUTPUT' || node.type === 'BUS_INPUT' || node.type === 'BUS_OUTPUT' ||
        node.type === 'BUS_CONST' || node.type === 'CONST' || node.type === 'CLOCK' ||
        node.type === 'VPLUS' || node.type === 'GROUND') return 72;
    if (node.type === 'DFF' || node.type === 'SR_DFF') return 110;
    return Math.max(82, 48 + Math.max(this.inputCount(node), this.outputCount(node), 1) * 24);
  }

  renderCanvas() {
    const wiresLayer = this.el.querySelector('[data-chip-wires]');
    const nodesLayer = this.el.querySelector('[data-chip-nodes]');
    wiresLayer.innerHTML = this.wires.map((wire, index) => {
      const source = this.nodes.find((node) => node.id === wire.from);
      const target = this.nodes.find((node) => node.id === wire.to);
      if (!source || !target) return '';
      const start = this.portPosition(source, 'out', wire.output);
      const end = this.portPosition(target, 'in', wire.input);
      const bend = Math.max(50, Math.abs(end.x - start.x) * 0.45);
      const wireValue = source.simulatedValues?.[wire.output];
      const high = wireValue === true || typeof wireValue === 'number' && wireValue > 0;
      const path = wire.route === 'straight'
        ? `M ${start.x} ${start.y} L ${end.x} ${end.y}`
        : wire.route === 'orthogonal'
          ? `M ${start.x} ${start.y} L ${(start.x + end.x) / 2} ${start.y} L ${(start.x + end.x) / 2} ${end.y} L ${end.x} ${end.y}`
          : `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
      const selected = this.selectedWireIndex === index;
      return `<g class="chip-wire-group ${selected ? 'selected' : ''} ${wire.probe ? 'probed' : ''}"><path class="chip-wire ${high ? 'high' : ''}" d="${path}" marker-end="url(#chip-wire-arrow)"/><path class="chip-wire-hit" data-chip-delete-wire="${index}" d="${path}" aria-label="Select wire ${index + 1}; double-click to delete"/><circle class="chip-wire-value ${high ? 'high' : ''}" cx="${(start.x + end.x) / 2}" cy="${(start.y + end.y) / 2}" r="4"/>${wire.probe ? `<text class="chip-wire-probe" x="${(start.x + end.x) / 2}" y="${(start.y + end.y) / 2 - 12}">PROBE</text>` : ''}${wire.label ? `<text class="chip-wire-label" x="${(start.x + end.x) / 2}" y="${(start.y + end.y) / 2 - (wire.probe ? 20 : 8)}">${escapeHTML(wire.label)}</text>` : ''}</g>`;
    }).join('');
    nodesLayer.innerHTML = this.nodes.map((node) => {
      const height = this.nodeHeight(node);
      const selected = this.selectedNodeIds.has(node.id);
      const value = node.simulatedValue;
      const cls = value === true || typeof value === 'number' && value > 0 ? 'high' : value === false || value === 0 ? 'low' : 'unknown';
      const header = node.type === 'INPUT' ? 'INPUT PIN' : node.type === 'OUTPUT' ? 'OUTPUT PIN' :
        node.type === 'BUS_INPUT' ? `${node.width}-BIT BUS INPUT` : node.type === 'BUS_OUTPUT' ? `${node.width}-BIT BUS OUTPUT` :
        node.type === 'CONST' ? 'LOGIC CONSTANT' : node.type === 'BUS_CONST' ? `${node.width}-BIT CONSTANT` :
        node.type === 'CLOCK' ? 'CLOCK SOURCE' : node.type === 'VPLUS' ? 'V+ · LOGIC HIGH' :
        node.type === 'GROUND' ? 'GND · LOGIC LOW' :
        node.type === 'CUSTOM' ? `CUSTOM CHIP · ${node.definition?.inputs?.length || 0}×${node.definition?.outputs?.length || 0}` :
          `${node.type} · ${this.inputCount(node)}-INPUT`;
      const inputPorts = this.inputCount(node);
      const inputPins = Array.from({ length: inputPorts }, (_, index) => {
        const p = this.portPosition(node, 'in', index);
        const inputLabel = node.type === 'OUTPUT' ? 'D' : node.type === 'BUS_OUTPUT' ? `BUS[${(node.width || 4) - 1}:0]` :
          node.type === 'SPLITTER' ? `BUS[${(node.width || 4) - 1}:0]` : node.type === 'JOINER' ? `B${index}` : node.type === 'DFF' ? ['D', 'CLK'][index] :
          node.type === 'SR_DFF' ? ['D', 'CLK', 'SET', 'RESET'][index] :
            node.type === 'REGISTER' ? ['D', 'CLK'][index] :
              node.type === 'COUNTER' ? ['EN', 'RESET', 'CLK'][index] :
                node.type === 'CLOCK_DIVIDER' ? ['CLK', 'RESET'][index] :
                  node.type === 'RAM' ? ['DATA', 'ADDR', 'WE', 'CLK'][index] :
                    node.type === 'MUX' ? ['A', 'B', 'SEL'][index] :
                      node.type === 'ADDER' ? ['A', 'B', 'CIN'][index] :
                        node.type === 'COMPARATOR' ? ['A', 'B'][index] :
                          node.type === 'DECODER' ? `A${index}` :
                            node.type === 'CUSTOM' ? node.definition.inputs[index]?.label : `IN${index + 1}`;
        return `<circle class="chip-port input-port" data-chip-port data-node-id="${node.id}" data-direction="in" data-port-index="${index}" cx="${p.x - node.x}" cy="${p.y - node.y}" r="7"><title>${escapeHTML(inputLabel || `Input ${index + 1}`)}</title></circle><text class="chip-pin-label" x="${p.x - node.x + 11}" y="${p.y - node.y + 3}">${escapeHTML(inputLabel || `IN${index + 1}`)}</text>`;
      }).join('');
      const outputPorts = Array.from({ length: this.outputCount(node) }, (_, index) => {
        const p = this.portPosition(node, 'out', index);
        const label = node.type === 'CUSTOM' ? node.definition.outputs[index]?.label :
          node.type === 'VPLUS' ? 'V+ / HIGH' : node.type === 'GROUND' ? 'GND / LOW' :
          node.type === 'ADDER' ? ['SUM', 'COUT'][index] :
            node.type === 'COMPARATOR' ? ['GT', 'EQ', 'LT'][index] :
              node.type === 'DECODER' ? `Y${index}` :
          node.type === 'BUS_INPUT' || node.type === 'BUS_CONST' || BUS_GATE_TYPES.has(node.type) || node.type === 'JOINER' ||
            ['MUX', 'REGISTER', 'COUNTER', 'CLOCK_DIVIDER', 'RAM'].includes(node.type) ? `BUS[${(node.width || 4) - 1}:0]` :
            node.type === 'SPLITTER' ? `B${index}` : 'Q';
        return `<circle class="chip-port output-port" data-chip-port data-node-id="${node.id}" data-direction="out" data-port-index="${index}" cx="${p.x - node.x}" cy="${p.y - node.y}" r="7"><title>${escapeHTML(label || `Output ${index + 1}`)}</title></circle><text class="chip-pin-label output-label" x="139" y="${p.y - node.y - 10}">${escapeHTML(label || `Q${index + 1}`)}</text>`;
      }).join('');
      const toggle = node.type === 'INPUT' || node.type === 'CONST' ? `<g class="chip-input-toggle" data-chip-toggle="${node.id}" role="button" aria-label="Toggle ${escapeHTML(node.label)}"><rect x="96" y="24" width="38" height="24" rx="12" class="${node.value ? 'on' : ''}"/><circle cx="${node.value ? 122 : 108}" cy="36" r="8"/></g>` : '';
      const gateMark = node.type === 'DFF' ? '<text class="chip-gate-mark" x="75" y="70">EDGE-TRIGGERED · D → Q</text>' :
        node.type === 'SR_DFF' ? '<text class="chip-gate-mark" x="75" y="70">D · SET · RESET → Q</text>' :
        node.type === 'CUSTOM' ? '<text class="chip-gate-mark" x="75" y="70">REUSABLE LOGIC BLOCK</text>' :
          BUS_GATE_TYPES.has(node.type) ? `<text class="chip-gate-mark" x="75" y="${height - 15}">${node.width || 4}-BIT BUS LOGIC</text>` :
            node.type === 'SPLITTER' || node.type === 'JOINER' ? `<text class="chip-gate-mark" x="75" y="${height - 15}">${node.width || 4}-BIT BUS ROUTING</text>` :
              ['REGISTER', 'COUNTER', 'CLOCK_DIVIDER', 'RAM'].includes(node.type) ? `<text class="chip-gate-mark" x="75" y="${height - 15}">${node.type === 'CLOCK_DIVIDER' ? `÷${2 ** (node.width || 2)}` : `${node.width || 4}-BIT SEQUENTIAL`}</text>` :
                ['MUX', 'ADDER', 'COMPARATOR', 'DECODER'].includes(node.type) ? `<text class="chip-gate-mark" x="75" y="${height - 15}">${node.type === 'DECODER' ? `${1 << (node.width || 2)}-OUTPUT DECODER` : `${node.width || 4}-BIT ${node.type}`}</text>` :
          GATES[node.type] ? `<text class="chip-gate-mark" x="75" y="${height - 15}">${node.type === 'NOT' || node.type === 'BUF' ? 'A → Q' : 'A · B → Q'}</text>` : '';
      const displayedValue = node.type === 'CLOCK' || node.type === 'CONST' ? (node.value ? '1' : '0') :
        typeof value === 'number' ? value.toString(2).padStart(node.width || 4, '0') : value === true ? '1' : value === false ? '0' : '—';
      return `<g class="chip-node ${node.type.toLowerCase()} ${selected ? 'selected' : ''} ${cls}" data-chip-node data-node-id="${node.id}" transform="translate(${node.x},${node.y})" tabindex="0"><rect class="chip-node-body" width="150" height="${height}" rx="9"/><rect class="chip-node-header" width="150" height="23" rx="9"/><path class="chip-node-header-square" d="M0 14h150v9H0z"/><text class="chip-node-type" x="11" y="16">${header}</text><text class="chip-node-label" x="12" y="43">${escapeHTML(node.label)}</text>${gateMark}${toggle}${inputPins}${outputPorts}<circle class="chip-value-lamp ${cls}" cx="${node.type === 'INPUT' || node.type === 'CONST' ? 21 : 132}" cy="${height - 15}" r="4"/><text class="chip-value-text" x="${node.type === 'INPUT' || node.type === 'CONST' ? 32 : 119}" y="${height - 11}">${displayedValue}</text>${node.note ? `<text class="chip-node-note" x="4" y="${height + 14}">${escapeHTML(node.note.slice(0, 36))}</text>` : ''}</g>`;
    }).join('');
    this.el.querySelector('[data-chip-empty]').hidden = this.nodes.length > 0;
    this.el.querySelector('[data-chip-count]').textContent = `${this.nodes.length} components · ${this.wires.length} nets`;
  }

  inspectPowerRails() {
    const supplies = {
      VPLUS: this.nodes.filter((node) => node.type === 'VPLUS'),
      GROUND: this.nodes.filter((node) => node.type === 'GROUND')
    };
    const connected = Object.fromEntries(Object.entries(supplies).map(([type, nodes]) => [
      type,
      nodes.filter((node) => this.wires.some((wire) => wire.from === node.id && wire.output === 0)).length
    ]));
    const issues = [];
    for (const type of ['VPLUS', 'GROUND']) {
      if (!supplies[type].length) issues.push(`No ${type === 'VPLUS' ? 'V+' : 'GND'} rail terminal is placed.`);
      for (const node of supplies[type]) {
        if (!this.wires.some((wire) => wire.from === node.id && wire.output === 0)) {
          issues.push(`${node.label} has no outgoing rail connection.`);
        }
      }
    }
    const drivenPins = new Map();
    for (const type of ['VPLUS', 'GROUND']) {
      for (const node of supplies[type]) {
        for (const wire of this.wires.filter((entry) => entry.from === node.id && entry.output === 0)) {
          const key = `${wire.to}:${wire.input}`;
          const existing = drivenPins.get(key) || new Set();
          existing.add(type);
          drivenPins.set(key, existing);
        }
      }
    }
    const shortedPins = [];
    for (const [key, drivers] of drivenPins) {
      if (drivers.has('VPLUS') && drivers.has('GROUND')) {
        const [targetId, input] = key.split(':');
        const target = this.nodes.find((node) => node.id === targetId);
        shortedPins.push({ targetId, input: Number(input), label: target?.label || targetId });
        issues.push(`V+ and GND both drive ${target?.label || targetId} input ${Number(input) + 1}.`);
      }
    }
    return {
      ok: supplies.VPLUS.length > 0 && supplies.GROUND.length > 0 &&
        connected.VPLUS === supplies.VPLUS.length && connected.GROUND === supplies.GROUND.length &&
        shortedPins.length === 0,
      connectedVPlus: connected.VPLUS,
      totalVPlus: supplies.VPLUS.length,
      connectedGround: connected.GROUND,
      totalGround: supplies.GROUND.length,
      shortedPins,
      issues
    };
  }

  checkPowerRails() {
    const result = this.inspectPowerRails();
    const summary = result.ok
      ? `V+ ${result.connectedVPlus}/${result.totalVPlus}, GND ${result.connectedGround}/${result.totalGround}; no shared input detected.`
      : result.issues.join(' ');
    this.setStatus(`Logic-rail check: ${summary} This checks schematic wiring only, not physical voltage, current, or PCB safety.`);
    return result;
  }

  analyzeDesign() {
    const findings = [];
    const inputDrivers = new Map();
    for (const wire of this.wires) {
      const key = `${wire.to}:${wire.input}`;
      inputDrivers.set(key, (inputDrivers.get(key) || 0) + 1);
      const source = this.nodes.find((node) => node.id === wire.from);
      const target = this.nodes.find((node) => node.id === wire.to);
      if (!source || !target) {
        findings.push({ severity: 'error', nodeId: wire.to, message: `Wire references a missing component (${wire.from} → ${wire.to}).` });
      } else if (!this.portsCompatible(source, wire.output, target, wire.input)) {
        findings.push({ severity: 'error', nodeId: target.id, message: `${source.label} and ${target.label} have incompatible signal types or widths.` });
      }
    }
    for (const [key, drivers] of inputDrivers) {
      if (drivers > 1) findings.push({ severity: 'error', nodeId: key.split(':')[0], message: `Input ${key.split(':')[1]} has ${drivers} signal drivers.` });
    }
    for (const node of this.nodes) {
      if (!['INPUT', 'CLOCK', 'BUS_INPUT', 'BUS_CONST', 'CONST'].includes(node.type)) {
        for (let input = 0; input < this.inputCount(node); input += 1) {
          if (!inputDrivers.has(`${node.id}:${input}`)) {
            findings.push({ severity: 'warning', nodeId: node.id, message: `${node.label} input ${input + 1} is unconnected and currently defaults LOW.` });
          }
        }
      }
      if (node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT') {
        if (!inputDrivers.has(`${node.id}:0`)) findings.push({ severity: 'error', nodeId: node.id, message: `${node.label} has no driver.` });
      } else if (this.outputCount(node) > 0 && !this.wires.some((wire) => wire.from === node.id)) {
        findings.push({ severity: 'info', nodeId: node.id, message: `${node.label} has no connected outputs.` });
      }
    }
    const sinks = this.nodes.filter((node) => node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT');
    const needed = new Set(sinks.map((node) => node.id));
    const pending = [...needed];
    while (pending.length) {
      const id = pending.pop();
      for (const wire of this.wires) {
        if (wire.to === id && !needed.has(wire.from)) {
          needed.add(wire.from);
          pending.push(wire.from);
        }
      }
    }
    for (const node of this.nodes) {
      if (!needed.has(node.id) && !['INPUT', 'BUS_INPUT', 'BUS_CONST', 'CONST', 'CLOCK'].includes(node.type)) {
        findings.push({ severity: 'warning', nodeId: node.id, message: `${node.label} does not contribute to any output pin.` });
      }
    }
    const simulation = this.evaluate();
    for (const node of this.nodes) {
      if (simulation.unresolved.has(node.id)) {
        findings.push({ severity: 'error', nodeId: node.id, message: `${node.label} is unresolved; check for feedback loops or missing signal paths.` });
      }
    }
    if (this.nodes.some((node) => SEQUENTIAL_TYPES.has(node.type)) && !this.nodes.some((node) => node.type === 'CLOCK')) {
      findings.push({ severity: 'warning', message: 'Sequential logic is present but there is no clock source.' });
    }
    if (!sinks.length && this.nodes.length) findings.push({ severity: 'warning', message: 'Add an output pin to observe and verify the circuit.' });
    const order = { error: 0, warning: 1, info: 2 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);
    return findings;
  }

  renderDiagnostics() {
    const findings = this.analyzeDesign();
    if (!findings.length) return '<p class="chip-diagnostic success">No circuit issues found.</p>';
    return findings.slice(0, 24).map((finding) =>
      `<p class="chip-diagnostic ${finding.severity}">${escapeHTML(finding.message)}</p>`
    ).join('') + (findings.length > 24 ? `<p class="chip-diagnostic info">and ${findings.length - 24} more…</p>` : '');
  }

  loadLearningProgress() {
    try {
      const progress = JSON.parse(localStorage.getItem(LEARNING_PROGRESS_KEY) || '[]');
      return Array.isArray(progress) ? progress.filter((id) => LEARNING_LESSONS.some((lesson) => lesson.id === id)) : [];
    } catch (error) {
      console.error('Could not load Chip Lab learning progress:', error);
      return [];
    }
  }

  loadLearningStats() {
    try {
      const stats = JSON.parse(localStorage.getItem(LEARNING_STATS_KEY) || '{}');
      if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return {};
      return Object.fromEntries(LEARNING_LESSONS.flatMap(({ id }) => {
        const entry = stats[id];
        if (!entry || !Number.isInteger(entry.attempts) || entry.attempts < 0 ||
          !Number.isInteger(entry.bestScore) || entry.bestScore < 0 || entry.bestScore > 100) return [];
        return [[id, { attempts: entry.attempts, bestScore: entry.bestScore }]];
      }));
    } catch (error) {
      console.error('Could not load Chip Lab learning scores:', error);
      return {};
    }
  }

  saveLearningProgress() {
    try {
      localStorage.setItem(LEARNING_PROGRESS_KEY, JSON.stringify(this.learningProgress));
    } catch (error) {
      this.setStatus(`Could not save learning progress: ${error.message}`);
    }
  }

  saveLearningStats() {
    try {
      localStorage.setItem(LEARNING_STATS_KEY, JSON.stringify(this.learningStats));
    } catch (error) {
      this.setStatus(`Could not save Chip Lab learning scores: ${error.message}`);
    }
  }

  openLearningPath() {
    this.el.querySelector('[data-chip-learning-modal]').hidden = false;
    this.renderLearningPath();
  }

  selectLearningLesson(index) {
    if (!Number.isInteger(index) || !LEARNING_LESSONS[index]) return;
    this.learningLessonIndex = index;
    this.learningHintCount = 0;
    this.learningLastResult = null;
    this.renderLearningPath();
  }

  renderLearningPath() {
    const list = this.el.querySelector('[data-learning-list]');
    const content = this.el.querySelector('[data-learning-content]');
    list.innerHTML = LEARNING_LESSONS.map((lesson, index) =>
      `<button data-chip-action="select-lesson" data-lesson-index="${index}" class="${index === this.learningLessonIndex ? 'active' : ''}">${escapeHTML(lesson.title)}${this.learningProgress.includes(lesson.id) ? ' ✓' : ''}${this.learningStats[lesson.id]?.attempts ? ` · ${this.learningStats[lesson.id].bestScore} pts` : ''}</button>`
    ).join('');
    const lesson = LEARNING_LESSONS[this.learningLessonIndex];
    const stats = this.learningStats[lesson.id] || { attempts: 0, bestScore: 0 };
    const revealedHints = lesson.hints.slice(0, this.learningHintCount)
      .map((hint, index) => `<p><b>${index + 1}.</b> ${escapeHTML(hint)}</p>`).join('');
    const result = this.learningLastResult?.lessonId === lesson.id
      ? this.learningLastResult.passed
        ? `Passed · ${this.learningLastResult.score} points · best ${stats.bestScore} · ${stats.attempts} attempt${stats.attempts === 1 ? '' : 's'}`
        : `Not passed yet · ${stats.attempts} attempt${stats.attempts === 1 ? '' : 's'} · adjust the circuit and try again.`
      : this.learningProgress.includes(lesson.id)
        ? `Completed · best score ${stats.bestScore} · ${stats.attempts} attempt${stats.attempts === 1 ? '' : 's'}`
        : `Not completed yet · ${stats.attempts} attempt${stats.attempts === 1 ? '' : 's'}`;
    const canRevealHint = this.learningHintCount < lesson.hints.length;
    content.innerHTML = `<span>LESSON ${this.learningLessonIndex + 1} OF ${LEARNING_LESSONS.length} · BEST ${stats.bestScore} PTS</span><h3>${escapeHTML(lesson.title.slice(4))}</h3><p>${escapeHTML(lesson.objective)}</p><aside><strong>HINTS · ${this.learningHintCount}/${lesson.hints.length}</strong>${revealedHints || '<p>Try the challenge first, or reveal a hint when you need one.</p>'}${canRevealHint ? '<button data-chip-action="reveal-learning-hint">Reveal next hint</button>' : ''}</aside><p class="chip-learning-result" aria-live="polite">${escapeHTML(result)}</p>`;
    this.el.querySelector('[data-chip-action="next-learning-lesson"]')?.remove();
    if (this.learningLastResult?.lessonId === lesson.id && this.learningLastResult.passed &&
      this.learningLessonIndex < LEARNING_LESSONS.length - 1) {
      const next = document.createElement('button');
      next.type = 'button';
      next.dataset.chipAction = 'next-learning-lesson';
      next.textContent = 'Next challenge';
      this.el.querySelector('.chip-learning-modal footer').appendChild(next);
    }
  }

  revealLearningHint() {
    const lesson = LEARNING_LESSONS[this.learningLessonIndex];
    if (this.learningHintCount >= lesson.hints.length) return;
    this.learningHintCount += 1;
    this.renderLearningPath();
  }

  nextLearningLesson() {
    if (this.learningLessonIndex >= LEARNING_LESSONS.length - 1) return;
    this.selectLearningLesson(this.learningLessonIndex + 1);
    this.loadLearningLesson();
  }

  loadLearningLesson() {
    const lesson = LEARNING_LESSONS[this.learningLessonIndex];
    this.commitHistory();
    this.stopClock();
    this.resetTrace();
    this.nodes = [];
    this.wires = [];
    this.nodeSequence = 0;
    const add = (type, label, x, y, value = undefined) => {
      const node = {
        id: `u${++this.nodeSequence}`, type, label, x, y,
        value: value ?? (BUS_INPUT_TYPES.has(type) || type === 'BUS_CONST' ? 0 : false),
        q: type === 'COUNTER' || type === 'REGISTER' || type === 'RAM' ? 0 : false,
        width: BUS_TYPES.has(type) ? type === 'DECODER' ? 2 : 2 : undefined,
        memory: type === 'RAM' ? Array(4).fill(0) : undefined,
        addressWidth: type === 'RAM' ? 2 : undefined
      };
      this.nodes.push(node);
      return node;
    };
    if (lesson.id === 'and-gate') {
      add('INPUT', 'A', 80, 150); add('INPUT', 'B', 80, 350);
      add('AND', 'A AND B', 400, 240); add('OUTPUT', 'Y', 760, 240);
    } else if (lesson.id === 'half-adder') {
      add('INPUT', 'A · A0', 140, 260); add('INPUT', 'B · A1', 140, 420);
      add('XOR', 'XOR · SUM', 500, 260); add('AND', 'AND · CARRY', 500, 440);
      add('OUTPUT', 'SUM · S', 850, 260); add('OUTPUT', 'CARRY · C', 850, 440);
    } else if (lesson.id === 'bus-mux') {
      add('BUS_INPUT', 'A[1:0]', 60, 120, 1); add('BUS_INPUT', 'B[1:0]', 60, 300, 2);
      add('INPUT', 'SEL', 60, 500); add('MUX', '2-bit MUX', 420, 240);
      add('BUS_OUTPUT', 'Y[1:0]', 800, 240);
    } else if (lesson.id === 'decoder') {
      add('INPUT', 'A0 · LSB', 70, 180); add('INPUT', 'A1', 70, 340);
      add('DECODER', '2-to-4 decoder', 400, 180);
      Array.from({ length: 4 }, (_, index) => add('OUTPUT', `Y${index}`, 790, 120 + index * 120));
    } else {
      add('BUS_INPUT', 'D[1:0]', 70, 180, 1); add('CLOCK', 'CLK', 70, 380);
      add('REGISTER', '2-bit register', 420, 240); add('BUS_OUTPUT', 'Q[1:0]', 790, 240);
    }
    this.chipName = `${lesson.title.slice(4)} lesson`;
    this.el.querySelector('[data-chip-name]').value = this.chipName;
    this.el.querySelector('[data-chip-title]').textContent = this.chipName;
    this.selectedNodeId = null;
    this.selectedNodeIds.clear();
    this.selectedWireIndex = null;
    this.learningLastResult = null;
    this.el.querySelector('[data-chip-learning-modal]').hidden = true;
    this.render();
    this.runSimulation();
    this.setTab('simulate');
    this.setStatus(`Challenge started · ${lesson.objective}`);
  }

  checkLearningLesson() {
    const lesson = LEARNING_LESSONS[this.learningLessonIndex];
    let passed = false;
    if (lesson.id === 'and-gate') {
      const inputs = this.nodes.filter((node) => node.type === 'INPUT');
      const outputs = this.nodes.filter((node) => node.type === 'OUTPUT');
      passed = inputs.length >= 2 && outputs.length > 0 &&
        [[false, false, false], [false, true, false], [true, false, false], [true, true, true]].every(([a, b, expected]) => {
          const overrides = new Map([[inputs[0].id, a], [inputs[1].id, b]]);
          return this.evaluate(overrides).outputs.get(outputs[0].id) === expected;
        });
    } else if (lesson.id === 'half-adder') {
      const inputs = this.nodes.filter((node) => node.type === 'INPUT');
      const outputs = this.nodes.filter((node) => node.type === 'OUTPUT');
      passed = inputs.length === 2 && outputs.length === 2 &&
        [[false, false, false, false], [false, true, true, false], [true, false, true, false], [true, true, false, true]].every(([a, b, sum, carry]) => {
          const result = this.evaluate(new Map([[inputs[0].id, a], [inputs[1].id, b]])).outputs;
          return result.get(outputs[0].id) === sum && result.get(outputs[1].id) === carry;
        });
    } else if (lesson.id === 'bus-mux') {
      const inputs = this.nodes.filter((node) => node.type === 'BUS_INPUT');
      const selector = this.nodes.find((node) => node.type === 'INPUT');
      const output = this.nodes.find((node) => node.type === 'BUS_OUTPUT');
      const mux = this.nodes.find((node) => node.type === 'MUX');
      passed = inputs.length >= 2 && selector && output && mux &&
        [[0, 0, false, 0], [1, 2, false, 1], [1, 2, true, 2], [3, 0, true, 0]].every(([a, b, select, expected]) => {
          const result = this.evaluate(new Map([[inputs[0].id, a], [inputs[1].id, b], [selector.id, select]]));
          return result.outputs.get(output.id) === expected;
        });
    } else if (lesson.id === 'decoder') {
      const inputs = this.nodes.filter((node) => node.type === 'INPUT');
      const outputs = this.nodes.filter((node) => node.type === 'OUTPUT');
      const decoder = this.nodes.find((node) => node.type === 'DECODER');
      passed = inputs.length === 2 && outputs.length === 4 && decoder &&
        [0, 1, 2, 3].every((address) => {
          const result = this.evaluate(new Map([[inputs[0].id, Boolean(address & 1)], [inputs[1].id, Boolean(address & 2)]])).outputs;
          return outputs.every((output, index) => result.get(output.id) === (index === address));
        });
    } else {
      const data = this.nodes.find((node) => node.type === 'BUS_INPUT');
      const clock = this.nodes.find((node) => node.type === 'CLOCK');
      const register = this.nodes.find((node) => node.type === 'REGISTER');
      const output = this.nodes.find((node) => node.type === 'BUS_OUTPUT');
      if (data && clock && register && output) {
        data.value = 2; clock.value = true; this.captureClockEdge();
        data.value = 1; clock.value = false;
        passed = this.evaluate().outputs.get(output.id) === 2;
      }
    }
    const stats = this.learningStats[lesson.id] || { attempts: 0, bestScore: 0 };
    stats.attempts += 1;
    const score = passed ? Math.max(0, 100 - Math.max(0, stats.attempts - 1) * 10 - this.learningHintCount * 15) : 0;
    if (passed) stats.bestScore = Math.max(stats.bestScore, score);
    this.learningStats[lesson.id] = stats;
    this.saveLearningStats();
    if (passed && !this.learningProgress.includes(lesson.id)) {
      this.learningProgress.push(lesson.id);
      this.saveLearningProgress();
    }
    this.learningLastResult = { lessonId: lesson.id, passed, score };
    this.renderLearningPath();
    this.render();
    this.setStatus(passed
      ? `Lesson complete · ${lesson.title} · ${score} points (${this.learningHintCount} hints used).`
      : `Lesson not passed yet · attempt ${stats.attempts} · ${lesson.title}.`);
    return passed;
  }

  renderInspector() {
    const panel = this.el.querySelector('[data-chip-inspector]');
    const node = this.nodes.find((entry) => entry.id === this.selectedNodeId);
    if (this.selectedWireIndex !== null && this.wires[this.selectedWireIndex]) {
      const wire = this.wires[this.selectedWireIndex];
      const source = this.nodes.find((entry) => entry.id === wire.from);
      const target = this.nodes.find((entry) => entry.id === wire.to);
      const value = source ? this.signalValue(this.evaluate().outputs, wire) : undefined;
      const valueText = typeof value === 'number' ? `${value.toString(2).padStart(this.portWidth(source, 'out', wire.output), '0')} · ${value}`
        : typeof value === 'boolean' ? value ? 'HIGH · 1' : 'LOW · 0' : 'UNRESOLVED';
      panel.innerHTML = `<div class="chip-inspector-heading"><span>SIGNAL CONNECTION</span><button data-chip-action="delete-selected-wire" title="Delete selected wire">Delete</button></div>
        <label class="chip-form-field">Signal label<input data-wire-label maxlength="32" value="${escapeHTML(wire.label || '')}" placeholder="Optional net label"></label>
        <label class="chip-form-field">Wire routing<select data-wire-route><option value="curve" ${wire.route !== 'straight' && wire.route !== 'orthogonal' ? 'selected' : ''}>Curved</option><option value="orthogonal" ${wire.route === 'orthogonal' ? 'selected' : ''}>Orthogonal</option><option value="straight" ${wire.route === 'straight' ? 'selected' : ''}>Straight</option></select></label>
        <div class="chip-spec-list"><div><span>Signal</span><b>${escapeHTML(valueText)}</b></div><div><span>Connection</span><b>${escapeHTML(source?.label || wire.from)} → ${escapeHTML(target?.label || wire.to)}</b></div></div>
        <button class="chip-wide-action ${wire.probe ? 'is-on' : ''}" data-chip-action="toggle-wire-probe">${wire.probe ? 'Remove signal probe' : 'Probe this signal'}</button>
        ${wire.probe ? '<button class="chip-wide-action" data-chip-action="focus-probe">View probed waveform</button>' : ''}
        <div class="chip-inspector-tip"><strong>WIRE EDITING</strong><p>Single-click a wire to edit its label or routing. Probed wires appear in the focused timing waveform view. Use Delete here or press Delete to remove it.</p></div>`;
      return;
    }

    if (!node) {
      panel.innerHTML = `
        <div class="chip-inspector-heading"><span>DESIGN OVERVIEW</span><span class="chip-overview-icon">⌘</span></div>
        <div class="chip-overview-card"><span>DESIGN</span><strong>${escapeHTML(this.chipName)}</strong><small>${this.nodes.length} components · ${this.wires.length} signal nets</small></div>
        <div class="chip-spec-list"><div><span>Design type</span><b>Combinational logic</b></div><div><span>Logic family</span><b>Boolean / binary</b></div><div><span>Grid spacing</span><b>20 design units</b></div><div><span>Max truth-table inputs</span><b>8 pins</b></div></div>
        <button class="chip-wide-action" data-chip-action="diagnose">Run circuit checks</button>
        <div class="chip-diagnostics">${this.renderDiagnostics()}</div>
        <div class="chip-inspector-tip"><strong>QUICK START</strong><p>Place I/O pins and gates, then click an output port followed by an input port to draw a signal wire. Drag components to arrange the schematic.</p></div>`;
      return;
    }
    const inputs = this.inputCount(node);
    const output = this.outputCount(node);
    const componentDescription = node.type === 'INPUT' || node.type === 'OUTPUT' || node.type === 'CLOCK'
      ? node.type === 'CLOCK' ? 'Manual clock source' : 'Chip I/O pin'
      : node.type === 'VPLUS' || node.type === 'GROUND' ? 'Fixed logic rail source'
      : node.type === 'CUSTOM' ? 'Reusable logic subcircuit'
        : BUS_TYPES.has(node.type) ? `${node.width || 4}-bit component`
          : `${inputs}-input logic component`;
    const behavior = node.type === 'DFF'
      ? 'Captures the D input on a rising clock edge and retains the stored Q state between pulses.'
      : node.type === 'CUSTOM'
        ? `${node.definition?.inputs.length || 0} named inputs and ${node.definition?.outputs.length || 0} named outputs; internal gates evaluate as a reusable logic block.`
        : BUS_GATE_TYPES.has(node.type) ? `${node.width || 4}-bit bitwise ${node.type.replace('BUS_', '').toLowerCase()} operation.`
          : node.type === 'MUX' ? `Selects between two ${node.width || 4}-bit values using SEL.`
            : node.type === 'ADDER' ? `Adds two ${node.width || 4}-bit values and carry-in. Output includes carry-out.`
              : node.type === 'COMPARATOR' ? `Compares two ${node.width || 4}-bit unsigned values.`
                : node.type === 'DECODER' ? `Converts ${node.width || 2} address bits into ${1 << (node.width || 2)} one-hot outputs.`
                  : node.type === 'REGISTER' ? `Stores a ${node.width || 4}-bit value on a rising clock edge.`
                    : node.type === 'COUNTER' ? `Enabled ${node.width || 4}-bit modulo counter with synchronous reset.`
                      : node.type === 'CLOCK_DIVIDER' ? `Toggles output after every ${2 ** (node.width || 2)} input clock edges.`
                        : node.type === 'SR_DFF' ? 'Captures D on a rising edge; synchronous reset takes priority over set.'
                          : node.type === 'RAM' ? `Four words of synchronous ${node.width || 4}-bit storage; read and write on rising edges.`
                            : node.type === 'CONST' ? 'Fixed single-bit logic level; click to toggle between LOW and HIGH.'
                              : node.type === 'BUS_CONST' ? 'Set a fixed multi-bit value for bus logic.'
          : node.type === 'SPLITTER' ? `Splits one ${node.width || 4}-bit bus into individual logic bits.`
            : node.type === 'JOINER' ? `Combines ${node.width || 4} logic bits into one bus; B0 is the least-significant bit.`
              : node.type === 'BUS_INPUT' ? `Drives a ${node.width || 4}-bit bus from 0 to ${BUS_MASK(node.width || 4)}.`
                : node.type === 'BUS_OUTPUT' ? `Monitors a ${node.width || 4}-bit bus value.`
                  : node.type === 'CLOCK' ? 'Use Pulse clock in the Simulation tab to produce a rising edge for connected D flip-flops.'
                    : node.type === 'INPUT' ? 'Click the component switch or this button to change the driven binary input.'
                      : node.type === 'OUTPUT' ? 'Connect one logic signal to this output pin to monitor its value.'
                        : node.type === 'VPLUS' ? 'Fixed HIGH / 1 source for digital logic. This is not a physical voltage supply.'
                          : node.type === 'GROUND' ? 'Fixed LOW / 0 source for digital logic. This is not a physical ground model.'
                            : GATES[node.type]?.description || 'Digital logic component.';
    const logicState = node.type === 'DFF' || node.type === 'SR_DFF'
      ? `Q = ${node.q ? 'HIGH · 1' : 'LOW · 0'}`
      : typeof node.simulatedValue === 'number'
        ? `${node.simulatedValue.toString(2).padStart(node.width || 4, '0')} · ${node.simulatedValue}`
        : node.simulatedValue === true ? 'HIGH · 1' : node.simulatedValue === false ? 'LOW · 0' : 'UNRESOLVED';
    panel.innerHTML = `
      <div class="chip-inspector-heading"><span>COMPONENT PROPERTIES</span><button data-chip-delete="${node.id}" title="Delete component">Delete</button></div>
      <div class="chip-component-card"><span class="chip-component-symbol">${node.type === 'INPUT' ? 'IN' : node.type === 'OUTPUT' ? 'OUT' : node.type === 'CLOCK' ? 'CLK' : node.type === 'CUSTOM' ? 'IC' : node.type}</span><div><strong>${escapeHTML(node.label)}</strong><small>${escapeHTML(componentDescription)}</small></div></div>
      <label class="chip-form-field">Reference / net label<input data-chip-label maxlength="32" value="${escapeHTML(node.label)}"></label>
      <label class="chip-form-field">Design note<textarea data-chip-note data-node-id="${escapeHTML(node.id)}" maxlength="160" rows="3" placeholder="Optional design intent or reminder">${escapeHTML(node.note || '')}</textarea></label>
      <button class="chip-wide-action ${this.watchNodeIds?.has(node.id) ? 'is-on' : ''}" data-chip-action="toggle-watch" data-node-id="${escapeHTML(node.id)}">${this.watchNodeIds?.has(node.id) ? 'Remove from watch list' : 'Watch this signal'}</button>
      ${SEQUENTIAL_TYPES.has(node.type) ? `<button class="chip-wide-action ${this.breakpointNodeIds?.has(node.id) ? 'is-on' : ''}" data-chip-action="toggle-breakpoint" data-node-id="${escapeHTML(node.id)}">${this.breakpointNodeIds?.has(node.id) ? 'Remove clock breakpoint' : 'Pause clock when changed'}</button>` : ''}
      <div class="chip-spec-list"><div><span>Component type</span><b>${node.type}</b></div><div><span>Input pins</span><b>${inputs}</b></div><div><span>Output pins</span><b>${output}</b></div><div><span>Logic state</span><b class="state-${node.simulatedValue === true || typeof node.simulatedValue === 'number' && node.simulatedValue > 0 ? 'high' : node.simulatedValue === false || node.simulatedValue === 0 ? 'low' : 'unknown'}">${logicState}</b></div><div><span>Signal connections</span><b>${this.wires.filter((wire) => wire.from === node.id || wire.to === node.id).length}</b></div></div>
      ${BUS_TYPES.has(node.type) ? `<label class="chip-form-field">Bus width<select data-chip-width data-node-id="${node.id}">${(node.type === 'DECODER' ? [2, 3, 4] : BUS_WIDTHS).map((width) => `<option value="${width}" ${Number(node.width || 4) === width ? 'selected' : ''}>${width} bits</option>`).join('')}</select></label>` : ''}
      ${node.type === 'RAM' ? `<div class="chip-spec-list"><div><span>RAM contents</span><b>${(node.memory || [0, 0, 0, 0]).map((value, index) => `${index}:${Number(value).toString(16).toUpperCase()}`).join(' · ')}</b></div></div>` : ''}
      ${node.type === 'BUS_INPUT' || node.type === 'BUS_CONST' ? `<label class="chip-form-field">${node.type === 'BUS_CONST' ? 'Constant value' : 'Bus value'} (decimal)<input data-bus-value data-node-id="${node.id}" type="number" min="0" max="${BUS_MASK(node.width || 4)}" value="${Number(node.value) || 0}"></label>` : ''}
      ${node.type === 'CUSTOM' ? '<button class="chip-wide-action" data-chip-action="edit-custom">Edit reusable chip internals</button>' : ''}
      ${node.type === 'INPUT' || node.type === 'CONST' ? `<button class="chip-wide-action ${node.value ? 'is-on' : ''}" data-chip-toggle="${node.id}">Toggle level · ${node.value ? 'HIGH / 1' : 'LOW / 0'}</button>` : ''}
      ${SEQUENTIAL_TYPES.has(node.type) || node.type === 'CLOCK' ? '<button class="chip-wide-action" data-chip-action="pulse-clock">Pulse clock · rising edge</button>' : ''}
      <div class="chip-inspector-tip"><strong>${node.type === 'INPUT' ? 'INPUT DRIVE' : node.type === 'OUTPUT' ? 'OUTPUT LOAD' : node.type === 'DFF' ? 'SEQUENTIAL LOGIC' : node.type === 'CUSTOM' ? 'SUBCIRCUIT' : node.type === 'CLOCK' ? 'CLOCK SOURCE' : 'LOGIC FUNCTION'}</strong><p>${behavior}</p></div>`;
  }

  renderSimulation() {
    const panel = this.el.querySelector('[data-chip-simulation]');
    const inputs = this.nodes.filter((node) => ['INPUT', 'BUS_INPUT', 'BUS_CONST', 'CONST'].includes(node.type));
    const outputs = this.nodes.filter((node) => node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT');
    const result = this.evaluate();
    panel.innerHTML = `
      <div class="chip-inspector-heading"><span>LIVE SIMULATION</span><span class="chip-live-badge"><i></i> LIVE</span></div>
      <p class="chip-sim-intro">Set input levels and observe propagated logic states on every connected net.</p>
      <div class="chip-sim-section"><h3>INPUT VECTORS <span>${inputs.length} PINS</span></h3>${inputs.length ? inputs.map((node) => node.type === 'INPUT' || node.type === 'CONST'
        ? `<button class="chip-sim-pin" data-chip-toggle="${node.id}"><span><i class="${node.value ? 'high' : 'low'}"></i>${escapeHTML(node.label)}</span><b>${node.value ? '1 · HIGH' : '0 · LOW'}</b></button>`
        : `<label class="chip-sim-pin"><span>${escapeHTML(node.label)} · ${node.width || 4} bits</span><input data-bus-value data-node-id="${node.id}" type="number" min="0" max="${BUS_MASK(node.width || 4)}" value="${Number(node.value) || 0}"></label>`).join('') : '<p class="chip-sim-empty">Add input pins to drive the design.</p>'}</div>
      ${this.nodes.some((node) => node.type === 'CLOCK' || SEQUENTIAL_TYPES.has(node.type)) ? `<div class="chip-sim-section"><h3>SEQUENTIAL CONTROL <span>${this.nodes.filter((node) => SEQUENTIAL_TYPES.has(node.type)).length} COMPONENTS</span></h3><button class="chip-run-button" data-chip-action="step-clock">Step one rising edge</button><button class="chip-truth-button" data-chip-action="${this.clockTimer ? 'clock-stop' : 'clock-start'}">${this.clockTimer ? 'Pause automatic clock' : 'Start automatic clock'}</button><p class="chip-sim-note">Step applies one edge, then leaves the clock LOW. The state log records changed sequential values.</p></div>` : ''}
      ${this.nodes.some((node) => node.type === 'CLOCK') && this.nodes.some((node) => SEQUENTIAL_TYPES.has(node.type)) ? `<div class="chip-sim-section"><h3>AUTOMATIC CLOCK</h3><label class="chip-sim-period">Period<select data-chip-clock-period><option value="200" ${this.clockPeriod === 200 ? 'selected' : ''}>200 ms</option><option value="500" ${this.clockPeriod === 500 ? 'selected' : ''}>500 ms</option><option value="1000" ${this.clockPeriod === 1000 ? 'selected' : ''}>1 s</option><option value="2000" ${this.clockPeriod === 2000 ? 'selected' : ''}>2 s</option></select></label><button class="chip-run-button" data-chip-action="${this.clockTimer ? 'clock-stop' : 'clock-start'}">${this.clockTimer ? '■ Stop automatic clock' : '▶ Start automatic clock'}</button></div>` : ''}
      <div class="chip-sim-section"><h3>OUTPUT MONITORS <span>${outputs.length} PINS</span></h3>${outputs.length ? outputs.map((node) => {
        const value = result.outputs.get(node.id);
        const displayed = node.type === 'BUS_OUTPUT'
          ? result.outputs.has(node.id) && typeof value === 'number' ? `${value.toString(2).padStart(node.width || 4, '0')} · ${value}` : '— · OPEN'
          : result.outputs.has(node.id) ? value ? '1 · HIGH' : '0 · LOW' : '— · OPEN';
        return `<div class="chip-sim-pin output"><span><i class="${value === true || typeof value === 'number' && value > 0 ? 'high' : result.outputs.has(node.id) ? 'low' : 'unknown'}"></i>${escapeHTML(node.label)}</span><b>${displayed}</b></div>`;
      }).join('') : '<p class="chip-sim-empty">Add output pins to monitor the design.</p>'}</div>
      ${this.renderWatchList(result.outputs)}
      <div class="chip-sim-metrics"><div><span>Gates</span><b>${this.nodes.filter((node) => GATES[node.type] && !SEQUENTIAL_TYPES.has(node.type)).length}</b></div><div><span>Wires</span><b>${this.wires.length}</b></div><div><span>Unresolved</span><b>${result.unresolved.size}</b></div></div>
      <button class="chip-run-button" data-chip-action="simulate">▶ &nbsp; Run simulation</button>
      <button class="chip-truth-button" data-chip-action="truth">Generate truth table</button>
      <button class="chip-truth-button" data-chip-action="open-testbench">Test benches · ${this.testBench.steps.length} vectors</button>
      <button class="chip-truth-button" data-chip-action="open-learning">Learning path · ${this.learningProgress.length} completed</button>
      <section class="chip-diagnostics-section"><header><strong>CIRCUIT CHECKS</strong><button data-chip-action="diagnose">Run checks</button></header>${this.renderDiagnostics()}</section>
      ${this.nodes.some((node) => SEQUENTIAL_TYPES.has(node.type)) ? `<section class="chip-clock-debugger"><header><strong>CLOCK EDGE DEBUGGER</strong><span>${this.clockEdgeCount} edges</span></header>${this.renderClockDebugger()}</section>` : ''}
      <section class="chip-waveform-section"><header><strong>TIMING WAVEFORMS</strong><span><button data-chip-action="export-vcd" ${this.trace.length ? '' : 'disabled'}>Export VCD</button><button data-chip-action="clear-waveforms">Clear</button></span></header>${this.renderWaveforms()}</section>
      <p class="chip-sim-note">Combinational propagation is live; D flip-flops update on manual pulses or while the automatic clock is running.</p>`;
  }

  renderClockDebugger() {
    const sequential = this.nodes.filter((node) => SEQUENTIAL_TYPES.has(node.type));
    const states = sequential.map((node) =>
      `<div class="chip-clock-state"><span>${escapeHTML(node.label)} · ${node.type}</span><b>${escapeHTML(this.describeSequentialState(node))}</b></div>`
    ).join('');
    const edges = this.clockEdgeLog.length
      ? this.clockEdgeLog.map((entry) => `<article><b>Edge ${entry.edge}</b><p>${escapeHTML(entry.changes.join(' · ') || 'Clock edge captured; state held.')}</p></article>`).join('')
      : '<p class="chip-sim-empty">Step the clock to record state changes.</p>';
    const breakpoints = this.nodes.filter((node) => this.breakpointNodeIds?.has(node.id));
    return `${breakpoints.length ? `<p class="chip-sim-note">Clock pauses on a rising edge when ${breakpoints.map((node) => escapeHTML(node.label)).join(', ')} changes state.</p>` : ''}<div class="chip-clock-state-list">${states}</div><div class="chip-clock-edge-list">${edges}</div>`;
  }

  renderWatchList(values = this.evaluate().outputs) {
    const watched = this.nodes.filter((node) => this.watchNodeIds?.has(node.id));
    if (!watched.length) return '';
    return `<div class="chip-sim-section"><h3>WATCH LIST <span>${watched.length} SIGNALS</span></h3>${watched.map((node) => {
      const value = values.get(node.id);
      const display = Array.isArray(value)
        ? value.map((bit, index) => `${index}:${typeof bit === 'number' ? bit : bit === true ? 1 : bit === false ? 0 : '—'}`).join(' · ')
        : typeof value === 'number' ? `${value.toString(2).padStart(node.width || 4, '0')} · ${value}`
          : value === true ? '1 · HIGH' : value === false ? '0 · LOW' : 'UNRESOLVED';
      return `<button class="chip-watch-item" data-chip-action="focus-watch" data-watch-id="${escapeHTML(node.id)}"><span>${escapeHTML(node.label)}</span><b>${escapeHTML(display)}</b></button>`;
    }).join('')}</div>`;
  }

  formatTestValue(node, value) {
    if (value === undefined || value === null) return 'open';
    if (node.type === 'BUS_OUTPUT' && typeof value === 'number') {
      return `${value.toString(2).padStart(node.width || 4, '0')} (${value})`;
    }
    return typeof value === 'boolean' ? value ? 'HIGH (1)' : 'LOW (0)' : String(value);
  }

  buildVcd() {
    if (!this.trace.length) throw new Error('Capture at least one signal transition before exporting a VCD trace.');
    const signals = [];
    for (const node of this.nodes) {
      if (node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT') {
        signals.push({ node, output: null, width: node.type === 'BUS_OUTPUT' ? node.width || 4 : 1 });
        continue;
      }
      for (let output = 0; output < this.outputCount(node); output += 1) {
        signals.push({
          node,
          output,
          width: this.portSignalKind(node, 'out', output) === 'bus' ? node.width || 4 : 1
        });
      }
    }
    if (!signals.length) throw new Error('This design has no signal outputs to export.');
    const safeName = (name) => String(name || 'signal').replace(/[^A-Za-z0-9_$]/g, '_').replace(/^[^A-Za-z_$]/, '_$&');
    const descriptors = signals.map((signal, index) => ({
      ...signal,
      id: `s${index}`,
      name: safeName(signal.output === null
        ? signal.node.label
        : this.outputCount(signal.node) > 1 ? `${signal.node.label}_${signal.output + 1}` : signal.node.label)
    }));
    const lines = [
      '$date generated by Electro Lab $end',
      '$version Electro Lab Chip Lab $end',
      '$timescale 1ms $end',
      '$scope module ChipLab $end',
      ...descriptors.map(({ id, name, width }) => `$var wire ${width} ${id} ${name} $end`),
      '$upscope $end',
      '$enddefinitions $end'
    ];
    const valueFor = (sample, descriptor) => {
      const value = new Map(sample.outputs).get(descriptor.node.id);
      return descriptor.output === null || !Array.isArray(value) ? value : value[descriptor.output];
    };
    this.trace.forEach((sample, time) => {
      lines.push(`#${time}`);
      for (const descriptor of descriptors) {
        const value = valueFor(sample, descriptor);
        if (descriptor.width === 1) {
          lines.push(`${value === true || typeof value === 'number' && value !== 0 ? '1' : value === false || typeof value === 'number' ? '0' : 'x'}${descriptor.id}`);
        } else {
          const binary = typeof value === 'number'
            ? (value & BUS_MASK(descriptor.width)).toString(2).padStart(descriptor.width, '0')
            : 'x'.repeat(descriptor.width);
          lines.push(`b${binary} ${descriptor.id}`);
        }
      }
    });
    return `${lines.join('\n')}\n`;
  }

  exportVcd() {
    try {
      const content = this.buildVcd();
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.chipName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logic-chip'}.vcd`;
      link.click();
      URL.revokeObjectURL(url);
      this.setStatus(`Exported ${this.trace.length} captured simulation samples as VCD.`);
    } catch (error) {
      this.setStatus(`Could not export VCD: ${error.message}`);
    }
  }

  renderWaveforms() {
    if (!this.trace.length) return '<p class="chip-sim-empty">Run clock steps or change inputs to capture signal history.</p>';
    const rows = [];
    const probedWires = this.wires.filter((wire) => wire.probe);
    if (probedWires.length) {
      for (const wire of probedWires) {
        const node = this.nodes.find((entry) => entry.id === wire.from);
        const target = this.nodes.find((entry) => entry.id === wire.to);
        if (!node || !target) continue;
        const width = this.portWidth(node, 'out', wire.output);
        rows.push({
          node,
          output: wire.output,
          bit: 0,
          width,
          label: `${wire.label || `${node.label} → ${target.label}`}${width > 1 ? `[${width - 1}:0]` : ''}`
        });
        if (width > 1) {
          for (let bit = 1; bit < width; bit += 1) rows.push({
            node, output: wire.output, bit, width,
            label: `${wire.label || `${node.label} → ${target.label}`}[${bit}]`
          });
        }
      }
    } else for (const node of this.nodes) {
      if (node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT') {
        const width = node.type === 'BUS_OUTPUT' ? node.width || 4 : 1;
        for (let bit = 0; bit < width; bit += 1) rows.push({ node, output: 0, bit, width, label: `${node.label}${width > 1 ? `[${bit}]` : ''}` });
        continue;
      }
      for (let output = 0; output < this.outputCount(node); output += 1) {
        const width = this.portSignalKind(node, 'out', output) === 'bus' ? node.width || 4 : 1;
        for (let bit = 0; bit < width; bit += 1) rows.push({ node, output, bit, width, label: `${node.label}${width > 1 ? `[${bit}]` : ''}` });
      }
    }
    if (!rows.length) return '<p class="chip-sim-empty">Add signal-producing components to view waveforms.</p>';
    const stepWidth = 28;
    const labelWidth = 118;
    const graphWidth = Math.max(160, this.trace.length * stepWidth);
    const rowHeight = 30;
    const graphHeight = rows.length * rowHeight;
    const traceMaps = this.trace.map((sample) => new Map(sample.outputs));
    const grid = Array.from({ length: this.trace.length + 1 }, (_, index) =>
      `<line x1="${labelWidth + index * stepWidth}" y1="0" x2="${labelWidth + index * stepWidth}" y2="${graphHeight}" class="chip-wave-grid"/>`
    ).join('');
    const signals = rows.map((row, rowIndex) => {
      const yTop = rowIndex * rowHeight + 3;
      const points = traceMaps.map((values, index) => {
        const value = values.get(row.node.id);
        const outputValue = Array.isArray(value) ? value[row.output] : value;
        const bitValue = row.width > 1 ? Boolean((Number(outputValue) || 0) & (1 << row.bit)) : outputValue;
        return { x: labelWidth + index * stepWidth + stepWidth / 2, y: yTop + (bitValue === true ? 5 : bitValue === false ? 21 : 13) };
      });
      const path = points.map((point, index) => `${index ? `H ${point.x} V ${point.y}` : `M ${point.x} ${point.y}`}`).join(' ');
      return `<g class="chip-wave-row" data-wave-node-id="${escapeHTML(row.node.id)}" tabindex="0" role="button" aria-label="Select ${escapeHTML(row.label)} on the schematic"><rect x="0" y="${yTop}" width="${labelWidth + graphWidth}" height="${rowHeight}" class="chip-wave-hit"/><text x="4" y="${yTop + 14}" class="chip-wave-label">${escapeHTML(row.label)}</text><path d="${path}" class="chip-wave-path"/></g>`;
    }).join('');
    return `<div class="chip-wave-scroll"><svg class="chip-wave-svg" width="${labelWidth + graphWidth}" height="${graphHeight + 4}" viewBox="0 0 ${labelWidth + graphWidth} ${graphHeight + 4}" role="img" aria-label="${probedWires.length ? 'Probed signal timing waveforms' : 'Signal timing waveforms'}">${grid}${signals}</svg></div><small>${probedWires.length ? `${probedWires.length} probed connection${probedWires.length === 1 ? '' : 's'} · ` : ''}${this.trace.length} captured transitions · most recent ${TRACE_LIMIT} retained</small>`;
  }

  focusWaveSignal(nodeId) {
    const node = this.nodes.find((entry) => entry.id === nodeId);
    if (!node) return;
    this.selectedNodeId = node.id;
    this.selectedNodeIds = new Set([node.id]);
    this.selectedWireIndex = null;
    this.renderCanvas();
    this.renderInspector();
    this.setTab('inspect');
    this.setStatus(`Selected "${node.label}" from its waveform.`);
  }

  render() {
    this.renderCanvas();
    this.renderCustomChipLibrary();
    this.renderInspector();
    if (!this.el.querySelector('[data-chip-simulation]').hidden) this.renderSimulation();
  }

  setStatus(message) {
    this.el.querySelector('[data-chip-status]').textContent = message;
  }

  svgPoint(event) {
    const svg = this.el.querySelector('.chip-canvas');
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }

  fitCanvas() {
    const svg = this.el.querySelector('.chip-canvas');
    if (!this.nodes.length) {
      svg.setAttribute('viewBox', '0 0 1200 740');
      return;
    }
    const minX = Math.max(0, Math.min(...this.nodes.map((node) => node.x)) - 80);
    const minY = Math.max(0, Math.min(...this.nodes.map((node) => node.y)) - 80);
    const maxX = Math.max(...this.nodes.map((node) => node.x + 180)) + 80;
    const maxY = Math.max(...this.nodes.map((node) => node.y + this.nodeHeight(node))) + 80;
    svg.setAttribute('viewBox', `${minX} ${minY} ${Math.max(200, maxX - minX)} ${Math.max(160, maxY - minY)}`);
  }

  tokenizeVerilogExpression(source) {
    const tokens = [];
    const pattern = /\s*(\d+'[bhd][0-9a-fA-F_xXzZ]+|\d+|[A-Za-z_]\w*|==|!=|[()?:~&|^+<>])/gy;
    let index = 0;
    source = source.trim();
    while (index < source.length) {
      pattern.lastIndex = index;
      const match = pattern.exec(source);
      if (!match) throw new Error(`Unsupported Verilog expression near "${source.slice(index, index + 16)}".`);
      tokens.push(match[1]);
      index = pattern.lastIndex;
    }
    return tokens;
  }

  parseVerilogExpression(source) {
    const tokens = this.tokenizeVerilogExpression(source);
    let cursor = 0;
    const precedence = { '==': 1, '!=': 1, '<': 1, '>': 1, '|': 2, '^': 3, '&': 4, '+': 5 };
    const parsePrimary = () => {
      const token = tokens[cursor++];
      if (!token) throw new Error('Incomplete Verilog expression.');
      if (token === '~') return { kind: 'unary', operator: token, value: parsePrimary() };
      if (token === '(') {
        const value = parseBinary(0);
        if (tokens[cursor++] !== ')') throw new Error('Unclosed parentheses in Verilog expression.');
        return value;
      }
      if (/^\d/.test(token)) {
        const sized = token.match(/^(\d+)'([bhd])([0-9a-fA-F_xXzZ]+)$/i);
        let value;
        let width = 1;
        if (sized) {
          width = Number(sized[1]);
          if (/[xXzZ]/.test(sized[3]) || !Number.isInteger(width) || width < 1 || width > 8) {
            throw new Error('Only fully-defined Verilog literals up to 8 bits are supported.');
          }
          value = parseInt(sized[3].replaceAll('_', ''), ({ b: 2, h: 16, d: 10 })[sized[2].toLowerCase()]);
        } else value = Number(token);
        if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error(`Invalid Verilog constant "${token}".`);
        return { kind: 'literal', value, width };
      }
      if (!/^[A-Za-z_]\w*$/.test(token)) throw new Error(`Unexpected token "${token}" in Verilog expression.`);
      return { kind: 'identifier', name: token };
    };
    const parseBinary = (minimum) => {
      let left = parsePrimary();
      while (cursor < tokens.length && Object.hasOwn(precedence, tokens[cursor]) && precedence[tokens[cursor]] >= minimum) {
        const operator = tokens[cursor++];
        const priority = precedence[operator];
        const right = parseBinary(priority + 1);
        left = { kind: 'binary', operator, left, right };
      }
      if (minimum === 0 && tokens[cursor] === '?') {
        cursor += 1;
        const consequent = parseBinary(0);
        if (tokens[cursor++] !== ':') throw new Error('Verilog conditional expression is missing ":".');
        left = { kind: 'mux', select: left, yes: consequent, no: parseBinary(0) };
      }
      return left;
    };
    const expression = parseBinary(0);
    if (cursor !== tokens.length) throw new Error(`Unexpected token "${tokens[cursor]}" in Verilog expression.`);
    return expression;
  }

  verilogIdentifiers(expression, result = new Set()) {
    if (expression.kind === 'identifier') result.add(expression.name);
    if (expression.kind === 'unary') this.verilogIdentifiers(expression.value, result);
    if (expression.kind === 'binary') {
      this.verilogIdentifiers(expression.left, result);
      this.verilogIdentifiers(expression.right, result);
    }
    if (expression.kind === 'mux') {
      this.verilogIdentifiers(expression.select, result);
      this.verilogIdentifiers(expression.yes, result);
      this.verilogIdentifiers(expression.no, result);
    }
    return result;
  }

  exportVerilog() {
    const allowed = new Set(['INPUT', 'OUTPUT', 'CLOCK', 'BUS_INPUT', 'CONST', 'BUS_CONST', 'VPLUS', 'GROUND',
      'AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR', 'XNOR', 'BUF',
      'BUS_AND', 'BUS_OR', 'BUS_XOR', 'BUS_NOT', 'MUX', 'ADDER', 'COMPARATOR']);
    const unsupported = this.nodes.filter((node) => !allowed.has(node.type));
    if (unsupported.length) {
      this.setStatus(`Verilog export supports combinational gates and muxes; unsupported components: ${unsupported.map((node) => node.label || node.type).join(', ')}.`);
      return null;
    }
    const usedNames = new Set();
    const uniqueName = (label, fallback) => {
      let base = String(label || fallback).replace(/[^A-Za-z0-9_$]/g, '_');
      if (!/^[A-Za-z_$]/.test(base)) base = `n_${base}`;
      let result = base;
      let suffix = 2;
      while (usedNames.has(result)) result = `${base}_${suffix++}`;
      usedNames.add(result);
      return result;
    };
    const inputs = this.nodes.filter((node) => ['INPUT', 'CLOCK', 'BUS_INPUT'].includes(node.type));
    const outputs = this.nodes.filter((node) => node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT');
    if (!outputs.length) {
      this.setStatus('Add at least one output pin before exporting Verilog.');
      return null;
    }
    const ports = new Map();
    for (const node of [...inputs, ...outputs]) ports.set(node.id, uniqueName(node.label, node.id));
    const portList = [...inputs, ...outputs].map((node) => ports.get(node.id));
    const declarations = [...inputs.map((node) => `  input wire ${node.type === 'BUS_INPUT' ? `[${node.width - 1}:0] ` : ''}${ports.get(node.id)};`),
      ...outputs.map((node) => `  output wire ${node.type === 'BUS_OUTPUT' ? `[${node.width - 1}:0] ` : ''}${ports.get(node.id)};`)];
    const assignments = [];
    const nets = new Map();
    for (const node of inputs) nets.set(node.id, [ports.get(node.id)]);
    const readInput = (node, port) => {
      const wire = this.wires.find((entry) => entry.to === node.id && entry.input === port);
      if (!wire) throw new Error(`${node.label} input ${port + 1} is unconnected.`);
      const values = nets.get(wire.from);
      if (!values || values[wire.output] === undefined) throw new Error(`Signal into ${node.label} is not available.`);
      return values[wire.output];
    };
    for (const node of this.nodes) {
      if (node.type === 'OUTPUT' || node.type === 'BUS_OUTPUT') continue;
      if (node.type === 'CONST' || node.type === 'BUS_CONST' || node.type === 'VPLUS' || node.type === 'GROUND') {
        const width = node.type === 'BUS_CONST' ? node.width : 1;
        const value = node.type === 'VPLUS' ? 1 : node.type === 'GROUND' ? 0 : Number(node.value);
        nets.set(node.id, [`${width}'b${value.toString(2).padStart(width, '0')}`]);
        continue;
      }
      if (inputs.includes(node)) continue;
      const base = uniqueName(`n_${node.id}`, node.id);
      const width = node.width || 4;
      let expressions;
      if (['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR', 'BUS_AND', 'BUS_OR', 'BUS_XOR'].includes(node.type)) {
        const operator = ['AND', 'NAND', 'BUS_AND'].includes(node.type) ? '&' :
          ['OR', 'NOR', 'BUS_OR'].includes(node.type) ? '|' : '^';
        let expression = `(${readInput(node, 0)} ${operator} ${readInput(node, 1)})`;
        if (node.type === 'NAND' || node.type === 'NOR' || node.type === 'XNOR') expression = `~${expression}`;
        expressions = [expression];
      } else if (node.type === 'NOT' || node.type === 'BUS_NOT') {
        expressions = [`~${readInput(node, 0)}`];
      } else if (node.type === 'BUF') {
        expressions = [readInput(node, 0)];
      } else if (node.type === 'MUX') {
        expressions = [`(${readInput(node, 2)} ? ${readInput(node, 1)} : ${readInput(node, 0)})`];
      } else if (node.type === 'ADDER') {
        declarations.push(`  wire [${width}:0] ${base}_full;`);
        assignments.push(`  assign ${base}_full = {1'b0, ${readInput(node, 0)}} + {1'b0, ${readInput(node, 1)}} + ${readInput(node, 2)};`);
        expressions = [`${base}_full[${width - 1}:0]`, `${base}_full[${width}]`];
      } else if (node.type === 'COMPARATOR') {
        const a = readInput(node, 0), b = readInput(node, 1);
        expressions = [`(${a} > ${b})`, `(${a} == ${b})`, `(${a} < ${b})`];
      } else {
        throw new Error(`Verilog export does not support ${node.type}.`);
      }
      expressions.forEach((expression, index) => {
        const bus = this.portSignalKind(node, 'out', index) === 'bus';
        const name = expressions.length > 1 ? `${base}_${index}` : base;
        declarations.push(`  wire ${bus ? `[${this.portWidth(node, 'out', index) - 1}:0] ` : ''}${name};`);
        assignments.push(`  assign ${name} = ${expression};`);
      });
      nets.set(node.id, expressions.map((_, index) => expressions.length > 1 ? `${base}_${index}` : base));
    }
    for (const node of outputs) assignments.push(`  assign ${ports.get(node.id)} = ${readInput(node, 0)};`);
    const moduleName = this.chipName.replace(/[^A-Za-z0-9_$]/g, '_').replace(/^[^A-Za-z_$]/, '_') || 'logic_chip';
    return `// Electro Lab Verilog export. Combinational subset; sequential and custom chips are not included.\nmodule ${moduleName}(${portList.join(', ')});\n${declarations.join('\n')}\n\n${assignments.join('\n')}\nendmodule\n`;
  }

  async importVerilog(file) {
    if (!file) return;
    try {
      const source = (await file.text()).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const module = source.match(/\bmodule\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;/);
      if (!module || (source.match(/\bmodule\b/g) || []).length !== 1 || (source.match(/\bendmodule\b/g) || []).length !== 1) {
        throw new Error('Expected exactly one Verilog module with a parenthesized port list.');
      }
      const moduleName = module[1];
      const modulePorts = module[2].split(',').map((port) => port.trim()).filter(Boolean);
      if (modulePorts.some((port) => !/^[A-Za-z_]\w*$/.test(port))) {
        throw new Error('Use a plain module port list; ANSI-style declarations are not supported yet.');
      }
      const declarations = new Map();
      const declarationPattern = /\b(input|output|wire)\s+(?:(?:wire|reg|logic)\s+)?(?:\[(\d+)\s*:\s*(\d+)\]\s*)?([^;]+);/g;
      for (const declaration of source.matchAll(declarationPattern)) {
        const direction = declaration[1];
        const msb = declaration[2] === undefined ? 0 : Number(declaration[2]);
        const lsb = declaration[3] === undefined ? 0 : Number(declaration[3]);
        if (lsb !== 0 || msb > 7) throw new Error('Only scalar and [N:0] vectors up to 8 bits are supported.');
        const width = declaration[2] === undefined ? 1 : msb + 1;
        if (width > 1 && !BUS_WIDTHS.includes(width)) throw new Error('Bus widths must be 2, 4, or 8 bits.');
        for (const raw of declaration[4].split(',')) {
          const name = raw.trim();
          if (!/^[A-Za-z_]\w*$/.test(name) || declarations.has(name)) throw new Error(`Invalid or duplicate declaration "${name}".`);
          declarations.set(name, { direction, width });
        }
      }
      const ports = modulePorts.map((name) => {
        const declaration = declarations.get(name);
        if (!declaration || !['input', 'output'].includes(declaration.direction)) {
          throw new Error(`Module port "${name}" needs an input or output declaration.`);
        }
        return [name, declaration];
      });
      const assignments = [...source.matchAll(/\bassign\s+([A-Za-z_]\w*)\s*=\s*([^;]+);/g)].map((match) => ({
        target: match[1], expression: this.parseVerilogExpression(match[2])
      }));
      if (!assignments.length || (source.match(/\bassign\b/g) || []).length !== assignments.length) {
        throw new Error('Only continuous "assign" statements are supported. Sequential always blocks are not imported.');
      }
      const driverNames = new Set();
      for (const assignment of assignments) {
        if (!declarations.has(assignment.target) || declarations.get(assignment.target).direction === 'input' ||
            driverNames.has(assignment.target)) throw new Error(`Invalid or multiply-driven assignment target "${assignment.target}".`);
        driverNames.add(assignment.target);
      }
      const components = [];
      const wires = [];
      let sequence = 0;
      const newNode = (type, label, width = undefined) => {
        const node = {
          id: `u${++sequence}`, type, label: label.slice(0, 32),
          x: 80 + (components.length % 4) * 230, y: 70 + Math.floor(components.length / 4) * 130,
          value: type === 'BUS_INPUT' || type === 'BUS_CONST' ? 0 : false,
          q: false, width
        };
        components.push(node);
        return node;
      };
      const wire = (from, output, to, input) => wires.push({ from: from.node.id, output: from.output, to: to.id, input });
      const signals = new Map();
      const outputNodes = new Map();
      for (const [name, declaration] of ports) {
        if (declaration.direction === 'input') {
          const node = newNode(declaration.width === 1 ? 'INPUT' : 'BUS_INPUT', name, declaration.width === 1 ? undefined : declaration.width);
          signals.set(name, { node, output: 0, width: declaration.width, bus: declaration.width > 1 });
        } else {
          const node = newNode(declaration.width === 1 ? 'OUTPUT' : 'BUS_OUTPUT', name, declaration.width === 1 ? undefined : declaration.width);
          outputNodes.set(name, node);
        }
      }
      const widthOf = (expression) => {
        if (expression.kind === 'identifier') return declarations.get(expression.name)?.width;
        if (expression.kind === 'literal') return expression.width;
        if (expression.kind === 'unary') return widthOf(expression.value);
        if (expression.kind === 'binary') return Math.max(widthOf(expression.left) || 1, widthOf(expression.right) || 1);
        if (expression.kind === 'mux') return Math.max(widthOf(expression.yes) || 1, widthOf(expression.no) || 1);
        return 1;
      };
      const makeConstant = (value, width) => {
        const node = newNode(width === 1 ? 'CONST' : 'BUS_CONST', `${value ? 'HIGH' : 'LOW'} constant`, width === 1 ? undefined : width);
        node.value = value;
        return { node, output: 0, width, bus: width > 1 };
      };
      const compile = (expression, expectedWidth = undefined) => {
        if (expression.kind === 'identifier') {
          const signal = signals.get(expression.name);
          if (!signal) throw new Error(`Signal "${expression.name}" has not been assigned yet.`);
          return signal;
        }
        if (expression.kind === 'literal') {
          const width = expectedWidth || expression.width;
          if (expression.value > BUS_MASK(width)) throw new Error('A literal does not fit the destination width.');
          return makeConstant(expression.value, width);
        }
        if (expression.kind === 'unary') {
          const input = compile(expression.value, expectedWidth);
          const node = newNode(input.bus ? 'BUS_NOT' : 'NOT', 'Inverter', input.width > 1 ? input.width : undefined);
          wire(input, 0, node, 0);
          return { node, output: 0, width: input.width, bus: input.bus };
        }
        if (expression.kind === 'mux') {
          const select = compile(expression.select, 1);
          const width = expectedWidth || Math.max(widthOf(expression.yes), widthOf(expression.no));
          const a = compile(expression.no, width), b = compile(expression.yes, width);
          if (select.bus || a.width !== b.width) throw new Error('A mux needs a scalar select and equal-width data inputs.');
          if (width === 1) {
            const notSelect = newNode('NOT', 'Mux select invert');
            wire(select, 0, notSelect, 0);
            const selectedA = newNode('AND', 'Mux A select');
            wire(a, 0, selectedA, 0); wire({ ...select, node: notSelect }, 0, selectedA, 1);
            const selectedB = newNode('AND', 'Mux B select');
            wire(b, 0, selectedB, 0); wire(select, 0, selectedB, 1);
            const combined = newNode('OR', 'Mux output');
            wire({ node: selectedA, output: 0 }, 0, combined, 0); wire({ node: selectedB, output: 0 }, 0, combined, 1);
            return { node: combined, output: 0, width: 1, bus: false };
          }
          const node = newNode('MUX', 'Multiplexer', width);
          wire(a, 0, node, 0); wire(b, 0, node, 1); wire(select, 0, node, 2);
          return { node, output: 0, width, bus: width > 1 };
        }
        const leftWidth = widthOf(expression.left), rightWidth = widthOf(expression.right);
        const width = expectedWidth || Math.max(leftWidth, rightWidth);
        const left = compile(expression.left, width), right = compile(expression.right, width);
        if (left.width !== right.width) throw new Error('Bitwise operands must have the same width.');
        if (['==', '!=', '<', '>'].includes(expression.operator)) {
          if (!left.bus || !right.bus) throw new Error('Comparisons in the Verilog subset require vector operands.');
          const node = newNode('COMPARATOR', 'Comparator', width);
          wire(left, 0, node, 0); wire(right, 0, node, 1);
          const output = expression.operator === '>' ? 0 : expression.operator === '<' ? 2 : 1;
          const signal = { node, output, width: 1, bus: false };
          if (expression.operator !== '!=') return signal;
          const invert = newNode('NOT', 'Not equal', undefined);
          wire(signal, 0, invert, 0);
          return { node: invert, output: 0, width: 1, bus: false };
        }
        const types = { '&': left.bus ? 'BUS_AND' : 'AND', '|': left.bus ? 'BUS_OR' : 'OR', '^': left.bus ? 'BUS_XOR' : 'XOR', '+': left.bus ? 'ADDER' : 'XOR' };
        const type = types[expression.operator];
        if (!type) throw new Error(`Operator "${expression.operator}" is unsupported.`);
        const node = newNode(type, type === 'ADDER' ? 'Adder' : `${type} gate`, left.bus ? width : undefined);
        wire(left, 0, node, 0); wire(right, 0, node, 1);
        if (type === 'ADDER') {
          const carryIn = makeConstant(0, 1);
          wire(carryIn, 0, node, 2);
        }
        return { node, output: 0, width, bus: left.bus };
      };
      const pending = [...assignments];
      while (pending.length) {
        const index = pending.findIndex((assignment) =>
          [...this.verilogIdentifiers(assignment.expression)].every((name) => signals.has(name))
        );
        if (index < 0) throw new Error(`Unresolved signal dependency or feedback in assignment to "${pending[0].target}".`);
        const [assignment] = pending.splice(index, 1);
        const target = assignment.target;
        const targetWidth = declarations.get(target).width;
        const sourceSignal = compile(assignment.expression, targetWidth);
        if (sourceSignal.width !== targetWidth) throw new Error(`Width mismatch assigning "${target}".`);
        if (outputNodes.has(target)) wire(sourceSignal, 0, outputNodes.get(target), 0);
        else signals.set(target, sourceSignal);
      }
      for (const [name, node] of outputNodes) {
        if (!driverNames.has(name)) throw new Error(`Output "${name}" is not driven.`);
      }
      const old = this.snapshotDesign();
      this.commitHistory(old);
      this.nodes = components;
      this.wires = wires;
      this.nodeSequence = sequence;
      this.chipName = moduleName.slice(0, 48);
      this.el.querySelector('[data-chip-name]').value = this.chipName;
      this.el.querySelector('[data-chip-title]').textContent = this.chipName;
      this.selectedNodeId = null;
      this.selectedNodeIds.clear();
      this.selectedWireIndex = null;
      this.resetTrace();
      this.fitCanvas();
      this.render();
      this.runSimulation();
      this.setStatus(`Imported Verilog module "${moduleName}" · ${components.length} components, ${wires.length} signal nets.`);
    } catch (error) {
      this.setStatus(`Verilog import failed: ${error.message}`);
    } finally {
      this.el.querySelector('[data-chip-hdl-file]').value = '';
    }
  }

  exportDesign() {
    const data = {
      format: 'electro-lab-chip-design',
      version: 4,
      designId: this.designId,
      name: this.chipName,
      components: this.nodes.map(({ id, type, label, note, x, y, value, q, width, addressWidth, phase, memory, definition }) =>
        ({ id, type, label, note, x, y, value, q, width, addressWidth, phase, memory, definition })),
      wires: this.wires,
      testBench: this.testBench
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.chipName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logic-chip'}.chip.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.setStatus('Design exported as an editable Electro Lab chip JSON file.');
  }

  async importDesign(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.format !== 'electro-lab-chip-design' || ![1, 2, 3, 4].includes(data.version) || !Array.isArray(data.components) || !Array.isArray(data.wires)) {
        throw new Error('Unsupported chip design file.');
      }
      const ids = new Set();
      const components = data.components.map((node) => {
        if (!node || typeof node.id !== 'string' || ids.has(node.id) ||
            !(['INPUT', 'OUTPUT', 'CLOCK', 'BUS_INPUT', 'BUS_OUTPUT', 'SPLITTER', 'JOINER', 'CONST', 'BUS_CONST', 'VPLUS', 'GROUND'].includes(node.type) || node.type === 'CUSTOM' && node.definition || Object.hasOwn(GATES, node.type)) ||
            typeof node.label !== 'string' || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
          throw new Error('The design contains an invalid component.');
        }
        if (node.note !== undefined && typeof node.note !== 'string') {
          throw new Error('The design contains an invalid component note.');
        }
        if (node.type === 'CUSTOM' && !this.validateCustomDefinition(node.definition)) {
          throw new Error('The design contains an invalid reusable chip definition.');
        }
        if (BUS_TYPES.has(node.type) && !(node.type === 'DECODER' ? [2, 3, 4] : BUS_WIDTHS).includes(node.width || 4)) {
          throw new Error('The design contains an invalid bus width.');
        }
        if ((node.type === 'BUS_INPUT' || node.type === 'BUS_CONST') &&
            (!Number.isInteger(node.value) || node.value < 0 || node.value > BUS_MASK(node.width || 4))) {
          throw new Error('The design contains an invalid bus value.');
        }
        ids.add(node.id);
        return {
          id: node.id, type: node.type, label: node.label.slice(0, 32),
          note: typeof node.note === 'string' ? node.note.slice(0, 160) : '',
          x: node.x, y: node.y,
          value: node.type === 'BUS_INPUT' || node.type === 'BUS_CONST' ? node.value : Boolean(node.value),
          q: ['REGISTER', 'COUNTER', 'RAM'].includes(node.type)
            ? Number.isInteger(node.q) && node.q >= 0 && node.q <= BUS_MASK(node.width || 4) ? node.q : 0
            : Boolean(node.q),
          width: BUS_TYPES.has(node.type)
            ? node.type === 'DECODER' ? [2, 3, 4].includes(node.width) ? node.width : 2
              : BUS_WIDTHS.includes(node.width) ? node.width : 4
            : undefined,
          addressWidth: node.type === 'RAM' ? 2 : undefined,
          phase: node.type === 'CLOCK_DIVIDER' && Number.isInteger(node.phase) && node.phase >= 0 ? node.phase : 0,
          memory: node.type === 'RAM'
            ? Array.isArray(node.memory) && node.memory.length === 4 && node.memory.every((value) => Number.isInteger(value) && value >= 0 && value <= BUS_MASK(node.width || 4))
              ? node.memory.slice() : [0, 0, 0, 0]
            : undefined,
          definition: node.type === 'CUSTOM' ? structuredClone(node.definition) : undefined
        };
      });
      const nodeMap = new Map(components.map((node) => [node.id, node]));
      const wires = data.wires.map((wire) => {
        const source = nodeMap.get(wire.from);
        const target = nodeMap.get(wire.to);
        const inputCount = target ? this.inputCount(target) : 0;
        const outputCount = source ? this.outputCount(source) : 0;
        if (!source || !target || source.type === 'OUTPUT' || source.type === 'BUS_OUTPUT' || target.type === 'INPUT' || target.type === 'BUS_INPUT' || target.type === 'BUS_CONST' || target.type === 'CONST' ||
            !Number.isInteger(wire.output) || wire.output < 0 || wire.output >= outputCount ||
            !Number.isInteger(wire.input) || wire.input < 0 || wire.input >= inputCount ||
            !this.portsCompatible(source, wire.output, target, wire.input) ||
            wire.label !== undefined && typeof wire.label !== 'string' ||
            wire.route !== undefined && !['curve', 'orthogonal', 'straight'].includes(wire.route) ||
            wire.probe !== undefined && typeof wire.probe !== 'boolean') {
          throw new Error('The design contains an invalid signal connection.');
        }
        return {
          from: source.id, output: wire.output, to: target.id, input: wire.input,
          label: typeof wire.label === 'string' ? wire.label.slice(0, 32) : undefined,
          route: wire.route,
          probe: wire.probe === true
        };
      });
      if (new Set(wires.map((wire) => `${wire.to}:${wire.input}`)).size !== wires.length) {
        throw new Error('A component input has more than one driver.');
      }
      const savedBench = data.version >= 3 ? data.testBench : null;
      const validBench = savedBench && typeof savedBench.name === 'string' && Array.isArray(savedBench.steps) &&
        savedBench.steps.length <= 512 && savedBench.steps.every((step) =>
          step && step.inputs && typeof step.inputs === 'object' && !Array.isArray(step.inputs) &&
          step.expected && typeof step.expected === 'object' && !Array.isArray(step.expected) &&
          typeof step.clock === 'boolean' &&
          Object.values(step.inputs).every((value) => typeof value === 'boolean' || Number.isInteger(value)) &&
          Object.values(step.expected).every((value) => typeof value === 'boolean' || Number.isInteger(value))
        );
      if (data.version >= 3 && !validBench) throw new Error('The design contains an invalid test bench.');
      this.commitHistory();
      this.nodes = components;
      this.wires = wires;
      this.stopClock();
      this.resetTrace();
      this.clockEdgeCount = 0;
      this.clockEdgeLog = [];
      this.editStack = [];
      this.updateEditControls();
      this.nodeSequence = components.reduce((max, node) => Math.max(max, Number(node.id.slice(1)) || 0), 0);
      this.designId = data.version >= 3 && typeof data.designId === 'string'
        ? data.designId.slice(0, 96)
        : `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      this.testBench = validBench
        ? { name: savedBench.name.slice(0, 48), steps: structuredClone(savedBench.steps) }
        : { name: 'Untitled test bench', steps: [] };
      this.chipName = typeof data.name === 'string' && data.name.trim() ? data.name.slice(0, 48) : 'Imported Logic Chip';
      this.el.querySelector('[data-chip-name]').value = this.chipName;
      this.el.querySelector('[data-chip-title]').textContent = this.chipName;
      this.selectedNodeId = null;
      this.selectedNodeIds.clear();
      this.persistTestBenches();
      this.render();
      this.runSimulation();
      this.setStatus(`Imported ${components.length} components and ${wires.length} signal nets.`);
    } catch (error) {
      this.setStatus(`Import failed: ${error.message}`);
    } finally {
      this.el.querySelector('[data-chip-file]').value = '';
    }
  }
}
