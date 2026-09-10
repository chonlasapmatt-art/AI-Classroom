/**
 * The customiser on a phone, against production.
 *
 * The bug was that a sticky block covered the category chips, so a finger aiming at one landed on a
 * drawer row instead. CSS in the bundle does not prove that is over — only pressing the chip does.
 */
import { chromium, devices } from 'playwright';

const base = 'https://ai-smart-classroom-seven.vercel.app';
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });
await page.getByRole('button').first().click().catch(() => undefined);
await page.waitForTimeout(1500);

const role = page.locator('select').first();
const labels = await role.locator('option').allTextContents();
const student = labels.find((label) => label.includes('นักเรียน'));
if (student) { await role.selectOption({ label: student }); await page.waitForTimeout(1200); }
for (let i = 0; i < 4; i += 1) {
  if (await page.locator('.class-notice-scrim').count() === 0) break;
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
}

await page.goto(`${base}/profile`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'เปลี่ยน Avatar' }).first().click();
const dialog = page.getByRole('dialog');
await dialog.getByText('เลือก Avatar ขั้นสูง').waitFor({ timeout: 15000 });
console.log('customiser opened on a phone: yes');

// The press that used to land on a drawer row.
const chip = dialog.getByRole('group', { name: 'หมวด' }).getByRole('button', { name: 'มังกร', exact: true });
await chip.click({ timeout: 15000 });
console.log('category chip pressed:', await chip.getAttribute('aria-pressed'));
await dialog.getByRole('option').first().waitFor({ timeout: 15000 });
console.log('tiles rendered for that category: yes');

console.log('page errors:', errors.length === 0 ? 'none' : errors.slice(0, 3));
await browser.close();
