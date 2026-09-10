import { chromium } from 'playwright';
const out = process.env.SHOT_DIR;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/preview');
await page.getByRole('button').first().click().catch(() => {});
await page.waitForTimeout(2000);
await page.locator('select').first().selectOption({ label: 'นักเรียน · ธนกร ศรีสุวรรณ' });
await page.waitForTimeout(1200);
await page.getByRole('link', { name: 'โปรไฟล์ของฉัน' }).first().click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'เปลี่ยน Avatar' }).first().click();
await page.waitForTimeout(1000);
const names = ['ชุดนักเรียน','เสื้อคอปก','เสื้อฮู้ด','เสื้อสูทนักเรียน','ชุดกีฬา','เสื้อกาวน์','ผ้ากันเปื้อนศิลปะ','ชุดเอี๊ยม'];
for (const [i, name] of names.entries()) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator('.avatar-stage').screenshot({ path: `${out}/outfit-${i}.png` });
}
await browser.close();
