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
