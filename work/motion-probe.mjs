import { chromium } from 'playwright';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:5173/preview');
await page.getByRole('button').first().click().catch(() => {});
await page.waitForTimeout(1500);
for (let i = 0; i < 4; i += 1) {
  if (await page.locator('.class-notice-scrim').count() === 0) break;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
await page.goto('http://localhost:5173/assignments');
await page.waitForTimeout(1800);

console.log('reduced-motion media:', await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches));
console.log('data-motion:', await page.evaluate(() => document.documentElement.dataset.motion ?? '(absent)'));

await page.getByRole('button', { name: '+ สร้างงานใหม่' }).first().click();
await page.waitForTimeout(700);
console.log('.ui-modal open:', await page.locator('.ui-modal').count());
console.log('modal classes:', await page.locator('.ui-modal').first().getAttribute('class').catch(() => 'none'));

await page.keyboard.press('Escape');
for (const wait of [30, 60, 100, 160, 260]) {
  await page.waitForTimeout(wait === 30 ? 30 : 40);
  console.log(`  +${wait}ms  .ui-modal=${await page.locator('.ui-modal').count()}  is-closing=${await page.locator('.ui-modal.is-closing').count()}`);
}
await browser.close();
