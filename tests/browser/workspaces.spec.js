import { expect, test } from '@playwright/test';
import { createLegacySampleGds, createSampleGds } from '../helpers/gdsFixture.js';
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
