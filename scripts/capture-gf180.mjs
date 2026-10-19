import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = `${process.env.USERPROFILE}\\Desktop\\circuit\\new\\layouts`;
mkdirSync('docs/chipview', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));

await page.goto('http://127.0.0.1:3000');
await page.waitForTimeout(2000);
await page.selectOption('#workspace-mode-select', 'chipview');
await page.waitForTimeout(400);

for (const name of ['counter8_gf180mcuD.gds', 'alu8_gf180mcuD.gds']) {
  const buffer = readFileSync(`${base}\\${name}`);
  await page.setInputFiles('[data-chipview-input]', { name, mimeType: 'application/octet-stream', buffer });
  await page.waitForFunction(
    () => !/^Reading/.test(document.querySelector('[data-chipview-status]').textContent),
    null,
    { timeout: 180000 }
  );
  await page.waitForTimeout(1500);
  const model = page.locator('[data-chipview-model]').last();
  console.log(`\n${name}`);
  console.log('  ' + (await model.locator('.chip-view-model-info').innerText()).replace(/\s+/g, ' '));
  console.log('  ' + (await model.locator('.chip-view-model-warning').innerText()).replace(/\s+/g, ' '));
  const layers = (await model.locator('.chip-view-layer').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
  console.log(`  marker layers still listed: ${layers.filter((l) => /V5_XTOR|Dualgate|LVPWELL/.test(l)).length}`);
  console.log(`  layers (${layers.length}): ${layers.join(', ')}`);

  const fills = await model.locator('.chip-view-layer:has(em)').all();
  for (const fill of fills) if ((await fill.getAttribute('aria-pressed')) === 'true') await fill.click();
  await page.evaluate(() => {
    const editor = window.electroDesignerEditor;
    const chip = editor.sceneManager.objectsList.find((object) => object.userData.chipViewModel);
    editor.sceneManager.activeCamera.position.set(chip.position.x + 8, 9, chip.position.z + 13);
    editor.navigation.target.set(chip.position.x, 0.4, chip.position.z);
    editor.sceneManager.activeCamera.lookAt(editor.navigation.target);
    editor.navigation.updateSphericalFromCamera();
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `docs/chipview/${name.replace('.gds', '')}-no-markers.png` });
  await page.evaluate(() => document.querySelectorAll('[data-chipview-model-action="remove"]').forEach((b) => b.click()));
}
await browser.close();