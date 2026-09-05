import { expect, test } from '@playwright/test';

/*
 * The setup gate, at the address it actually lives at.
 *
 * This test used to open `/` and look for the gate there, which is where it was until the public
 * Home took that address over. An unconfigured deployment now shows a stranger the signpost —
 * which is right, because "this school has not connected its database yet" is an operator's
 * problem and not something to explain to a parent — and keeps the setup instructions at the two
 * private entrances. So the assertion moves rather than the product: the gate still has to exist,
 * and it still has to be the thing that says which secrets never reach the browser.
 */
test('shows the secure configuration gate when cloud credentials are absent', async ({ page }) => {
  await page.goto('/admin-access');
  await expect(page.getByRole('heading', { name: /ระบบพร้อมสำหรับเชื่อมต่อ/ })).toBeVisible();
  await expect(page.getByText('Service role, LINE secret และ HMAC secret')).toBeVisible();
  await expect(page).toHaveTitle(/AI Smart Classroom/);
});

/* And the address it gave up: a stranger landing on the root of an unconfigured deployment gets
   the public Home, not a page of environment-variable instructions. */
test('sends the root of an unconfigured deployment to the public Home', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Smart Classroom' })).toBeVisible();
  await expect(page.getByRole('link', { name: /ครู/ })).toBeVisible();
});
