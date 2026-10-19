import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const outDir = 'docs/chipview';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));

await page.goto('http://127.0.0.1:3000');
await page.waitForTimeout(2000);
await page.keyboard.press('Shift+G');
await page.waitForTimeout(1200);

// Frame the chip from a low three-quarter angle.
await page.evaluate(() => {
  const editor = window.electroDesignerEditor;
  const chip = editor.sceneManager.objectsList.find((object) => object.userData.animatedChip);
  editor.sceneManager.activeCamera.position.set(chip.position.x + 11, 9, chip.position.z + 14);
  editor.navigation.target.set(chip.position.x, 0.8, chip.position.z);
  editor.navigation.updateSphericalFromCamera();
});
await page.waitForTimeout(600);

for (const tick of [0, 1, 2, 3]) {
  const state = await page.evaluate(() => {
    const chip = window.electroDesignerEditor.sceneManager.objectsList
      .find((object) => object.userData.animatedChip);
    return { value: chip.userData.counterValue, binary: chip.userData.counterBinary };
  });
  await page.screenshot({ path: `${outDir}/animated-chip-t${tick}.png` });
  console.log(`frame ${tick}: value=${state.value} binary=${state.binary}`);
  await page.waitForTimeout(1000);
}
await browser.close();