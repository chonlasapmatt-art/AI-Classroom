/**
 * A look at the figure, which is the only reviewer that catches a limb pivoting from the wrong
 * joint. The tests hold the z-order, the frame counts and the pivots as numbers; none of them can
 * tell whether the thing standing there looks like a person.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.env.SHOT_DIR ?? 'work/shots';
mkdirSync(out, { recursive: true });

const archetypes = ['นักรบมังกร', 'จอมเวทย์มนตร์', 'ปีศาจ', 'นักเรียน', 'นักกีฬา'];
const poses = ['ยืน', 'เดิน', 'วิ่ง', 'ร่ายเวทย์', 'โจมตี', 'กระโดด', 'เชียร์'];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 3 });
const page = await context.newPage();

page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message));
page.on('console', (message) => {
  if (message.type() === 'error') console.log('CONSOLE ERROR:', message.text());
});

await page.goto('http://localhost:5173/preview');
await page.getByRole('button').first().click().catch(() => {});
await page.waitForTimeout(1500);
await page.locator('select').first().selectOption({ index: 2 }).catch(() => {});
await page.waitForTimeout(1200);
// Switching role raises a "which room" notice over the shell; it has to go before anything is
// clickable underneath it.
for (let attempt = 0; attempt < 4; attempt += 1) {
  if (await page.locator('.class-notice-scrim').count() === 0) break;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
await page.getByRole('link', { name: 'โปรไฟล์ของฉัน' }).first().click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'เปลี่ยน Avatar' }).first().click();
await page.waitForTimeout(1200);

await page.getByRole('button', { name: 'เต็มตัว' }).click();
await page.waitForTimeout(500);

const stage = page.locator('.designer-stage');
// Several groups on this screen share these words -- the race chips say ปีศาจ too -- so the
// archetype chips are addressed by their own group rather than by name across the page.
const archetypeChips = page.getByRole('group', { name: 'แบบตัวละครเต็มตัว' });
const poseChips = page.getByRole('group', { name: 'ท่าทางในพรีวิว' });

for (const archetype of archetypes) {
  await archetypeChips.getByRole('button', { name: archetype, exact: true }).click();
  await page.waitForTimeout(400);
  await stage.screenshot({ path: `${out}/archetype-${archetype}.png` });
  console.log('drew', archetype);
}

// The dragon knight through every pose, held on its first frame so the shot is repeatable.
await archetypeChips.getByRole('button', { name: 'นักรบมังกร', exact: true }).click();
for (const pose of poses) {
  await poseChips.getByRole('button', { name: pose, exact: true }).click();
  await page.waitForTimeout(300);
  await stage.screenshot({ path: `${out}/pose-${pose}.png` });
  console.log('posed', pose);
}

// And the mage, because the robe and the staff are what the second archetype is judged on.
await archetypeChips.getByRole('button', { name: 'จอมเวทย์มนตร์', exact: true }).click();
await poseChips.getByRole('button', { name: 'ร่ายเวทย์', exact: true }).click();
await page.waitForTimeout(600);
await stage.screenshot({ path: `${out}/mage-casting.png` });

await browser.close();
console.log('shots in', out);
