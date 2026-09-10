import { chromium } from 'playwright';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
await page.goto('http://localhost:5173/preview');
await page.getByRole('button').first().click().catch(() => {});
await page.waitForTimeout(1500);
for (let i = 0; i < 4; i += 1) {
  if (await page.locator('.class-notice-scrim').count() === 0) break;
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
}
await page.goto('http://localhost:5173/assignments');
await page.waitForTimeout(1800);

const x = async () => Math.round((await page.locator('.ui-segmented-pill').first().boundingBox())?.x ?? -1);
console.log('start  x =', await x());
await page.getByRole('tab', { name: 'ปิดแล้ว' }).first().click();
for (const at of [0, 30, 60, 100, 150, 260]) {
  await page.waitForTimeout(at === 0 ? 8 : 30);
  console.log(`  ~${at}ms  x = ${await x()}`);
}
await browser.close();
