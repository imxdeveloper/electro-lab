import test from 'node:test';
import assert from 'node:assert/strict';
import { MaskLabPanel } from '../src/ui/MaskLabPanel.js';
import { DEFAULT_MASK_TECHNOLOGY_ID } from '../src/data/MaskTechnologyProfiles.js';

const createPanel = (width = 16, height = 16) => {
  const panel = Object.create(MaskLabPanel.prototype);
  panel.pixelSizeNm = 10;
  panel.gridWidth = width;
  panel.gridHeight = height;
  panel.name = 'MaskLab';
  panel.technologyId = DEFAULT_MASK_TECHNOLOGY_ID;
  panel.profileLayouts = panel.createProfileLayouts(width, height);
  panel.layerMasks = panel.profileLayouts[panel.technologyId].layers;
  panel.activeLayerId = panel.profileLayouts[panel.technologyId].activeLayerId;
  panel.el = { querySelector: () => null };
  panel.brushMode = 'draw';
  panel.mask = panel.layerMasks[panel.activeLayerId];
  panel.learningProgress = [];
  panel.learningStats = {};
  panel.learningLessonIndex = 0;
  panel.learningHintCount = 0;
  panel.learningResult = '';
  panel.activeTrainingLessonId = null;
  panel.learningPassed = false;
  panel.trainingSessionSnapshot = null;
  panel.saveState = () => true;
  return panel;
};

test('analyzeChipLayout extracts real physical dimensions, layer data, and partitions functional sections', () => {
  const panel = createPanel(64, 64);
  const samplePreview = {
    topName: '8_bit_synchronous_counter',
    libraryName: 'SKY130_HD',
    pdk: 'sky130',
    dbuNm: 1.0,
    width: 60000,
    height: 50000,
    renderedShapes: 1420,
    bounds: { minX: 0, minY: 0, maxX: 60000, maxY: 50000 },
    layers: [
      { id: '68/20', layer: 68, datatype: 20, name: 'met1', role: 'routing', color: '#1966d2', shapes: 520, bounds: { minX: 0, minY: 0, maxX: 60000, maxY: 50000 } },
      { id: '69/20', layer: 69, datatype: 20, name: 'met2', role: 'routing', color: '#8a2be2', shapes: 340, bounds: { minX: 0, minY: 0, maxX: 60000, maxY: 50000 } },
      { id: '66/20', layer: 66, datatype: 20, name: 'poly', role: 'gate', color: '#e63946', shapes: 410, bounds: { minX: 2000, minY: 5000, maxX: 58000, maxY: 45000 } }
    ],
    texts: [
      { string: 'clk', points: [[5000, 25000]] },
      { string: 'rst', points: [[5000, 20000]] },
      { string: 'Q0', points: [[10000, 50000]] },
      { string: 'Q1', points: [[20000, 50000]] },
      { string: 'Q2', points: [[30000, 50000]] },
      { string: 'Q3', points: [[40000, 50000]] },
      { string: 'Q4', points: [[50000, 50000]] }
    ],
    warnings: []
  };

  const analysis = panel.analyzeChipLayout(samplePreview, 'counter.gds');

  // Verify identity and telemetry
  assert.equal(analysis.architecture, '8-Bit Synchronous Counter');
  assert.equal(analysis.pdkLabel, 'SkyWater 130 nm CMOS');
  assert.equal(analysis.widthUm, 60);
  assert.equal(analysis.heightUm, 50);
  assert.equal(analysis.dieAreaUm2, 3000);
  assert.equal(analysis.aspectRatio, '1.20');
  assert.equal(analysis.totalShapes, 1420);

  // Verify outputs and detected signals
  assert.ok(analysis.outputs.length >= 5);
  assert.ok(analysis.detectedClocks.includes('clk'));
  assert.ok(analysis.detectedResets.includes('rst'));

  // Verify functional groups partitioning
  assert.equal(analysis.groups.length, 6);
  const outBuf = analysis.groups[0];
  assert.equal(outBuf.number, 1);
  assert.equal(outBuf.name, 'Output Buffer');
  assert.ok(Number(outBuf.boundsUm.width) > 0);
  assert.ok(Number(outBuf.boundsUm.height) > 0);
  assert.ok(Number(outBuf.boundsUm.area) > 0);
  assert.ok(Number(outBuf.density) >= 0);
  assert.ok(outBuf.definition.length > 20);

  const dff = analysis.groups[4];
  assert.equal(dff.number, 5);
  assert.match(dff.name, /Flip-Flops|Storage/);
  assert.ok(Number(dff.percentArea) > 0);
});

test('analyzeChipLayout adapts to ALU architecture and non-counter layouts', () => {
  const panel = createPanel(64, 64);
  const aluPreview = {
    topName: 'alu_32bit_core',
    libraryName: 'GF180_MCU',
    pdk: 'gf180mcu',
    dbuNm: 5.0,
    width: 20000,
    height: 20000,
    renderedShapes: 850,
    bounds: { minX: 0, minY: 0, maxX: 20000, maxY: 20000 },
    layers: [
      { id: '1/0', layer: 1, datatype: 0, name: 'metal1', role: 'routing', color: '#1966d2', shapes: 500, bounds: { minX: 0, minY: 0, maxX: 20000, maxY: 20000 } }
    ],
    texts: [],
    warnings: []
  };

  const analysis = panel.analyzeChipLayout(aluPreview, 'alu.gds');

  assert.equal(analysis.architecture, 'Arithmetic Logic Unit (ALU)');
  assert.equal(analysis.pdkLabel, 'GF 180 nm MCU');
  assert.equal(analysis.widthUm, 100);
  assert.equal(analysis.heightUm, 100);
  assert.equal(analysis.dieAreaUm2, 10000);

  // Checks that section 2 & 3 adapt to ALU definitions
  assert.match(analysis.groups[1].name, /ALU Logic|Function Select/);
  assert.match(analysis.groups[2].name, /Adder|Carry/);
});
