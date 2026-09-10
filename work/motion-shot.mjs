/**
 * Motion, caught mid-flight.
 *
 * A still of a finished animation proves nothing — the failure modes here are all in between: a
 * dialog that vanishes rather than leaving, a pill that blinks rather than travelling, a band that
 * arrives blurred. So each shot is taken a fixed number of milliseconds into the transition, and
 * what is being checked is whether there is anything there at all at that moment.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.env.SHOT_DIR ?? 'work/shots-motion';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message));

await page.goto('http://localhost:5173/preview');
await page.getByRole('button').first().click().catch(() => {});
await page.waitForTimeout(1500);
for (let attempt = 0; attempt < 4; attempt += 1) {
  if (await page.locator('.class-notice-scrim').count() === 0) break;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

await page.goto('http://localhost:5173/assignments');
await page.waitForTimeout(1800);

/* ── The segmented pill, measured rather than eyeballed ── */
const pill = page.locator('.ui-segmented-pill').first();
console.log('pill present:', await pill.count() > 0);
const before = await pill.boundingBox();
await page.getByRole('tab', { name: 'ฉบับร่าง' }).first().click();
await page.waitForTimeout(60);          // mid-travel
await page.locator('.ui-segmented').first().screenshot({ path: `${out}/segmented-mid.png` });
await page.waitForTimeout(400);
const after = await pill.boundingBox();
await page.locator('.ui-segmented').first().screenshot({ path: `${out}/segmented-settled.png` });
console.log('pill moved:', before && after ? Math.round(after.x - before.x) : 'unmeasured', 'px');

/* ── The dialog, on the way out ── */
await page.getByRole('button', { name: '+ สร้างงานใหม่' }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/dialog-open.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(70);          // mid-exit: the panel must still be on screen
const stillThere = await page.locator('.ui-modal.is-closing').count();
await page.screenshot({ path: `${out}/dialog-leaving.png` });
console.log('dialog still on screen 70ms into its exit:', stillThere > 0);
await page.waitForTimeout(500);
console.log('dialog gone after the exit:', await page.locator('.ui-modal').count() === 0);

await browser.close();
console.log('shots in', out);
