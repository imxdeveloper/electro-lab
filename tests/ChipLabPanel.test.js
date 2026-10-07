import test from 'node:test';
import assert from 'node:assert/strict';
import { ChipLabPanel } from '../src/ui/ChipLabPanel.js';

const createPanel = (nodes, wires) => {
  const panel = Object.create(ChipLabPanel.prototype);
  panel.nodes = nodes;
  panel.wires = wires;
  return panel;
};

test('multi-bit XOR preserves width and propagates the binary result', () => {
  const nodes = [
    { id: 'a', type: 'BUS_INPUT', width: 4, value: 13 },
    { id: 'b', type: 'BUS_INPUT', width: 4, value: 5 },
    { id: 'xor', type: 'BUS_XOR', width: 4 },
    { id: 'out', type: 'BUS_OUTPUT', width: 4 }
  ];
  const wires = [
    { from: 'a', output: 0, to: 'xor', input: 0 },
    { from: 'b', output: 0, to: 'xor', input: 1 },
    { from: 'xor', output: 0, to: 'out', input: 0 }
  ];
  const panel = createPanel(nodes, wires);

  assert.equal(panel.portsCompatible(nodes[0], 0, nodes[2], 0), true);
  assert.equal(panel.portsCompatible(nodes[0], 0, { ...nodes[2], width: 8 }, 0), false);
  assert.equal(panel.evaluate().outputs.get('out'), 8);
});

test('splitter and joiner round-trip a bus with B0 as the least-significant bit', () => {
  const nodes = [
    { id: 'input', type: 'BUS_INPUT', width: 4, value: 10 },
    { id: 'split', type: 'SPLITTER', width: 4 },
    { id: 'join', type: 'JOINER', width: 4 },
    { id: 'output', type: 'BUS_OUTPUT', width: 4 }
  ];
  const wires = [
    { from: 'input', output: 0, to: 'split', input: 0 },
    ...Array.from({ length: 4 }, (_, bit) => [
      { from: 'split', output: bit, to: 'join', input: bit }
    ]).flat(),
    { from: 'join', output: 0, to: 'output', input: 0 }
  ];
  const result = createPanel(nodes, wires).evaluate();

  assert.deepEqual(result.outputs.get('split'), [false, true, false, true]);
  assert.equal(result.outputs.get('output'), 10);
});

test('D flip-flops capture data on a rising edge and hold the value', () => {
  const nodes = [
    { id: 'data', type: 'INPUT', value: true },
    { id: 'clock', type: 'CLOCK', value: true },
    { id: 'dff', type: 'DFF', q: false },
    { id: 'output', type: 'OUTPUT' }
  ];
  const wires = [
    { from: 'data', output: 0, to: 'dff', input: 0 },
    { from: 'clock', output: 0, to: 'dff', input: 1 },
    { from: 'dff', output: 0, to: 'output', input: 0 }
  ];
  const panel = createPanel(nodes, wires);

  assert.equal(panel.captureClockEdge(), 1);
  assert.equal(panel.evaluate().outputs.get('output'), true);
  nodes[0].value = false;
  assert.equal(panel.evaluate().outputs.get('output'), true);
});

test('nested reusable chips evaluate their internal logic recursively', () => {
  const inner = {
    id: 'inner-chip',
    name: 'Inverter',
    inputs: [{ id: 'i', label: 'A' }],
    outputs: [{ id: 'o', label: 'Y' }],
    components: [
      { id: 'i', type: 'INPUT', label: 'A', x: 0, y: 0 },
      { id: 'not', type: 'NOT', label: 'NOT', x: 100, y: 0 },
      { id: 'o', type: 'OUTPUT', label: 'Y', x: 200, y: 0 }
    ],
    wires: [
      { from: 'i', output: 0, to: 'not', input: 0 },
      { from: 'not', output: 0, to: 'o', input: 0 }
    ]
  };
  const outer = {
    id: 'outer-chip',
    name: 'Nested inverter',
    inputs: [{ id: 'outer-in', label: 'A' }],
    outputs: [{ id: 'outer-out', label: 'Y' }],
    components: [
      { id: 'outer-in', type: 'INPUT', label: 'A', x: 0, y: 0 },
      { id: 'child', type: 'CUSTOM', label: 'Inverter', definition: inner, x: 100, y: 0 },
      { id: 'outer-out', type: 'OUTPUT', label: 'Y', x: 200, y: 0 }
    ],
    wires: [
      { from: 'outer-in', output: 0, to: 'child', input: 0 },
      { from: 'child', output: 0, to: 'outer-out', input: 0 }
    ]
  };
  const panel = createPanel([
    { id: 'source', type: 'INPUT', value: false },
    { id: 'nested', type: 'CUSTOM', definition: outer },
    { id: 'sink', type: 'OUTPUT' }
  ], [
    { from: 'source', output: 0, to: 'nested', input: 0 },
    { from: 'nested', output: 0, to: 'sink', input: 0 }
  ]);

  assert.equal(panel.validateCustomDefinition(outer), true);
  assert.equal(panel.evaluate().outputs.get('sink'), true);
});

test('mux, adder, comparator, and decoder expose correctly indexed output ports', () => {
  const nodes = [
    { id: 'a', type: 'BUS_INPUT', width: 4, value: 15 },
    { id: 'b', type: 'BUS_INPUT', width: 4, value: 1 },
    { id: 'cin', type: 'INPUT', value: true },
    { id: 'adder', type: 'ADDER', width: 4 },
    { id: 'sum', type: 'BUS_OUTPUT', width: 4 },
    { id: 'carry', type: 'OUTPUT' },
    { id: 'compare', type: 'COMPARATOR', width: 4 },
    { id: 'gt', type: 'OUTPUT' },
    { id: 'eq', type: 'OUTPUT' },
    { id: 'lt', type: 'OUTPUT' },
    { id: 'sel', type: 'INPUT', value: true },
    { id: 'mux', type: 'MUX', width: 4 },
    { id: 'muxOut', type: 'BUS_OUTPUT', width: 4 },
    { id: 'address0', type: 'INPUT', value: true },
    { id: 'address1', type: 'INPUT', value: false },
    { id: 'decoder', type: 'DECODER', width: 2 },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `decoded${index}`, type: 'OUTPUT' }))
  ];
  const wires = [
    { from: 'a', output: 0, to: 'adder', input: 0 },
    { from: 'b', output: 0, to: 'adder', input: 1 },
    { from: 'cin', output: 0, to: 'adder', input: 2 },
    { from: 'adder', output: 0, to: 'sum', input: 0 },
    { from: 'adder', output: 1, to: 'carry', input: 0 },
    { from: 'a', output: 0, to: 'compare', input: 0 },
    { from: 'b', output: 0, to: 'compare', input: 1 },
    { from: 'compare', output: 0, to: 'gt', input: 0 },
    { from: 'compare', output: 1, to: 'eq', input: 0 },
    { from: 'compare', output: 2, to: 'lt', input: 0 },
    { from: 'a', output: 0, to: 'mux', input: 0 },
    { from: 'b', output: 0, to: 'mux', input: 1 },
    { from: 'sel', output: 0, to: 'mux', input: 2 },
    { from: 'mux', output: 0, to: 'muxOut', input: 0 },
    { from: 'address0', output: 0, to: 'decoder', input: 0 },
    { from: 'address1', output: 0, to: 'decoder', input: 1 },
    ...Array.from({ length: 4 }, (_, index) => ({ from: 'decoder', output: index, to: `decoded${index}`, input: 0 }))
  ];
  const outputs = createPanel(nodes, wires).evaluate().outputs;

  assert.equal(outputs.get('sum'), 1);
  assert.equal(outputs.get('carry'), true);
  assert.deepEqual(outputs.get('compare'), [true, false, false]);
  assert.equal(outputs.get('gt'), true);
  assert.equal(outputs.get('eq'), false);
  assert.equal(outputs.get('lt'), false);
  assert.equal(outputs.get('muxOut'), 1);
  assert.deepEqual(outputs.get('decoder'), [false, true, false, false]);
});

test('registers, counters, SR flip-flops, dividers, and RAM update on clock edges', () => {
  const nodes = [
    { id: 'data', type: 'BUS_INPUT', width: 2, value: 2 },
    { id: 'enable', type: 'INPUT', value: true },
    { id: 'reset', type: 'INPUT', value: false },
    { id: 'clock', type: 'CLOCK', value: true },
    { id: 'register', type: 'REGISTER', width: 2, q: 0 },
    { id: 'counter', type: 'COUNTER', width: 2, q: 0 },
    { id: 'd', type: 'INPUT', value: false },
    { id: 'set', type: 'INPUT', value: true },
    { id: 'sr', type: 'SR_DFF', q: false },
    { id: 'divider', type: 'CLOCK_DIVIDER', width: 2, q: false, phase: 0 },
    { id: 'address', type: 'BUS_INPUT', width: 2, value: 1 },
    { id: 'ramData', type: 'BUS_INPUT', width: 4, value: 9 },
    { id: 'write', type: 'INPUT', value: true },
    { id: 'ram', type: 'RAM', width: 4, addressWidth: 2, q: 0, memory: [0, 0, 0, 0] }
  ];
  const wires = [
    { from: 'data', output: 0, to: 'register', input: 0 },
    { from: 'clock', output: 0, to: 'register', input: 1 },
    { from: 'enable', output: 0, to: 'counter', input: 0 },
    { from: 'reset', output: 0, to: 'counter', input: 1 },
    { from: 'clock', output: 0, to: 'counter', input: 2 },
    { from: 'd', output: 0, to: 'sr', input: 0 },
    { from: 'clock', output: 0, to: 'sr', input: 1 },
    { from: 'set', output: 0, to: 'sr', input: 2 },
    { from: 'reset', output: 0, to: 'sr', input: 3 },
    { from: 'clock', output: 0, to: 'divider', input: 0 },
    { from: 'reset', output: 0, to: 'divider', input: 1 },
    { from: 'ramData', output: 0, to: 'ram', input: 0 },
    { from: 'address', output: 0, to: 'ram', input: 1 },
    { from: 'write', output: 0, to: 'ram', input: 2 },
    { from: 'clock', output: 0, to: 'ram', input: 3 }
  ];
  const panel = createPanel(nodes, wires);

  assert.equal(panel.captureClockEdge(), 5);
  assert.equal(nodes.find((node) => node.id === 'register').q, 2);
  assert.equal(nodes.find((node) => node.id === 'counter').q, 1);
  assert.equal(nodes.find((node) => node.id === 'sr').q, true);
  assert.equal(nodes.find((node) => node.id === 'ram').memory[1], 9);
  nodes.find((node) => node.id === 'clock').value = false;
  assert.equal(nodes.find((node) => node.id === 'divider').q, false);
});

test('diagnostics report open output pins, floating inputs, and unused logic', () => {
  const panel = createPanel([
    { id: 'source', type: 'INPUT', value: false, label: 'A' },
    { id: 'gate', type: 'AND', label: 'AND1' },
    { id: 'unused', type: 'NOT', label: 'Unused inverter' },
    { id: 'output', type: 'OUTPUT', label: 'Y' }
  ], [{ from: 'source', output: 0, to: 'gate', input: 0 }]);
  const findings = panel.analyzeDesign();

  assert.ok(findings.some((finding) => finding.severity === 'error' && finding.message.includes('has no driver')));
  assert.ok(findings.some((finding) => finding.severity === 'warning' && finding.message.includes('input 2 is unconnected')));
  assert.ok(findings.some((finding) => finding.message.includes('Unused inverter does not contribute')));
});

test('Verilog parsing preserves operators and imports a combinational module', async () => {
  const panel = createPanel([], []);
  const expression = panel.parseVerilogExpression("sel ? (a ^ b) : 4'b0011");

  assert.equal(expression.kind, 'mux');
  assert.deepEqual([...panel.verilogIdentifiers(expression)].sort(), ['a', 'b', 'sel']);
  panel.el = { querySelector: () => ({ value: '', textContent: '', getAttribute: () => '0 0 1200 740', setAttribute() {} }) };
  panel.selectedNodeIds = new Set();
  panel.snapshotDesign = () => ({ nodes: [], wires: [], chipName: '', viewBox: '0 0 1200 740' });
  panel.commitHistory = () => {};
  panel.resetTrace = () => {};
  panel.fitCanvas = () => {};
  panel.render = () => {};
  panel.runSimulation = () => {};
  let status = '';
  panel.setStatus = (message) => { status = message; };
  const file = new Blob([`
    module simple_and(a, b, y);
      input a, b;
      output y;
      wire partial;
      assign partial = a & b;
      assign y = partial;
    endmodule
  `]);
  await panel.importVerilog(file);

  assert.equal(status, 'Imported Verilog module "simple_and" · 4 components, 3 signal nets.');
  assert.ok(panel.nodes.some((node) => node.type === 'AND'));
  assert.equal(panel.evaluate().outputs.get(panel.nodes.find((node) => node.type === 'OUTPUT').id), false);
});

test('Verilog export refuses designs it cannot faithfully represent', () => {
  const panel = createPanel([{ id: 'r', type: 'REGISTER', width: 4, q: 0 }], []);
  let status = '';
  panel.setStatus = (message) => { status = message; };

  assert.equal(panel.exportVerilog(), null);
  assert.match(status, /unsupported components: REGISTER/);
});

test('design import retains wire labels and routing metadata', async () => {
  const panel = Object.create(ChipLabPanel.prototype);
  const controls = {
    '[data-chip-file]': { value: '' },
    '[data-chip-name]': { value: '' },
    '[data-chip-title]': { textContent: '' }
  };
  panel.el = { querySelector: (selector) => controls[selector] };
  panel.nodes = [];
  panel.wires = [];
  panel.selectedNodeIds = new Set();
  panel.editStack = [];
  panel.commitHistory = () => {};
  panel.stopClock = () => {};
  panel.resetTrace = () => {};
  panel.updateEditControls = () => {};
  panel.persistTestBenches = () => {};
  panel.render = () => {};
  panel.runSimulation = () => {};
  panel.setStatus = (message) => { panel.status = message; };

  await panel.importDesign({
    text: async () => JSON.stringify({
      format: 'electro-lab-chip-design',
      version: 4,
      name: 'Labeled logic',
      components: [
        { id: 'input', type: 'INPUT', label: 'A', x: 0, y: 0 },
        { id: 'not', type: 'NOT', label: 'Invert', x: 100, y: 0 },
        { id: 'output', type: 'OUTPUT', label: 'Y', x: 200, y: 0 }
      ],
      wires: [
        { from: 'input', output: 0, to: 'not', input: 0, label: 'signal_a', route: 'orthogonal', probe: true },
        { from: 'not', output: 0, to: 'output', input: 0 }
      ],
      testBench: { name: 'Empty', steps: [] }
    })
  });

  assert.equal(panel.status, 'Imported 3 components and 2 signal nets.');
  assert.equal(panel.wires[0].label, 'signal_a');
  assert.equal(panel.wires[0].route, 'orthogonal');
  assert.equal(panel.wires[0].probe, true);
  assert.equal(panel.wires[1].route, undefined);
});

test('exhaustive test generation covers each scalar input combination', () => {
  const panel = createPanel([
    { id: 'a', type: 'INPUT', label: 'A', value: false },
    { id: 'b', type: 'INPUT', label: 'B', value: false },
    { id: 'xor', type: 'XOR', label: 'XOR' },
    { id: 'out', type: 'OUTPUT', label: 'Y' }
  ], [
    { from: 'a', output: 0, to: 'xor', input: 0 },
    { from: 'b', output: 0, to: 'xor', input: 1 },
    { from: 'xor', output: 0, to: 'out', input: 0 }
  ]);
  panel.testBench = { name: 'XOR checks', steps: [] };
  panel.el = { querySelector: () => ({ value: 'XOR checks' }) };
  panel.persistTestBenches = () => {};
  panel.renderTestBenchSteps = () => {};
  panel.setStatus = (message) => { panel.status = message; };

  assert.equal(panel.generateTestVectors('exhaustive'), 4);
  assert.deepEqual(panel.testBench.steps.map((step) => [step.inputs.a, step.inputs.b, step.expected.out]), [
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, false]
  ]);
  assert.match(panel.status, /Added 4 exhaustive test vectors/);
});

test('exhaustive generation refuses vectors that exceed the supported bit limit', () => {
  const nodes = Array.from({ length: 11 }, (_, index) => ({
    id: `i${index}`, type: 'INPUT', label: `I${index}`, value: false
  }));
  nodes.push({ id: 'out', type: 'OUTPUT', label: 'Y' });
  const panel = createPanel(nodes, []);
  panel.testBench = { name: 'Large', steps: [] };
  panel.el = { querySelector: () => ({ value: 'Large' }) };
  panel.setStatus = (message) => { panel.status = message; };

  assert.equal(panel.generateTestVectors('exhaustive'), 0);
  assert.match(panel.status, /1–10 input bits/);
});

test('VCD export encodes scalar and bus waveforms with sample timestamps', () => {
  const panel = createPanel([
    { id: 'bus', type: 'BUS_INPUT', label: 'Data bus', width: 4 },
    { id: 'invert', type: 'BUS_NOT', label: 'Invert bus', width: 4 },
    { id: 'out', type: 'BUS_OUTPUT', label: 'Result bus', width: 4 }
  ], []);
  panel.trace = [
    { outputs: [['bus', 3], ['invert', 12], ['out', 12]] },
    { outputs: [['bus', 8], ['invert', 7], ['out', 7]] }
  ];

  const vcd = panel.buildVcd();
  assert.match(vcd, /\$timescale 1ms \$end/);
  assert.match(vcd, /\$var wire 4 s0 Data_bus \$end/);
  assert.match(vcd, /#0[\s\S]*b0011 s0[\s\S]*b1100 s1[\s\S]*#1[\s\S]*b1000 s0/);
});

test('VCD export gives an actionable message when no trace is captured', () => {
  const panel = createPanel([], []);
  panel.trace = [];
  assert.throws(() => panel.buildVcd(), /Capture at least one signal transition/);
});

test('copy and paste duplicate selected components and only their internal wires', () => {
  const panel = createPanel([
    { id: 'a', type: 'INPUT', label: 'A', x: 20, y: 40 },
    { id: 'not', type: 'NOT', label: 'Inverter', x: 140, y: 60 },
    { id: 'out', type: 'OUTPUT', label: 'Y', x: 280, y: 60 }
  ], [
    { from: 'a', output: 0, to: 'not', input: 0 },
    { from: 'not', output: 0, to: 'out', input: 0 }
  ]);
  panel.selectedNodeId = 'not';
  panel.selectedNodeIds = new Set(['a', 'not']);
  panel.nodeSequence = 3;
  panel.commitHistory = () => {};
  panel.resetTrace = () => {};
  panel.render = () => {};
  panel.runSimulation = () => {};
  panel.setStatus = (message) => { panel.status = message; };

  assert.equal(panel.copySelection(), true);
  assert.equal(panel.nodeClipboard.wires.length, 1);
  assert.equal(panel.pasteClipboard(), true);
  assert.deepEqual(panel.nodes.slice(3).map(({ id, x, y }) => ({ id, x, y })), [
    { id: 'u4', x: 60, y: 80 },
    { id: 'u5', x: 180, y: 100 }
  ]);
  assert.deepEqual(panel.wires[2], { from: 'u4', output: 0, to: 'u5', input: 0 });
  assert.deepEqual([...panel.selectedNodeIds], ['u4', 'u5']);
});

test('probed wires focus the waveform list to probed signals only', () => {
  const panel = createPanel([
    { id: 'a', type: 'INPUT', label: 'A' },
    { id: 'not', type: 'NOT', label: 'Inverter' },
    { id: 'out', type: 'OUTPUT', label: 'Y' }
  ], [
    { from: 'a', output: 0, to: 'not', input: 0 },
    { from: 'not', output: 0, to: 'out', input: 0, label: 'result', probe: true }
  ]);
  panel.trace = [{ outputs: [['a', true], ['not', false], ['out', false]] }];

  const waveforms = panel.renderWaveforms();
  assert.match(waveforms, /result/);
  assert.doesNotMatch(waveforms, />A</);
  assert.match(waveforms, /1 probed connection/);
});

test('unprobed waveform rendering includes output signals even when inputs come first', () => {
  const panel = createPanel([
    { id: 'clock', type: 'CLOCK', label: 'CLK' },
    { id: 'state', type: 'DFF', label: 'STATE', q: false },
    { id: 'out', type: 'OUTPUT', label: 'Y' }
  ], []);
  panel.trace = [{ outputs: [['clock', false], ['state', false], ['out', false]] }];

  const waveforms = panel.renderWaveforms();
  assert.match(waveforms, /CLK/);
  assert.match(waveforms, /STATE/);
  assert.match(waveforms, />Y</);
  assert.match(waveforms, /<svg/);
});

test('undo snapshots restore the project identity and its test bench', () => {
  const controls = {
    '[data-chip-name]': { value: '' },
    '[data-chip-title]': { textContent: '' },
    '.chip-canvas': {
      viewBox: '0 0 1200 740',
      getAttribute() { return this.viewBox; },
      setAttribute(_name, value) { this.viewBox = value; }
    }
  };
  const panel = createPanel([{ id: 'a', type: 'INPUT', label: 'A', x: 20, y: 30 }], []);
  panel.el = { querySelector: (selector) => controls[selector] };
  panel.selectedNodeIds = new Set();
  panel.selectedNodeId = null;
  panel.selectedWireIndex = null;
  panel.chipName = 'Original';
  panel.designId = 'original-project';
  panel.testBench = { name: 'Known cases', steps: [{ inputs: { a: true }, expected: {}, clock: false }] };
  panel.stopClock = () => {};
  panel.resetTrace = () => {};
  panel.persistTestBenches = () => {};
  panel.runSimulation = () => {};
  const snapshot = panel.snapshotDesign();
  panel.chipName = 'Changed';
  panel.designId = 'different-project';
  panel.testBench = { name: 'Empty', steps: [] };

  panel.restoreSnapshot(snapshot);

  assert.equal(panel.chipName, 'Original');
  assert.equal(panel.designId, 'original-project');
  assert.equal(panel.testBench.name, 'Known cases');
  assert.deepEqual(panel.testBench.steps[0].inputs, { a: true });
});

test('test bench results render expected and actual values in a pass/fail table', () => {
  const panel = createPanel([
    { id: 'a', type: 'INPUT', label: 'A' },
    { id: 'out', type: 'OUTPUT', label: 'Y' }
  ], []);
  const results = { innerHTML: '' };
  panel.el = { querySelector: (selector) => selector === '[data-testbench-results]' ? results : null };
  panel.testBench = { name: 'Checks', steps: [
    { inputs: { a: true }, expected: { out: true }, actual: { out: true }, result: true },
    { inputs: { a: false }, expected: { out: true }, actual: { out: false }, result: false }
  ] };

  panel.renderTestBenchResults();

  assert.match(results.innerHTML, /<th>Expected<\/th><th>Actual<\/th><th>Result<\/th>/);
  assert.match(results.innerHTML, /A=HIGH \(1\)/);
  assert.match(results.innerHTML, /Y=HIGH \(1\).*Y=LOW \(0\)/);
  assert.match(results.innerHTML, /class="passed">PASS/);
  assert.match(results.innerHTML, /class="failed">FAIL/);
});

test('learning challenges load as unwired starters instead of solved circuits', () => {
  for (let lessonIndex = 0; lessonIndex < 5; lessonIndex += 1) {
    const controls = {
      '[data-chip-name]': { value: '' },
      '[data-chip-title]': { textContent: '' },
      '[data-chip-learning-modal]': { hidden: false }
    };
    const panel = createPanel([], []);
    panel.el = { querySelector: (selector) => controls[selector] };
    panel.learningLessonIndex = lessonIndex;
    panel.learningProgress = [];
    panel.selectedNodeIds = new Set();
    panel.commitHistory = () => {};
    panel.stopClock = () => {};
    panel.resetTrace = () => {};
    panel.render = () => {};
    panel.runSimulation = () => {};
    panel.setTab = () => {};
    panel.setStatus = () => {};

    panel.loadLearningLesson();

    assert.ok(panel.nodes.length > 0, `lesson ${lessonIndex + 1} should provide starter components`);
    assert.equal(panel.wires.length, 0, `lesson ${lessonIndex + 1} should require wiring`);
    assert.equal(controls['[data-chip-learning-modal]'].hidden, true);
  }
});

test('one-hot state machine advances on its guard and holds when no transition is active', () => {
  const panel = createPanel([], []);
  const controls = {
    '[data-chip-name]': { value: '' },
    '[data-chip-title]': { textContent: '' }
  };
  panel.el = { querySelector: (selector) => controls[selector] };
  panel.nodeSequence = 0;
  panel.chipName = 'FSM';
  panel.selectedNodeIds = new Set();
  panel.selectedNodeId = null;
  panel.selectedWireIndex = null;
  panel.clockEdgeLog = [];
  panel.clockEdgeCount = 0;
  panel.commitHistory = () => {};
  panel.stopClock = () => {};
  panel.resetTrace = () => {};
  panel.setGroupSelectionMode = () => {};
  panel.fitCanvas = () => {};
  panel.render = () => {};
  panel.runSimulation = () => {};
  panel.setTab = () => {};
  panel.setStatus = () => {};
  panel.buildStateMachine(
    ['IDLE', 'RUN'],
    [
      { from: 'IDLE', condition: 'GO', to: 'RUN' },
      { from: 'RUN', condition: '!GO', to: 'IDLE' }
    ],
    'IDLE'
  );
  const idle = panel.nodes.find((node) => node.label === 'IDLE');
  const running = panel.nodes.find((node) => node.label === 'RUN');
  const go = panel.nodes.find((node) => node.label === 'GO');
  const clock = panel.nodes.find((node) => node.type === 'CLOCK');

  assert.equal(panel.evaluate().outputs.get(idle.id), true);
  assert.equal(panel.evaluate().outputs.get(running.id), false);
  go.value = true;
  clock.value = true;
  panel.captureClockEdge();
  assert.equal(panel.evaluate().outputs.get(idle.id), false);
  assert.equal(panel.evaluate().outputs.get(running.id), true);
  assert.equal(panel.clockEdgeCount, 1);
  go.value = true;
  clock.value = false;
  panel.captureClockEdge();
  assert.equal(panel.evaluate().outputs.get(running.id), true);
  go.value = false;
  clock.value = true;
  panel.captureClockEdge();
  assert.equal(panel.evaluate().outputs.get(idle.id), true);
});

test('saved projects include the current schematic and test bench', () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value))
  } });
  try {
    const panel = createPanel(
      [{ id: 'input', type: 'INPUT', label: 'A', x: 20, y: 30 }],
      []
    );
    const controls = {
      '[data-project-name]': { value: 'Stored example' },
      '[data-chip-name]': { value: '' },
      '[data-chip-title]': { textContent: '' }
    };
    panel.el = { querySelector: (selector) => controls[selector] };
    panel.chipName = 'Untitled';
    panel.designId = 'project-test';
    panel.testBench = { name: 'Basic tests', steps: [{ inputs: { input: true }, expected: {}, clock: false }] };
    panel.renderProjects = () => {};
    panel.setStatus = (message) => { panel.status = message; };

    assert.equal(panel.saveProject(), true);
    const projects = JSON.parse(values.get('electroDesigner.chipLab.projects'));
    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, 'Stored example');
    assert.equal(projects[0].design.components[0].id, 'input');
    assert.equal(projects[0].design.testBench.steps.length, 1);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
});
