import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = `${process.env.USERPROFILE}\\Desktop\\circuit\\new\\layouts`;
const outDir = 'docs/chipview';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR', msg.text().slice(0, 200)); });

await page.goto('http://127.0.0.1:3000');
await page.waitForTimeout(2000);
await page.selectOption('#workspace-mode-select', 'chipview');
await page.waitForTimeout(500);

for (const name of ['counter8_sky130A.gds', 'alu8_sky130A.gds']) {
  const buffer = readFileSync(`${base}\\${name}`);
  const started = Date.now();
  await page.setInputFiles('[data-chipview-input]', { name, mimeType: 'application/octet-stream', buffer });
  await page.waitForFunction(
    () => !/^Reading/.test(document.querySelector('[data-chipview-status]').textContent),
    null,
    { timeout: 180000 }
  );
  console.log(`${name}: imported in ${Date.now() - started}ms`);
  await page.waitForTimeout(1500);

  const model = page.locator('[data-chipview-model]').last();
  console.log('  detail: ' + (await model.locator('.chip-view-model-info').innerText()).replace(/\s+/g, ' '));
  console.log('  notes: ' + (await model.locator('.chip-view-model-warning').innerText()).replace(/\s+/g, ' ').slice(0, 220));

  // Turn on transistor markers and names, then hide the fill plate.
  const gates = model.locator('[data-chipview-annotation="gates"]');
  const names = model.locator('[data-chipview-annotation="labels"]');
  if (await gates.count()) await gates.check();
  if (await names.count()) await names.check();
  const fills = await model.locator('.chip-view-layer:has(em)').all();
  for (const fill of fills) {
    if ((await fill.getAttribute('aria-pressed')) === 'true') await fill.click();
  }
  await page.waitForTimeout(1200);

  // Top-down view shows the gates best.
  await page.evaluate(() => {
    const editor = window.electroDesignerEditor;
    const chip = editor.sceneManager.objectsList.find((object) => object.userData.chipViewModel);
    // A slight tilt keeps the up vector out of the singular straight-down case.
    editor.sceneManager.activeCamera.position.set(chip.position.x + 0.6, 15, chip.position.z + 5);
    editor.navigation.target.set(chip.position.x, 0.4, chip.position.z);
    editor.sceneManager.activeCamera.lookAt(editor.navigation.target);
    editor.navigation.updateSphericalFromCamera();
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outDir}/${name.replace('.gds', '')}-gates-top.png` });

  await page.evaluate(() => {
    const editor = window.electroDesignerEditor;
    const chip = editor.sceneManager.objectsList.find((object) => object.userData.chipViewModel);
    editor.sceneManager.activeCamera.position.set(chip.position.x + 9, 8, chip.position.z + 12);
    editor.navigation.target.set(chip.position.x, 0.5, chip.position.z);
    editor.sceneManager.activeCamera.lookAt(editor.navigation.target);
    editor.navigation.updateSphericalFromCamera();
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outDir}/${name.replace('.gds', '')}-gates-angle.png` });

  await page.evaluate(() => document.querySelectorAll('[data-chipview-model-action="remove"]').forEach((b) => b.click()));
}
await browser.close();