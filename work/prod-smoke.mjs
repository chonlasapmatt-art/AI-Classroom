/**
 * A look at the deployed thing, because a bundle containing the right strings is not the same as a
 * page that renders. Unauthenticated routes only — the rest needs a school account.
 */
import { chromium } from 'playwright';

const base = 'https://ai-smart-classroom-seven.vercel.app';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const errors = [];
const failures = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', (response) => {
  if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
});

for (const path of ['/', '/welcome', '/login', '/preview']) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const heading = await page.locator('h1').first().textContent().catch(() => '(none)');
  console.log(`${path.padEnd(10)} -> ${(heading ?? '').trim().slice(0, 60)}`);
}

const version = await page.evaluate(() => {
  const meta = document.querySelector('meta[name="app-version"]')?.getAttribute('content');
  return meta ?? '(not stamped in the document)';
});
console.log('version meta:', version);

console.log('page errors:', errors.length === 0 ? 'none' : errors.slice(0, 5));
console.log('HTTP >=400:', failures.length === 0 ? 'none' : failures.slice(0, 5));

await browser.close();
