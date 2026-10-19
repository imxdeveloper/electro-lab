import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = `${process.env.USERPROFILE}\\Desktop\\circuit\\new\\layouts`;
const outDir = 'docs/chipview';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));

await page.goto('http://127.0.0.1:3000');
await page.waitForTimeout(2000);
await page.selectOption('#workspace-mode-select', 'chipview');
await page.waitForTimeout(600);

for (const name of ['counter8_sky130A.gds', 'alu8_sky130A.gds', 'fifo16_sky130hd.gds']) {
  const buffer = readFileSync(`${base}\\${name}`);
  await page.setInputFiles('[data-chipview-input]', { name, mimeType: 'application/octet-stream', buffer });
  await page.waitForFunction(
    () => !/^Reading/.test(document.querySelector('[data-chipview-status]').textContent),
    null,
    { timeout: 180000 }
  );
  await page.waitForTimeout(1500);
  const stem = name.replace('.gds', '');

  // Stacked, with the full-area fill plate hidden so the stack is readable.
  const model = page.locator('[data-chipview-model]').last();
  const fills = await model.locator('.chip-view-layer:has(em)').all();
  for (const fill of fills) {
    if ((await fill.getAttribute('aria-pressed')) === 'true') await fill.click();
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${outDir}/${stem}-stacked.png` });

  // A lower camera angle shows the separation between layers best.
  await page.keyboard.down('Alt');
  await page.mouse.move(800, 500);
  await page.mouse.down();
  await page.mouse.move(880, 590, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outDir}/${stem}-stacked-angle.png` });
  console.log(`${stem}: captured stacked views (${fills.length} fill layer(s) hidden)`);

  await page.evaluate(() => document.querySelectorAll('[data-chipview-model-action="remove"]').forEach((b) => b.click()));
}
await browser.close();