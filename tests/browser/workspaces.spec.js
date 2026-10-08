import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
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
