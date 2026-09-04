import { expect, test } from '@playwright/test';

/*
 * What a child is asked for, in the real bundle.
 *
 * The build these run against talks to a placeholder project, so nothing here signs anybody in;
 * what is proved is what the entrance asks for and what it refuses to ask for. A student has a name
 * and a number that the school gave them, and that is the whole of it: no email address, no
 * password, no one-time code, and no way to create an account for themselves.
 */
test.describe('student entrance', () => {
  test('sends the old student URL to the one entrance the product has', async ({ page }) => {
    await page.goto('/student');
    await expect(page.getByRole('heading', { name: 'คุณคือใคร?' })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('asks a student for a name and a student number only', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'นักเรียน', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบนักเรียน' })).toBeVisible();
    await expect(page.getByLabel('ชื่อนักเรียน')).toBeVisible();
    await expect(page.getByLabel('เลขประจำตัวนักเรียน')).toBeVisible();

    // A student number is read off a printout and typed, so masking it would hide the typo and not
    // protect anything. What must never appear is an email box, a password box or a code box.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
  });

  test('keeps the submit button closed until both fields are filled', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'นักเรียน', exact: true }).click();
    const submit = page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true });
    await expect(submit).toBeDisabled();
    await page.getByLabel('ชื่อนักเรียน').fill('สมชาย ใจดี');
    await expect(submit).toBeDisabled();
    await page.getByLabel('เลขประจำตัวนักเรียน').fill('00001');
    await expect(submit).toBeEnabled();
  });

  test('says who hands out the account rather than offering to create one', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('บัญชีทั้งหมดสร้างและกำหนดรหัสผ่านโดยแอดมินโรงเรียน')).toBeVisible();
    await expect(page.getByRole('link', { name: /สมัคร/ })).toHaveCount(0);
  });

  test('has touch targets a child can hit on a phone', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'นักเรียน', exact: true }).click();
    for (const field of ['input[name="displayName"]', 'input[name="studentCode"]']) {
      const box = await page.locator(field).boundingBox();
      expect(box?.height ?? 0, field).toBeGreaterThanOrEqual(48);
    }
    // By its role and its name rather than by a class. The class was `primary-button`, which stopped
    // existing the day the entrances moved onto the shared Button — and a selector that names an
    // implementation detail fails for a reason that has nothing to do with what is being checked.
    const submit = await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).boundingBox();
    expect(submit?.height ?? 0, 'submit button').toBeGreaterThanOrEqual(48);
  });
});
