import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const base = `${process.env.USERPROFILE}\\Desktop\\circuit\\new\\layouts`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));

await page.goto('http://127.0.0.1:3000');
await page.waitForTimeout(2000);
await page.selectOption('#workspace-mode-select', 'chipview');
await page.waitForTimeout(400);

for (const name of ['counter8_sky130A.gds', 'counter8_gf180mcuD.gds', 'alu8_nangate45.gds']) {
  const buffer = readFileSync(`${base}\\${name}`);
  await page.setInputFiles('[data-chipview-input]', { name, mimeType: 'application/octet-stream', buffer });
  await page.waitForFunction(
    () => !/^Reading/.test(document.querySelector('[data-chipview-status]').textContent),
    null,
    { timeout: 180000 }
  );
  await page.waitForTimeout(1200);
  const model = page.locator('[data-chipview-model]').last();
  const detail = (await model.locator('.chip-view-model-info').innerText()).replace(/\s+/g, ' ');
  const layers = (await model.locator('.chip-view-layer').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
  console.log(`\n${name}\n  ${detail}`);
  console.log(`  layers (${layers.length}): ${layers.join(', ')}`);
  await page.evaluate(() => document.querySelectorAll('[data-chipview-model-action="remove"]').forEach((b) => b.click()));
}
await page.screenshot({ path: 'docs/chipview/layer-names.png' });
await browser.close();