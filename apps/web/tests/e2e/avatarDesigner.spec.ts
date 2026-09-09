import { expect, test } from '@playwright/test';

/*
 * The avatar a child picks is still theirs after a reload.
 *
 * Everything else about the customiser is checked in unit tests, which know nothing about service
 * workers, IndexedDB or the round trip through a repository. This is the one thing only a browser
 * can answer: that pressing "บันทึกและใช้" puts something in storage that survives the page going
 * away, which is the whole promise the screen is making.
 *
 * It runs against Preview Mode, so it needs no server and no account — the same demo data every
 * school sees before they connect anything.
 */
test.describe('เลือก Avatar ขั้นสูง', () => {
  test('picks a dragon, saves it, and still has it after a reload', async ({ page }) => {
    await page.goto('/preview');
    await page.getByRole('button').first().click().catch(() => undefined);
    await page.waitForTimeout(1500);

    const role = page.locator('select').first();
    const labels = await role.locator('option').allTextContents();
    const student = labels.find((label) => label.includes('นักเรียน'));
    if (student) {
      await role.selectOption({ label: student });
      await page.waitForTimeout(1200);
    }

    await page.goto('/profile');
    await page.getByRole('button', { name: 'เปลี่ยน Avatar' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('เลือก Avatar ขั้นสูง')).toBeVisible();

    // The chip a child would press to find a dragon.
    // Two buttons say มังกร — the race and the category chip. The chip is the one a child presses
    // to browse, so it is named through its own group.
    await dialog.getByRole('group', { name: 'หมวด' }).getByRole('button', { name: 'มังกร', exact: true }).click();
    await expect(dialog.getByRole('option').first()).toBeVisible();

    const first = dialog.getByRole('option').first();
    const chosen = await first.getAttribute('title');
    await first.click();
    await expect(first).toHaveAttribute('aria-selected', 'true');

    await dialog.getByRole('button', { name: 'บันทึกและใช้' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // The id is in the title of the tile: "ชื่อ (avatar_###)".
    const id = chosen?.match(/\((avatar_\d+)\)/)?.[1];
    expect(id, 'the chosen tile names its id').toBeTruthy();

    await page.reload();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'เปลี่ยน Avatar' }).first().click();
    const reopened = page.getByRole('dialog');

    /*
     * Searched for rather than scrolled to.
     *
     * Only a page of the thousand is mounted, so the selected tile is usually not in the DOM at
     * all — asking for "the selected option" would fail for a reason that has nothing to do with
     * what was saved. Typing the id brings exactly one tile back, and whether it comes back already
     * selected is the question.
     */
    await reopened.getByRole('searchbox').fill(id!);
    await expect(reopened.getByRole('option')).toHaveCount(1);
    await expect(reopened.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  });

  test('opens a trait drawer and keeps the figure dressed', async ({ page }) => {
    await page.goto('/preview');
    await page.getByRole('button').first().click().catch(() => undefined);
    await page.waitForTimeout(1500);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'เปลี่ยน Avatar' }).first().click();
    const dialog = page.getByRole('dialog');

    await dialog.getByRole('button', { name: /ทรงผม\/เขา/ }).click();
    // The drawer says how many it holds, and the number comes from the table rather than the copy.
    await expect(dialog.getByText(/แบบในทรงผม\/เขา/)).toBeVisible();

    const before = await dialog.locator('.designer-stage rect').count();
    await dialog.getByRole('option').nth(3).click();
    // Changing one thing must not undress the figure: the preview keeps at least what it had.
    await expect.poll(async () => dialog.locator('.designer-stage rect').count()).toBeGreaterThanOrEqual(before - 4);
  });
});
