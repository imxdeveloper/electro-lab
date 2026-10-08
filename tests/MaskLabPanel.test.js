import test from 'node:test';
import assert from 'node:assert/strict';
import { MaskLabPanel, MASK_LESSONS } from '../src/ui/MaskLabPanel.js';
import { DEFAULT_MASK_TECHNOLOGY_ID, MASK_TECHNOLOGIES } from '../src/data/MaskTechnologyProfiles.js';

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
  panel.saveLearningProgress = () => {};
  panel.saveLearningStats = () => {};
  panel.renderLearningPath = () => {};
  panel.renderTechnologyProfile = () => {};
  panel.renderGrid = () => {};
  panel.updateSummary = () => {};
  return panel;
};

test('mask panel reports 10nm pixel dimensions and total cell count', () => {
  const panel = createPanel(64, 64);
  const summary = panel.getSummary();

  assert.equal(summary.widthNm, 640);
  assert.equal(summary.heightNm, 640);
  assert.equal(summary.totalPixels, 4096);
  assert.equal(summary.activePixels, 0);
});

test('mask drawing, clear, fill, and invert update the grid state', () => {
  const panel = createPanel(8, 8);
  panel.paintCellAt(0, 0, true);
  panel.paintCellAt(1, 1, true);

  assert.equal(panel.mask[0][0], true);
  assert.equal(panel.mask[1][1], true);

  panel.invertMask();
  assert.equal(panel.mask[0][0], false);
  assert.equal(panel.mask[1][1], false);

  panel.fillMask();
  assert.equal(panel.mask.flat().every(Boolean), true);

  panel.clearMask();
  assert.equal(panel.mask.flat().every((value) => value === false), true);
});

test('resizing the grid preserves pixels at their existing coordinates', () => {
  const panel = createPanel(16, 16);
  panel.paintCellAt(3, 4, true);
  panel.paintCellAt(14, 15, true);

  panel.resizeGrid(24, 20);

  assert.equal(panel.mask[4][3], true);
  assert.equal(panel.mask[15][14], true);
  assert.equal(panel.getSummary().activePixels, 2);

  panel.resizeGrid(8, 8);

  assert.equal(panel.mask[4][3], true);
  assert.equal(panel.getSummary().activePixels, 1);
});

test('technology profiles keep their layers isolated and restore the prior layer', () => {
  const panel = createPanel(16, 16);
  const genericLayer = panel.activeLayerId;
  panel.paintCellAt(2, 3, true);
  panel.selectLayer('gate');
  panel.paintCellAt(7, 8, true);

  panel.selectTechnology('sky130');
  assert.equal(panel.activeLayerId, MASK_TECHNOLOGIES[0].layers[0].id);
  panel.selectLayer('met1');
  panel.paintCellAt(4, 5, true);
  panel.selectTechnology(DEFAULT_MASK_TECHNOLOGY_ID);

  assert.equal(panel.activeLayerId, 'gate');
  assert.equal(panel.mask[8][7], true);
  assert.equal(panel.mask[3][2], false);
  panel.selectLayer(genericLayer);
  assert.equal(panel.mask[3][2], true);
  assert.equal(panel.mask[8][7], false);
});

test('technology profile export/import preserves each layer independently', () => {
  const original = createPanel(16, 16);
  original.selectTechnology('gf180mcu');
  original.selectLayer('metal1');
  original.paintCellAt(9, 10, true);
  original.selectLayer('comp');
  original.paintCellAt(4, 5, true);

  const restored = createPanel();
  assert.equal(restored.importMask(original.exportMask()), true);
  assert.equal(restored.technologyId, 'gf180mcu');
  assert.equal(restored.activeLayerId, 'comp');
  assert.equal(restored.mask[5][4], true);
  restored.selectLayer('metal1');
  assert.equal(restored.mask[10][9], true);
  assert.equal(restored.mask[5][4], false);
});

test('Chip Lab schematic rasterization is blocked in foundry profiles', () => {
  const panel = createPanel();
  panel.technologyId = 'sky130';
  panel.editor = { chipLabPanel: { nodes: [{ id: 'gate', x: 0, y: 0 }] } };

  assert.equal(panel.autoFillFromChipDesign(), false);
});

test('export and import preserve the mask layout and dimensions', () => {
  const original = createPanel(12, 10);
  original.paintCellAt(2, 3, true);
  original.paintCellAt(9, 8, true);

  const payload = original.exportMask();
  const restored = createPanel(12, 10);
  const imported = restored.importMask(payload);
  const summary = restored.getSummary();

  assert.equal(imported, true);
  assert.equal(restored.gridWidth, 12);
  assert.equal(restored.gridHeight, 10);
  assert.equal(summary.activePixels, 2);
  assert.equal(restored.mask[3][2], true);
  assert.equal(restored.mask[8][9], true);
});

test('training lessons match their stated geometry and pitch', () => {
  const [single, linePair, frame, array] = MASK_LESSONS;

  assert.deepEqual(single.cells, [[32, 32]]);
  assert.equal(linePair.cells.length, 10);
  assert.equal(new Set(linePair.cells.map(([, y]) => y)).size, 2);
  assert.equal(Math.abs(linePair.cells[5][1] - linePair.cells[0][1]), 3);
  assert.equal(frame.cells.length, 20);
  assert.equal(array.cells.length, 16);
  assert.equal(new Set(array.cells.map(([x]) => x)).size, 4);
  assert.equal(new Set(array.cells.map(([, y]) => y)).size, 4);
  assert.equal(array.cells[1][0] - array.cells[0][0], 2);
});

test('training checks reject extra pixels and wrong grid dimensions', () => {
  const panel = createPanel(64, 64);
  const lesson = MASK_LESSONS[0];
  panel.paintCellAt(32, 32, true);
  panel.paintCellAt(33, 32, true);

  assert.equal(panel.evaluateTrainingMask(lesson).matches, false);
  assert.equal(panel.evaluateTrainingMask(lesson).extras.length, 1);

  panel.mask[32][33] = false;
  panel.gridWidth = 32;
  assert.equal(panel.evaluateTrainingMask(lesson).matches, false);
});

test('training challenge restores the user mask, name, and dimensions when exited', () => {
  const panel = createPanel(12, 10);
  panel.name = 'My mask';
  panel.paintCellAt(3, 4, true);
  panel.trainingSessionSnapshot = panel.exportMask();

  panel.resizeGrid(64, 64);
  panel.name = 'Mask training';
  panel.mask[32][32] = true;
  panel.restoreTrainingSession();

  assert.equal(panel.gridWidth, 12);
  assert.equal(panel.gridHeight, 10);
  assert.equal(panel.name, 'My mask');
  assert.equal(panel.mask[4][3], true);
  assert.equal(panel.mask[32], undefined);
});

test('checking a training challenge requires the exact target mask', () => {
  const panel = createPanel(64, 64);
  panel.activeTrainingLessonId = MASK_LESSONS[0].id;
  panel.mask[32][32] = true;
  panel.mask[31][32] = true;

  panel.checkTrainingLesson();

  assert.equal(panel.learningPassed, false);
  assert.deepEqual(panel.learningProgress, []);
  assert.match(panel.learningResult, /1 extra/);
});

test('passing a training challenge unlocks next lesson without changing the mask', () => {
  const panel = createPanel(64, 64);
  panel.activeTrainingLessonId = MASK_LESSONS[0].id;
  panel.mask[32][32] = true;

  panel.checkTrainingLesson();

  assert.equal(panel.learningPassed, true);
  assert.deepEqual(panel.learningProgress, [MASK_LESSONS[0].id]);
  assert.equal(panel.learningStats[MASK_LESSONS[0].id].bestScore, 100);
  assert.equal(panel.mask[32][32], true);
});

test('auto-fill rasterizes a Chip Lab layout and retains the power check metadata', () => {
  const panel = createPanel(64, 64);
  panel.editor = {
    chipLabPanel: {
      chipName: 'Powered inverter',
      nodes: [
        { id: 'vcc', type: 'VPLUS', label: 'V+', x: 0, y: 0 },
        { id: 'gate', type: 'AND', label: 'AND gate', x: 250, y: 120 },
        { id: 'gnd', type: 'GROUND', label: 'GND', x: 0, y: 240 },
        { id: 'out', type: 'OUTPUT', label: 'Y', x: 500, y: 120 }
      ],
      wires: [
        { from: 'vcc', output: 0, to: 'gate', input: 0, route: 'orthogonal' },
        { from: 'gnd', output: 0, to: 'gate', input: 1, route: 'curved' },
        { from: 'gate', output: 0, to: 'out', input: 0, route: 'straight' }
      ],
      nodeHeight: () => 72,
      portPosition: (node, direction) => ({
        x: direction === 'out' ? node.x + 150 : node.x,
        y: node.y + 36
      }),
      inspectPowerRails: () => ({ ok: true, connectedVPlus: 1, totalVPlus: 1, connectedGround: 1, totalGround: 1, shortedPins: [], issues: [] })
    }
  };

  assert.equal(panel.autoFillFromChipDesign(), true);
  assert.ok(panel.mask.flat().some(Boolean));
  assert.equal(panel.name, 'Powered inverter mask');
  assert.equal(panel.sourceDesign.componentCount, 4);
  assert.equal(panel.sourceDesign.wireCount, 3);
  assert.equal(panel.exportMask().sourceDesign.powerCheck.ok, true);
});
