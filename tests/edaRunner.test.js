import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildOpenLaneConfig, collectJobArtifacts, parseModuleName } from '../scripts/edaRunner.js';

test('reads the generated top-level Verilog module name', () => {
  assert.equal(parseModuleName('module sample_chip(a, y); input a; output y; assign y=a; endmodule'), 'sample_chip');
  assert.throws(() => parseModuleName('module a(); endmodule module b(); endmodule'), /one complete Verilog module/);
});

test('builds an OpenLane config using the selected PDK and mm die envelope', () => {
  assert.deepEqual(buildOpenLaneConfig({ designName: 'logic_chip', pdk: 'sky130A', widthMm: 1.2, heightMm: 0.8 }), {
    DESIGN_NAME: 'logic_chip', VERILOG_FILES: ['dir::design.v'], PDK: 'sky130A', FP_SIZING: 'absolute', CLOCK_PERIOD: 10, DIE_AREA: [0, 0, 1200, 800]
  });
});

test('rejects unsupported PDKs, invalid module names, and unsafe die sizes', () => {
  assert.throws(() => buildOpenLaneConfig({ designName: 'chip', pdk: 'madeUp' }), /Choose SKY130A/);
  assert.throws(() => buildOpenLaneConfig({ designName: '../chip', pdk: 'sky130A' }), /valid Verilog module identifier/);
  assert.throws(() => buildOpenLaneConfig({ designName: 'chip', pdk: 'sky130A', widthMm: 0, heightMm: 1 }), /Die dimensions/);
});

test('exposes only the final GDS and useful signoff reports from an OpenLane run', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'eda-runner-test-'));
  try {
    const run = path.join(folder, 'runs', 'RUN_fixture');
    await mkdir(path.join(run, 'final', 'gds'), { recursive: true });
    await mkdir(path.join(run, 'final', 'reports'), { recursive: true });
    await mkdir(path.join(run, '56-magic-streamout'), { recursive: true });
    await mkdir(path.join(run, '06-yosys-synthesis'), { recursive: true });
    await writeFile(path.join(run, 'final', 'gds', 'chip.gds'), 'gds');
    await writeFile(path.join(run, '56-magic-streamout', 'chip.magic.gds'), 'intermediate');
    await writeFile(path.join(run, 'final', 'reports', 'drc_violations.magic.rpt'), 'COUNT: 0');
    await writeFile(path.join(run, 'final', 'reports', 'lvs.netgen.rpt'), 'Passed');
    await writeFile(path.join(run, 'flow.log'), 'complete');
    await writeFile(path.join(run, '06-yosys-synthesis', 'metrics.csv'), 'not a user report');
    const job = { id: 'test-job', folder, artifacts: [] };
    await collectJobArtifacts(job, 0);
    assert.equal(job.status, 'succeeded');
    assert.equal(job.artifacts.filter((artifact) => artifact.kind === 'gds').length, 1);
    assert.deepEqual(job.artifacts.map((artifact) => artifact.name).sort(), ['chip.gds', 'drc_violations.magic.rpt', 'flow.log', 'lvs.netgen.rpt']);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
