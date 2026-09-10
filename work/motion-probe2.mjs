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

async function trial(name, close) {
  await page.getByRole('button', { name: '+ สร้างงานใหม่' }).first().click();
  await page.waitForTimeout(700);
  if (await page.locator('.ui-modal').count() === 0) { console.log(name, '-> dialog never opened'); return; }
  await close();
  let sawClosing = false;
  for (let i = 0; i < 8; i += 1) {
    await page.waitForTimeout(25);
    if (await page.locator('.ui-modal.is-closing').count() > 0) sawClosing = true;
    if (await page.locator('.ui-modal').count() === 0) break;
  }
  console.log(`${name} -> exit ran: ${sawClosing}`);
  await page.waitForTimeout(400);
  // Make sure nothing is left over before the next trial.
  while (await page.locator('.ui-modal').count() > 0) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
}

await trial('Escape       ', () => page.keyboard.press('Escape'));
await trial('close button ', () => page.getByRole('button', { name: 'ปิด' }).first().click());
await trial('backdrop     ', () => page.locator('.ui-modal-backdrop').first().click({ position: { x: 8, y: 8 } }));

await browser.close();
