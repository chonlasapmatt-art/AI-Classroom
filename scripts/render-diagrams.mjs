import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const source = resolve('docs/diagrams/diagrams.source.html');
const target = resolve('docs/diagrams/AI-Smart-Classroom-System-Diagrams.pdf');

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto(pathToFileURL(source).href, { waitUntil: 'networkidle' });
// The Thai webface is fetched over the network; printing before it lands would embed the fallback.
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: target,
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' }
});
await browser.close();
console.log('written:', target);
