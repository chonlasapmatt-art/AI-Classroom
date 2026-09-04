import { expect, test } from '@playwright/test';

/*
 * The public entrances, as the product now has them.
 *
 * There is no public sign-up left: an account is created by the school's admin, and every URL that
 * once offered to make one lands on the single sign-in screen. These hold that, and they hold what
 * each role is asked for — a name plus the one credential their school gave them, never an email
 * address and never a one-time code.
 */
test.describe('choosing who you are', () => {
  test('asks who you are before it asks for anything else', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'คุณคือใคร?' })).toBeVisible();
    for (const label of ['ครู', 'นักเรียน', 'ผู้ปกครอง']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await expect(page.locator('input')).toHaveCount(0);
  });

  test('keeps the school admin entrance available without putting it first', async ({ page }) => {
    await page.goto('/login');
    const adminLink = page.getByRole('link', { name: 'เข้าสู่ระบบผู้ดูแลโรงเรียน' });
    await expect(adminLink).toBeVisible();
    await adminLink.click();
    await expect(page).toHaveURL(/\/admin-access$/);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });
});

test.describe('signing in', () => {
  const credentials: { who: string; nameLabel: string; secretLabel: string }[] = [
    { who: 'ครู', nameLabel: 'ชื่อครู', secretLabel: 'รหัสครู' },
    { who: 'นักเรียน', nameLabel: 'ชื่อนักเรียน', secretLabel: 'เลขประจำตัวนักเรียน' },
    { who: 'ผู้ปกครอง', nameLabel: 'ชื่อผู้ปกครอง', secretLabel: 'รหัสผ่าน' }
  ];

  for (const { who, nameLabel, secretLabel } of credentials) {
    test(`asks ${who} for a name and one credential only`, async ({ page }) => {
      await page.goto('/login');
      await page.getByRole('button', { name: who, exact: true }).click();
      await expect(page.getByRole('heading', { name: `เข้าสู่ระบบ${who}` })).toBeVisible();
      await expect(page.getByLabel(nameLabel)).toBeVisible();
      await expect(page.getByLabel(secretLabel, { exact: true })).toBeVisible();
      await expect(page.locator('input[type="email"]')).toHaveCount(0);
      await expect(page.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
    });
  }

  test('masks the parent password and nothing else', async ({ page }) => {
    // A teacher code and a student number are printed on a list and typed from it; masking them
    // hides the typo and protects nothing. A parent's password is the one real secret here.
    await page.goto('/login');
    await page.getByRole('button', { name: 'ผู้ปกครอง', exact: true }).click();
    await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'password');

    await page.goto('/login');
    await page.getByRole('button', { name: 'ครู', exact: true }).click();
    await expect(page.locator('input[name="teacherCode"]')).toHaveAttribute('type', 'text');
  });

  test('shows what to type rather than leaving the fields blank', async ({ page }) => {
    // A person who has never seen the screen cannot tell whether "ชื่อ" wants a first name, a full
    // name or a nickname. The example answers that before they get it wrong and spend an attempt.
    await page.goto('/login');
    await page.getByRole('button', { name: 'ครู', exact: true }).click();
    await expect(page.locator('input[name="displayName"]')).toHaveAttribute('placeholder', /สมชาย ใจดี/);
    await expect(page.locator('input[name="teacherCode"]')).toHaveAttribute('placeholder', /SC-001/);
    await expect(page.getByText('ตัวพิมพ์เล็กใหญ่และเว้นวรรคไม่มีผล')).toBeVisible();
  });

  test('keeps the button closed until both fields are filled', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'ครู', exact: true }).click();
    const submit = page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true });
    await expect(submit).toBeDisabled();
    await page.getByLabel('ชื่อครู').fill('สมชาย ใจดี');
    await expect(submit).toBeDisabled();
    await page.getByLabel('รหัสครู', { exact: true }).fill('SC-001');
    await expect(submit).toBeEnabled();
  });

  test('lets somebody who picked the wrong role go back', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'ครู', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบครู' })).toBeVisible();
    await page.getByRole('button', { name: 'เปลี่ยนประเภทผู้ใช้' }).click();
    await expect(page.getByRole('heading', { name: 'คุณคือใคร?' })).toBeVisible();
  });
});

test.describe('no public sign-up', () => {
  // Accounts are made by the school. Every URL that once created one is kept alive as a redirect
  // rather than a 404, because they are in browser history, in chat messages and on printouts.
  for (const path of ['/register', '/student', '/forgot-password', '/reset-password', '/auth/callback']) {
    test(`sends ${path} to the sign-in screen`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'คุณคือใคร?' })).toBeVisible();
    });
  }

  test('never asks for an email address anywhere on the public entrance', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByText('อีเมล')).toHaveCount(0);
  });
});
