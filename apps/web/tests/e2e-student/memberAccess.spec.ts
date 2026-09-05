import { expect, test } from '@playwright/test';

/*
 * The public entrances, as the product now has them.
 *
 * There is no public sign-up left: an account is created by the school's admin, and every URL that
 * once offered to make one lands back on the signpost. These hold that, and they hold what each
 * role is asked for — a name plus the one credential their school gave them, never an email address
 * and never a one-time code.
 *
 * The question "who are you" is asked on the public Home now rather than by the sign-in form. The
 * three doors there carry the answer in the URL, so the form knows before it renders and never asks
 * twice; a bare /login with no role in it goes back to Home rather than guessing.
 */

/* Doors are links whose accessible name is the role plus what that role is asked for, so they are
   matched on the role word rather than an exact string. No role word appears in another door's
   description, which is what keeps each of these matching exactly one link. */
const doorFor = (role: string) => new RegExp(role);

test.describe('choosing who you are', () => {
  test('asks who you are on Home, before any field exists', async ({ page }) => {
    await page.goto('/welcome');
    await expect(page.getByRole('heading', { level: 1, name: 'Smart Classroom' })).toBeVisible();
    for (const role of ['ครู', 'นักเรียน', 'ผู้ปกครอง']) {
      await expect(page.getByRole('link', { name: doorFor(role) })).toBeVisible();
    }
    await expect(page.locator('input')).toHaveCount(0);
  });

  test('sends a bare sign-in URL back to Home rather than guessing a role', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Smart Classroom' })).toBeVisible();
  });

  test('keeps the school admin entrance off the public page but reachable', async ({ page }) => {
    // A school admin knows the address. A parent reading down the Home page should not be offered a
    // door that will refuse them, so the private control room is not linked from anywhere public.
    await page.goto('/welcome');
    await expect(page.getByRole('link', { name: /ผู้ดูแล/ })).toHaveCount(0);

    await page.goto('/admin-access');
    await expect(page.getByRole('heading', { name: 'เข้าสู่ศูนย์ควบคุม' })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });
});

test.describe('signing in', () => {
  const credentials: { who: string; as: string; nameLabel: string; secretLabel: string }[] = [
    { who: 'ครู', as: 'teacher', nameLabel: 'ชื่อครู', secretLabel: 'รหัสครู' },
    { who: 'นักเรียน', as: 'student', nameLabel: 'ชื่อนักเรียน', secretLabel: 'เลขประจำตัวนักเรียน' },
    { who: 'ผู้ปกครอง', as: 'parent', nameLabel: 'ชื่อผู้ปกครอง', secretLabel: 'รหัสผ่าน' }
  ];

  for (const { who, as, nameLabel, secretLabel } of credentials) {
    test(`asks ${who} for a name and one credential only`, async ({ page }) => {
      await page.goto('/welcome');
      await page.getByRole('link', { name: doorFor(who) }).click();
      await expect(page).toHaveURL(new RegExp(`/login\\?as=${as}$`));
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
    await page.goto('/login?as=parent');
    await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'password');

    await page.goto('/login?as=teacher');
    await expect(page.locator('input[name="teacherCode"]')).toHaveAttribute('type', 'text');
  });

  test('shows what to type rather than leaving the fields blank', async ({ page }) => {
    // A person who has never seen the screen cannot tell whether "ชื่อ" wants a first name, a full
    // name or a nickname. The example answers that before they get it wrong and spend an attempt.
    await page.goto('/login?as=teacher');
    await expect(page.locator('input[name="displayName"]')).toHaveAttribute('placeholder', /สมชาย ใจดี/);
    await expect(page.locator('input[name="teacherCode"]')).toHaveAttribute('placeholder', /SC-001/);
    await expect(page.getByText('ตัวพิมพ์เล็กใหญ่และเว้นวรรคไม่มีผล')).toBeVisible();
  });

  test('keeps the button closed until both fields are filled', async ({ page }) => {
    await page.goto('/login?as=teacher');
    const submit = page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true });
    await expect(submit).toBeDisabled();
    await page.getByLabel('ชื่อครู').fill('สมชาย ใจดี');
    await expect(submit).toBeDisabled();
    await page.getByLabel('รหัสครู', { exact: true }).fill('SC-001');
    await expect(submit).toBeEnabled();
  });

  test('lets somebody who picked the wrong role go back and pick again', async ({ page }) => {
    await page.goto('/login?as=teacher');
    await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบครู' })).toBeVisible();
    await page.getByRole('link', { name: /ย้อนกลับไปยังหน้า Home/ }).click();
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('link', { name: doorFor('นักเรียน') })).toBeVisible();
  });
});

test.describe('no public sign-up', () => {
  // Accounts are made by the school. Every URL that once created one is kept alive as a redirect
  // rather than a 404, because they are in browser history, in chat messages and on printouts.
  for (const path of ['/register', '/student', '/forgot-password', '/reset-password', '/auth/callback']) {
    test(`sends ${path} to the public signpost`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/welcome$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Smart Classroom' })).toBeVisible();
    });
  }

  test('never asks for an email address anywhere on the public entrance', async ({ page }) => {
    for (const path of ['/welcome', '/login?as=teacher', '/login?as=student', '/login?as=parent']) {
      await page.goto(path);
      await expect(page.locator('input[type="email"]')).toHaveCount(0);
      await expect(page.getByText('อีเมล')).toHaveCount(0);
    }
  });
});
