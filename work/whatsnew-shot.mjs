/**
 * The "what just changed" notice, as it actually renders.
 *
 * It only appears when the device remembers an older version, so the shot sets that memory to an
 * earlier release before the app boots. Both themes, because the panel borrows the brand colour and
 * the dark half is where borrowed colour usually goes wrong.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.env.SHOT_DIR ?? 'work/shots-whatsnew';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message));

  await page.goto('http://localhost:5173/preview');
  // Pretend this device last ran an older build, which is the only condition the notice appears in.
  await page.evaluate((mode) => {
    for (const key of Object.keys(localStorage)) {
      if (key.toLowerCase().includes('version')) localStorage.setItem(key, '3.3.0');
    }
    localStorage.setItem('smart-classroom-seen-version', '3.3.0');
    localStorage.setItem('theme-mode', mode);
  }, theme);
  await page.reload({ waitUntil: 'networkidle' });
  // No stray clicks here: the notice own close button is the first button on the page.
  await page.waitForTimeout(3000);

  const notice = page.locator('.whats-new');
  if (await notice.count() === 0) {
    console.log(`${theme}: notice not shown — localStorage key guess was wrong`);
    console.log('keys:', await page.evaluate(() => Object.keys(localStorage).join(', ')));
    await context.close();
    continue;
  }
  await notice.screenshot({ path: `${out}/whatsnew-${theme}.png` });
  console.log(`${theme}: captured`);
  await context.close();
}

await browser.close();
console.log('shots in', out);
