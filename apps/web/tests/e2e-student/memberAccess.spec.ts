import { expect, test } from '@playwright/test';

// The teacher and parent half of the public entrances. Like the student suite, this build talks to
// a placeholder project, so what is proved here is what the screens ask for and what they say when
// the answer is refused — the part that must never regress back into asking for an email address.

test.describe('choosing who you are', () => {
  test('asks who you are before it asks for anything else', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'คุณคือใคร?' })).toBeVisible();
    for (const label of ['ครู', 'นักเรียน', 'ผู้ปกครอง']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await expect(page.locator('input')).toHaveCount(0);
  });

  test('sends a student to the student entrance instead of a password field', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'นักเรียน', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'เข้าใช้งาน' })).toBeVisible();
    await expect(page.getByLabel('เลขประจำตัวนักเรียน')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });
});

test.describe('teacher and parent sign-in', () => {
  for (const who of ['ครู', 'ผู้ปกครอง']) {
    test(`asks ${who} for a name and a password only`, async ({ page }) => {
      await page.goto('/login');
      await page.getByRole('button', { name: who, exact: true }).click();
      await expect(page.getByRole('heading', { name: `เข้าสู่ระบบ${who}` })).toBeVisible();
      await expect(page.getByLabel('ชื่อ', { exact: true })).toBeVisible();
      await expect(page.getByLabel('รหัสผ่าน', { exact: true })).toBeVisible();
      await expect(page.locator('input[type="email"]')).toHaveCount(0);
      await expect(page.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
    });
  }

  test('shows what to type rather than leaving the fields blank', async ({ page }) => {
    // A person who has never seen the screen cannot tell whether "ชื่อ" wants a first name, a full
    // name or a nickname. The example answers that before they get it wrong and spend an attempt.
    await page.goto('/login');
    await page.getByRole('button', { name: 'ครู', exact: true }).click();
    await expect(page.locator('input[name="displayName"]')).toHaveAttribute('placeholder', /สมชาย ใจดี/);
    await expect(page.locator('input[name="password"]')).toHaveAttribute('placeholder', /รหัสผ่าน/);
    await expect(page.getByText('ตัวพิมพ์เล็กใหญ่และเว้นวรรคไม่มีผล')).toBeVisible();
  });

  test('keeps the button closed until both fields are filled', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'ครู', exact: true }).click();
    const submit = page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true });
    await expect(submit).toBeDisabled();
    await page.getByLabel('ชื่อ', { exact: true }).fill('สมชาย ใจดี');
    await expect(submit).toBeDisabled();
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill('password123');
    await expect(submit).toBeEnabled();
  });

  test('answers a rejected sign-in with one message that names no field', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'ครู', exact: true }).click();
    await page.getByLabel('ชื่อ', { exact: true }).fill('สมชาย ใจดี');
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('ชื่อหรือรหัสผ่านไม่ถูกต้อง');
  });
});

test.describe('signing up', () => {
  test('asks a teacher for a name, a school and a password — never an email', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'ครู', exact: true }).click();
    await expect(page.getByLabel('ชื่อจริง')).toBeVisible();
    await expect(page.getByLabel('นามสกุล')).toBeVisible();
    await expect(page.getByLabel('โรงเรียน')).toBeVisible();
    await expect(page.getByLabel('รหัสผ่าน', { exact: true })).toBeVisible();
    await expect(page.getByLabel('ยืนยันรหัสผ่าน')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test('asks a parent for a name and a password and never for a school or a child', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'ผู้ปกครอง', exact: true }).click();
    await expect(page.getByLabel('ชื่อจริง')).toBeVisible();
    await expect(page.getByLabel('นามสกุล')).toBeVisible();
    await expect(page.getByLabel('รหัสผ่าน', { exact: true })).toBeVisible();
    await expect(page.getByLabel('โรงเรียน')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test('gives an example for every field a teacher has to fill in', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'ครู', exact: true }).click();
    await expect(page.locator('input[name="firstName"]')).toHaveAttribute('placeholder', /สมชาย/);
    await expect(page.locator('input[name="lastName"]')).toHaveAttribute('placeholder', /ใจดี/);
    await expect(page.locator('input[name="school"]')).toHaveAttribute('placeholder', /โรงเรียน/);
    await expect(page.locator('input[name="password"]')).toHaveAttribute('placeholder', /8 ตัวอักษร/);
    await expect(page.locator('input[name="confirmPassword"]')).toHaveAttribute('placeholder', /อีกครั้ง/);
    await expect(page.getByText('แล้วกดเลือกจากรายการที่ขึ้นมา')).toBeVisible();
  });

  test('holds the button closed until the two passwords match', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'ผู้ปกครอง', exact: true }).click();
    const submit = page.getByRole('button', { name: 'สร้างบัญชีและเข้าใช้งาน' });
    await page.getByLabel('ชื่อจริง').fill('สมหญิง');
    await page.getByLabel('นามสกุล').fill('ใจดี');
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill('password123');
    await page.getByLabel('ยืนยันรหัสผ่าน').fill('password124');
    await expect(submit).toBeDisabled();
    await page.getByLabel('ยืนยันรหัสผ่าน').fill('password123');
    await expect(submit).toBeEnabled();
  });
});

test.describe('recovering a password without an inbox', () => {
  test('asks who you are and your name, and never reveals whether it exists', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'ขอตั้งรหัสผ่านใหม่' })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await page.getByLabel('ชื่อ', { exact: true }).fill('สมชาย ใจดี');
    await page.getByRole('button', { name: 'ส่งคำขอ' }).click();
    // The service worker's own offline banner is also a status region, so this asks the form's.
    const status = page.getByRole('status').filter({ hasText: 'ส่งคำขอ' });
    await expect(status).toContainText('ส่งคำขอตั้งรหัสผ่านใหม่แล้ว');
    await expect(status).not.toContainText('ไม่พบ');
  });
});
