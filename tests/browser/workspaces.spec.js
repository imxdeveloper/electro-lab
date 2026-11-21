import { expect, test } from '@playwright/test';
import { createCounterGds, createLegacySampleGds, createSampleGds } from '../helpers/gdsFixture.js';
import { createSampleGlb } from '../helpers/gltfFixture.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the Add menu places a self-running animated counter chip', async ({ page }) => {
  await page.keyboard.press('Shift+A');
  await page.locator('.add-popup-item[data-type="animated-chip"]').click();

  await expect(page.locator('.outliner-item-name', { hasText: 'Animated Counter Chip' })).toBeVisible();

  // The chip free-runs: the readout counter advances without any input.
  const readValue = () => page.evaluate(() => {
    const chip = window.electroDesignerEditor?.sceneManager.objectsList
      .find((object) => object.userData.animatedChip);
    return chip ? { value: chip.userData.counterValue, binary: chip.userData.counterBinary, ticks: chip.userData.clockTicks } : null;
  });
  const first = await readValue();
  await expect.poll(readValue, { timeout: 8000 }).not.toEqual(first);

  // It is removed with the rest of the scene objects.
  await page.keyboard.press('x');
  await expect.poll(readValue).toBeNull();
});

test('Mask Lab supports keyboard pixel navigation and painting', async ({ page }) => {
  const initiallyLoaded = await page.evaluate(() =>
    performance.getEntriesByType('resource').map(({ name }) => name)
  );
  expect(initiallyLoaded.some((url) => url.includes('MaskLabPanel'))).toBe(false);

  await page.locator('#workspace-mode-select').selectOption('masks');
  const grid = page.locator('[data-mask-grid]');
  await expect(grid).toBeVisible();
  await expect.poll(async () => page.evaluate(() =>
    performance.getEntriesByType('resource').some(({ name }) => name.includes('MaskLabPanel'))
  )).toBe(true);
  await expect(grid.locator('.mask-cell')).toHaveCount(4096);

  const firstCell = grid.locator('[data-x="0"][data-y="0"]');
  await firstCell.focus();
  await firstCell.press('ArrowRight');

  const nextCell = grid.locator('[data-x="1"][data-y="0"]');
  await expect(nextCell).toBeFocused();
  await nextCell.press('Space');
  await expect(nextCell).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-mask-summary]')).toHaveText('1 / 4096 pixels lit');
});

test('technology tabs maintain isolated layers and disclose profile limitations', async ({ page }) => {
  await page.locator('#workspace-mode-select').selectOption('masks');
  const tabs = page.locator('[data-mask-technology]');
  await expect(tabs).toHaveCount(3);
  await expect(page.locator('[data-mask-technology="generic"]')).toHaveAttribute('aria-selected', 'true');

  await page.locator('[data-mask-technology="sky130"]').click();
  await expect(page.locator('[data-mask-profile-notice]')).toContainText('SkyWater SKY130');
  await expect(page.locator('[data-mask-profile-notice]')).toContainText('No DRC, LVS');
  await expect(page.locator('[data-mask-action="auto-fill-chip"]')).toBeDisabled();
  await page.locator('[data-mask-layer="poly"]').click();
  const skyCell = page.locator('[data-mask-grid] [data-x="2"][data-y="3"]');
  await skyCell.click();
  await expect(skyCell).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-mask-technology="gf180mcu"]').click();
  await expect(page.locator('[data-mask-profile-notice]')).toContainText('experimental preview');
  await page.locator('[data-mask-layer="metal1"]').click();
  await expect(page.locator('[data-mask-layer="metal1"]')).toHaveAttribute('title', /GDS 34\/0 · Mask 80 · Chrome/);
  const gfCell = page.locator('[data-mask-grid] [data-x="2"][data-y="3"]');
  await expect(gfCell).toHaveAttribute('aria-pressed', 'false');
  await gfCell.click();

  await page.locator('[data-mask-technology="sky130"]').click();
  await page.locator('[data-mask-layer="poly"]').click();
  await expect(page.locator('[data-mask-grid] [data-x="2"][data-y="3"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-mask-technology="gf180mcu"]').click();
  await page.locator('[data-mask-layer="metal1"]').click();
  await expect(page.locator('[data-mask-grid] [data-x="2"][data-y="3"]')).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await page.locator('#workspace-mode-select').selectOption('masks');
  await expect(page.locator('[data-mask-technology="gf180mcu"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-mask-grid] [data-x="2"][data-y="3"]')).toHaveAttribute('aria-pressed', 'true');
});

test('Chip Lab designs rasterize into Mask Lab with source and power-check details', async ({ page }) => {
  const initiallyLoaded = await page.evaluate(() =>
    performance.getEntriesByType('resource').map(({ name }) => name)
  );
  expect(initiallyLoaded.some((url) => url.includes('ChipLabPanel'))).toBe(false);

  await page.locator('#workspace-mode-select').selectOption('chips');
  await expect(page.locator('.chip-lab')).toBeVisible();
  await expect.poll(async () => page.evaluate(() =>
    performance.getEntriesByType('resource').some(({ name }) => name.includes('ChipLabPanel'))
  )).toBe(true);

  await page.locator('[data-chip-add="VPLUS"]').click();
  await page.locator('[data-chip-add="AND"]').click();
  await page.locator('[data-chip-add="GROUND"]').click();
  await expect(page.locator('[data-chip-node]')).toHaveCount(3);

  await page.locator('#workspace-mode-select').selectOption('masks');
  await page.locator('[data-mask-action="auto-fill-chip"]').click();

  await expect(page.locator('[data-mask-source]')).toHaveText('Untitled Logic Chip');
  await expect(page.locator('[data-mask-count]')).not.toHaveText('0');
  await expect(page.locator('[data-mask-power-status]')).toHaveText('Review wiring');
  await expect(page.locator('[data-mask-source-details]')).toContainText('3 components');
});

test('Chip Lab Generate Mask switches labs and keeps mask pixels when resizing', async ({ page }) => {
  await page.locator('#workspace-mode-select').selectOption('chips');
  await page.locator('[data-chip-add="VPLUS"]').click();
  await page.locator('[data-chip-action="generate-mask"]').click();

  const setup = page.locator('[data-chip-mask-setup-modal]');
  await expect(setup).toBeVisible();
  await expect(setup.locator('[data-chip-mask-profile-summary]')).toContainText('conceptual editor layers');
  await setup.locator('[data-chip-action="confirm-mask-setup"]').click();

  await expect(page.locator('#workspace-mode-select')).toHaveValue('masks');
  await expect(page.locator('[data-mask-source]')).toHaveText('Untitled Logic Chip');
  await expect(page.locator('[data-mask-count]')).not.toHaveText('0');

  const maskCell = page.locator('[data-mask-grid] [data-x="20"][data-y="20"]');
  await maskCell.click();
  await expect(maskCell).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-mask-grid-size]').fill('80');
  await expect(page.locator('[data-mask-grid] .mask-cell')).toHaveCount(6400);
  await expect(page.locator('[data-mask-grid] [data-x="20"][data-y="20"]')).toHaveAttribute('aria-pressed', 'true');
});

test('Mask Lab reports storage failures and offers export recovery', async ({ page }) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('electroDesigner.maskLab')) {
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await page.reload();
  await page.locator('#workspace-mode-select').selectOption('masks');
  await page.locator('[data-mask-grid] [data-x="0"][data-y="0"]').click();

  await expect(page.locator('[data-mask-status]')).toContainText('Autosave failed');
  await expect(page.locator('[data-mask-status]')).toContainText('Export the mask to keep a copy');
});

test('the Add menu opens Chip View, which imports a GDS layout for viewing only', async ({ page }) => {
  const initiallyLoaded = await page.evaluate(() =>
    performance.getEntriesByType('resource').map(({ name }) => name)
  );
  expect(initiallyLoaded.some((url) => url.includes('ChipViewPanel'))).toBe(false);

  await page.keyboard.press('Shift+A');
  await page.locator('.add-popup-item[data-type="chipview"]').click();

  await expect(page.locator('#workspace-mode-select')).toHaveValue('chipview');
  await expect(page.locator('.chip-view-panel')).toBeVisible();
  await expect(page.locator('[data-chipview-status]')).toHaveText('No chip imported yet.');

  await page.locator('[data-chipview-input]').setInputFiles({
    name: 'demo-layout.gds',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(createSampleGds())
  });

  const model = page.locator('[data-chipview-model]');
  await expect(model).toHaveCount(1);
  await expect(model).toContainText('demo-layout');
  await expect(model).toContainText('GDSII');
  await expect(model).toContainText('3 layer(s)');
  await expect(page.locator('[data-chipview-status]')).toContainText('imported for viewing');
  await expect(model.locator('.chip-view-analysis')).toContainText('Standard-Cell ASIC Core');
  const sections = model.locator('[data-chipview-section]');
  await expect(sections).toHaveCount(6);
  await expect(sections.first()).toHaveAttribute('aria-pressed', 'false');
  await sections.first().click();
  await expect(sections.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(sections.first()).toHaveClass(/active/);

  // Chip View stays read-only: clicking the imported geometry selects nothing.
  const viewport = page.locator('.electroDesigner-viewport');
  await viewport.click({ position: { x: 420, y: 320 } });
  await expect(page.locator('#hud-obj-text')).toHaveText('Collection | (None selected)');

  // Atom Lab objects stay hidden while their own workspace is not active.
  await page.locator('#workspace-mode-select').selectOption('atoms');
  await expect(page.locator('.chip-view-panel')).toBeHidden();
  await page.locator('#workspace-mode-select').selectOption('chipview');
  await expect(page.locator('.chip-view-panel')).toBeVisible();
  await expect(page.locator('[data-chipview-model]')).toHaveCount(1);

  await page.locator('[data-chipview-model-action="remove"]').click();
  await expect(page.locator('[data-chipview-model]')).toHaveCount(0);
  await expect(page.locator('[data-chipview-status]')).toHaveText('No chip imported yet.');
});

test('Chip View reads legacy-numbered layouts and offers per-layer visibility', async ({ page }) => {
  await page.locator('#workspace-mode-select').selectOption('chipview');
  await page.locator('[data-chipview-input]').setInputFiles({
    name: 'openlane-layout.gds',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(createLegacySampleGds())
  });

  const model = page.locator('[data-chipview-model]');
  await expect(model).toContainText('PDK not recognised');
  await expect(model).toContainText('3 layer(s)');
  await expect(model).toContainText('40.0 × 50.0 µm');
  // A toy library matches no PDK map, so the panel says so instead of borrowing
  // another technology's layer names.
  await expect(model.locator('.chip-view-model-warning')).toContainText('PDK is not recognised');

  const layers = page.locator('.chip-view-layer');
  await expect(layers).toHaveCount(3);
  await expect(model.locator('.chip-view-layer em')).toHaveCount(0);

  // Layers are stacked by layer number, and the stack can be flattened again.
  await expect(model.locator('[data-chipview-stack]')).toBeChecked();
  await model.locator('[data-chipview-stack]').uncheck();
  await expect(model.locator('[data-chipview-stack]')).not.toBeChecked();
  await expect(model.locator('[data-chipview-gap]')).toHaveValue('0.3');
  await model.locator('[data-chipview-gap]').fill('0.9');
  await expect(model.locator('[data-chipview-gap]')).toHaveValue('0.9');

  await model.locator('.chip-view-layers > summary').click();
  await layers.first().click();
  await expect(layers.first()).toHaveAttribute('aria-pressed', 'false');
  await model.locator('[data-chipview-layers-action="show"]').click();
  await expect(layers.first()).toHaveAttribute('aria-pressed', 'true');
  await model.locator('[data-chipview-layers-action="hide"]').click();
  await expect(layers.first()).toHaveAttribute('aria-pressed', 'false');
});

test('Chip View imports a GLB model and lists its mesh details', async ({ page }) => {
  await page.locator('#workspace-mode-select').selectOption('chipview');
  await page.locator('[data-chipview-input]').setInputFiles({
    name: 'package.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(createSampleGlb())
  });

  const model = page.locator('[data-chipview-model]');
  await expect(model).toHaveCount(1);
  await expect(model).toContainText('package');
  await expect(model).toContainText('GLB');
  await expect(model).toContainText('1 mesh(es)');
  await expect(page.locator('[data-chipview-status]')).toContainText('imported for viewing');
});

test('Chip View reports unreadable chip files instead of loading nothing silently', async ({ page }) => {
  await page.locator('#workspace-mode-select').selectOption('chipview');
  await page.locator('[data-chipview-input]').setInputFiles({
    name: 'broken.gds',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([1, 2, 3, 4, 5])
  });

  await expect(page.locator('[data-chipview-status]')).toHaveClass(/chip-view-status-error/);
  await expect(page.locator('[data-chipview-model]')).toHaveCount(0);
});

test('OpenLane is blocked until the current design has passing Test Lab vectors', async ({ page }) => {
  await page.locator('#workspace-mode-select').selectOption('chips');
  await page.locator('[data-chip-add="INPUT"]').click();
  await page.locator('[data-chip-add="NOT"]').click();
  await page.locator('[data-chip-add="OUTPUT"]').click();
  await page.evaluate(() => {
    const chipLab = window.electroDesignerEditor.chipLabPanel;
    const [input, inverter, output] = chipLab.nodes;
    chipLab.wires = [
      { from: input.id, output: 0, to: inverter.id, input: 0 },
      { from: inverter.id, output: 0, to: output.id, input: 0 }
    ];
    chipLab.render();
  });
  await page.route('**/api/eda/jobs', (route) => route.fulfill({ status: 500, body: '{"error":"Unexpected OpenLane request"}' }));
  await page.locator('[data-chip-action="asic-flow"]').click();
  await page.evaluate(() => {
    const chipLab = window.electroDesignerEditor?.chipLabPanel;
    if (!chipLab) throw new Error('Chip Lab did not load.');
    chipLab.asicRunnerReady = true;
    chipLab.el.querySelector('[data-chip-action="run-asic-flow"]').disabled = false;
  });
  await page.locator('[data-chip-action="run-asic-flow"]').click();
  await expect(page.locator('[data-chip-testbench-modal]')).toBeVisible();
  await expect(page.locator('[data-chip-asic-status]')).toContainText('at least one test vector');
});

test('a completed OpenLane job opens its GDS directly in Mask Lab', async ({ page }) => {
  await page.locator('#workspace-mode-select').selectOption('chips');
  await page.waitForSelector('.chip-lab');
  await page.route('**/api/eda/jobs/demo-job/files/gds-0', (route) => route.fulfill({
    status: 200,
    contentType: 'application/octet-stream',
    body: Buffer.from(createSampleGds())
  }));
  await page.evaluate(async () => {
    const chip = window.electroDesignerEditor.chipLabPanel;
    await chip.openAsicFlow();
    chip.renderAsicJob({
      id: 'demo-job', designName: 'demo', pdk: 'sky130A', status: 'succeeded', exitCode: 0, log: '',
      artifacts: [{ id: 'gds-0', name: 'demo.gds', kind: 'gds', url: '/api/eda/jobs/demo-job/files/gds-0' }]
    });
  });
  await page.locator('[data-chip-action="open-asic-mask"]').click();
  await expect(page.locator('#workspace-mode-select')).toHaveValue('masks');
  await expect(page.locator('[data-mask-gds-viewer]')).toBeVisible();
  await expect(page.locator('[data-mask-gds-summary]')).toContainText('demo.gds');
  await expect(page.locator('[data-mask-gds-layer-toggle]')).toHaveCount(3);
});

test('Chip View sends actual GDS layers to the vector viewer in Mask Lab', async ({ page }) => {
  await page.locator('#workspace-mode-select').selectOption('chipview');
  await page.locator('[data-chipview-input]').setInputFiles({
    name: 'layered-demo.gds',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(createSampleGds())
  });
  const model = page.locator('[data-chipview-model]');
  await expect(model).toContainText('layered-demo');
  await model.locator('[data-chipview-model-action="open-mask"]').click();

  await expect(page.locator('#workspace-mode-select')).toHaveValue('masks');
  const viewer = page.locator('[data-mask-gds-viewer]');
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('[data-mask-gds-layer-toggle]')).toHaveCount(3);
  await expect(viewer.locator('[data-mask-gds-svg] path').first()).toBeAttached();
  await expect(viewer.locator('[data-mask-gds-summary]')).toContainText('layered-demo.gds');

  const groupingToggle = viewer.locator('[data-mask-gds-grouping]');
  const groupingOverlay = viewer.locator('[data-gds-functional-groups]');
  await expect(groupingToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(viewer.locator('.mask-gds-section-group')).toHaveCount(6);
  await groupingToggle.click();
  await expect(groupingToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(groupingOverlay).toBeHidden();
  await expect(viewer.locator('.mask-gds-analysis-dashboard')).toBeHidden();
  await groupingToggle.click();
  await expect(groupingToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(groupingOverlay).toBeVisible();

  const firstLayer = viewer.locator('[data-mask-gds-layer-toggle]').first();
  const layerId = await firstLayer.getAttribute('data-mask-gds-layer-toggle');
  await firstLayer.click();
  await expect(firstLayer).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator(`#mask-gds-layer-${layerId.replace('/', '-')}`)).toBeHidden();

  const svg = viewer.locator('[data-mask-gds-svg]');
  const initialView = await svg.getAttribute('viewBox');
  await viewer.locator('[data-mask-gds-zoom="in"]').click();
  await expect.poll(() => svg.getAttribute('viewBox')).not.toBe(initialView);
});

test('Circuit Lab toolbox fits the viewport and the LED demo simulates current flow', async ({ page }) => {
  await page.locator('#workspace-mode-select').selectOption('circuits');
  const dock = page.locator('.circuit-dock');
  await expect(dock).toBeVisible();
  await expect(dock.locator('.circuit-dock-title')).toHaveText('Circuit Lab');
  await expect(dock.locator('[data-circuit-scope]')).toContainText('does not simulate GDS layouts');
  await expect(dock.getByRole('heading', { name: 'Power' })).toBeVisible();
  await expect(dock.getByRole('button', { name: 'Battery' })).toBeVisible();
  await expect(dock.getByRole('button', { name: 'Clear circuit' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await dock.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(390);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(844);

  await dock.getByRole('button', { name: 'Build LED circuit' }).click();
  const demoState = () => page.evaluate(() => {
    const objects = window.electroDesignerEditor.sceneManager.objectsList;
    const led = objects.find((object) => object.userData.circuitComponent === 'led');
    const activeWires = objects.filter((object) =>
      object.userData.circuitConnection && object.material.emissive.getHex() === 0xff4a08
    ).length;
    return { ledOn: led?.userData.ledOn, activeWires };
  });
  await expect.poll(demoState).toEqual({ ledOn: true, activeWires: 2 });

  const nonCircuitObjectCount = await page.evaluate(() =>
    window.electroDesignerEditor.sceneManager.objectsList
      .filter((object) => !object.userData.circuitComponent && !object.userData.circuitConnection).length
  );
  await dock.getByRole('button', { name: 'Clear circuit' }).click();
  await expect.poll(() => page.evaluate(() => window.electroDesignerEditor.sceneManager.objectsList
    .filter((object) => object.userData.circuitComponent || object.userData.circuitConnection).length
  )).toBe(0);
  expect(await page.evaluate(() => window.electroDesignerEditor.sceneManager.objectsList
    .filter((object) => !object.userData.circuitComponent && !object.userData.circuitConnection).length
  )).toBe(nonCircuitObjectCount);
});

test('Generate Mask creates a clearly scoped conceptual preview for the 8-bit counter', async ({ page }) => {
  await page.locator('#workspace-mode-select').selectOption('chips');
  const chipLab = page.locator('.chip-lab');
  await chipLab.locator('[data-chip-preset="counter8"]').click();
  await chipLab.locator('[data-chip-action="generate-mask"]').click();
  await chipLab.locator('[data-chip-mask-profile]').selectOption('generic');
  await chipLab.locator('[data-chip-action="confirm-mask-setup"]').click();

  const maskLab = page.locator('.mask-lab');
  await expect(maskLab).toBeVisible();
  await expect(maskLab.locator('[data-mask-name]')).toHaveValue('8-bit Counter mask');
  await expect(maskLab.locator('[data-mask-count]')).not.toHaveText('0');
  await expect(maskLab.locator('[data-mask-power-status]')).toHaveText('Not present');
  await expect(maskLab.locator('[data-mask-source-details]')).toContainText('5 components · 4 wires');
  await expect(maskLab.locator('[data-mask-source-details]')).toContainText('0 unresolved');
  await expect(maskLab.locator('[data-mask-active-layer]')).toContainText('SCHEMATIC');
  await expect(maskLab.locator('[data-mask-layer="active"]')).toBeVisible();
  await expect(maskLab.locator('[data-mask-status]')).toContainText('Schematic blocks and routes are shown on SCHEMATIC only');
  await expect(maskLab.locator('[data-mask-status]')).toContainText('power rails are not represented in this preview');
  const processLayerPixels = await page.evaluate(() => {
    const masks = window.electroDesignerEditor.maskLabPanel.layerMasks;
    return ['active', 'gate', 'metal1'].map((layer) => masks[layer].flat().filter(Boolean).length);
  });
  expect(processLayerPixels).toEqual([0, 0, 0]);
  await maskLab.locator('[data-mask-layer="gate"]').click();
  await expect(maskLab.locator('[data-mask-count]')).toHaveText('0');
  await maskLab.locator('[data-mask-layer="schematic"]').click();
  await expect(maskLab.locator('[data-mask-count]')).not.toHaveText('0');

  const focusItems = await maskLab.locator('.mask-focus-bar').evaluate((bar) =>
    [...bar.children].map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, right: x + width, bottom: y + height };
    })
  );
  for (let first = 0; first < focusItems.length; first += 1) {
    for (let second = first + 1; second < focusItems.length; second += 1) {
      const a = focusItems[first];
      const b = focusItems[second];
      const overlaps = a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
      expect(overlaps, `focus bar items ${first} and ${second} overlap`).toBe(false);
    }
  }
  const maskBounds = await maskLab.evaluate((root) => {
    const focus = root.querySelector('.mask-focus-bar').getBoundingClientRect();
    const shell = root.querySelector('.mask-grid-shell').getBoundingClientRect();
    const grid = root.querySelector('.mask-grid').getBoundingClientRect();
    return { focusBottom: focus.bottom, shellTop: shell.top, shellBottom: shell.bottom, gridTop: grid.top, gridBottom: grid.bottom };
  });
  expect(maskBounds.gridTop).toBeGreaterThanOrEqual(maskBounds.focusBottom);
  expect(maskBounds.gridBottom).toBeLessThanOrEqual(maskBounds.shellBottom);
});

test('Chip Lab runs an 8-bit counter and opens its paired GDS with matching output labels highlighted', async ({ page }) => {
  await page.locator('#workspace-mode-select').selectOption('chips');
  const chipLab = page.locator('.chip-lab');
  await expect(chipLab).toBeVisible();
  await chipLab.locator('[data-chip-preset="counter8"]').click();
  await expect(chipLab.locator('[data-counter-hex]')).toHaveText('0x00');

  await chipLab.locator('[data-chip-action="step-clock"]').click();
  await expect(chipLab.locator('[data-counter-hex]')).toHaveText('0x01');
  await chipLab.locator('.chip-sim-pin[data-chip-toggle]').filter({ hasText: 'ENABLE' }).click();
  await chipLab.locator('[data-chip-action="step-clock"]').click();
  await expect(chipLab.locator('[data-counter-hex]')).toHaveText('0x01');
  await chipLab.locator('.chip-sim-pin[data-chip-toggle]').filter({ hasText: 'RESET' }).click();
  await chipLab.locator('[data-chip-action="step-clock"]').click();
  await expect(chipLab.locator('[data-counter-hex]')).toHaveText('0x00');
  await chipLab.locator('.chip-sim-pin[data-chip-toggle]').filter({ hasText: 'RESET' }).click();
  await chipLab.locator('.chip-sim-pin[data-chip-toggle]').filter({ hasText: 'ENABLE' }).click();
  await chipLab.locator('[data-chip-action="step-clock"]').click();
  await expect(chipLab.locator('[data-counter-hex]')).toHaveText('0x01');

  await chipLab.locator('[data-chip-gds-file]').setInputFiles({
    name: 'counter8.gds',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(createCounterGds())
  });
  await expect(chipLab.locator('[data-chip-gds-pair-status]')).toContainText('8/8');
  await chipLab.locator('[data-chip-action="open-paired-gds"]').click();
  const maskLab = page.locator('.mask-lab');
  const snapshot = maskLab.locator('[data-mask-gds-signal-status]');
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toContainText('count[7:0] = 00000001');
  await expect(snapshot).toContainText('8/8 exact text labels highlighted');
  await expect(snapshot).toContainText('GDS signal nets are not traced');
  await expect(maskLab.locator('[data-mask-counter-output-bit].is-counter-matched')).toHaveCount(8);
  await expect(maskLab.locator('[data-mask-counter-output-bit="0"].is-counter-high')).toHaveCount(1);
});
