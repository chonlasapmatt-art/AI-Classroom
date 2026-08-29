import { expect, test } from '@playwright/test';
test('shows secure configuration gate when cloud credentials are absent',async({page})=>{await page.goto('/');await expect(page.getByRole('heading',{name:/ระบบพร้อมสำหรับเชื่อมต่อ/})).toBeVisible();await expect(page.getByText('Service role, LINE secret และ HMAC secret')).toBeVisible();await expect(page).toHaveTitle(/AI Smart Classroom/);});
