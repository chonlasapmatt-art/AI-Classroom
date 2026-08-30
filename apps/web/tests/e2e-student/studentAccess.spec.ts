import { expect, test } from '@playwright/test';

test.describe('student entrance', () => {
  test('asks a student for a name and a student number only', async ({ page }) => {
    await page.goto('/student');
    await expect(page.getByRole('heading', { name: 'เข้าใช้งาน' })).toBeVisible();
    await expect(page.getByLabel('ชื่อ', { exact: true })).toBeVisible();
    await expect(page.getByLabel('เลขประจำตัวนักเรียน')).toBeVisible();
    await expect(page.getByRole('button', { name: 'เข้าใช้งาน' })).toBeVisible();

    // Nothing on this screen may ask a child for an email address, a password or a code.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
  });

  test('keeps the submit button closed until both fields are filled', async ({ page }) => {
    await page.goto('/student');
    const submit = page.getByRole('button', { name: 'เข้าใช้งาน' });
    await expect(submit).toBeDisabled();
    await page.getByLabel('ชื่อ', { exact: true }).fill('สมชาย ใจดี');
    await expect(submit).toBeDisabled();
    await page.getByLabel('เลขประจำตัวนักเรียน').fill('1285');
    await expect(submit).toBeEnabled();
  });

  test('answers a rejected sign-in with one message that names no field', async ({ page }) => {
    await page.goto('/student');
    await page.getByLabel('ชื่อ', { exact: true }).fill('สมชาย ใจดี');
    await page.getByLabel('เลขประจำตัวนักเรียน').fill('1285');
    await page.getByRole('button', { name: 'เข้าใช้งาน' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบชื่อและเลขประจำตัวนักเรียน');
    await expect(alert).not.toContainText('โรงเรียน');
  });

  test('offers first-time registration without an email or a password', async ({ page }) => {
    await page.goto('/student');
    await page.getByRole('link', { name: /สมัครใช้งานครั้งแรก/ }).click();
    await expect(page.getByRole('heading', { name: 'สมัครใช้งานครั้งแรก' })).toBeVisible();
    await expect(page.getByLabel('ชื่อจริง')).toBeVisible();
    await expect(page.getByLabel('นามสกุล')).toBeVisible();
    await expect(page.getByLabel('เลขประจำตัวนักเรียน')).toBeVisible();
    await expect(page.getByLabel('โรงเรียน')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เริ่มใช้งาน' })).toBeDisabled();
  });

  test('sends teachers and parents to the email sign-in and never the reverse', async ({ page }) => {
    await page.goto('/student');
    await page.getByRole('link', { name: 'ฉันเป็นครูหรือผู้ปกครอง' }).click();
    await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'นักเรียนกดที่นี่' })).toBeVisible();
  });

  test('has touch targets a child can hit on a phone', async ({ page }) => {
    await page.goto('/student');
    for (const selector of ['input[name="displayName"]', 'input[name="studentCode"]', 'button.primary-button']) {
      const box = await page.locator(selector).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
  });
});
