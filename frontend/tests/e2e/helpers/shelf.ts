import { expect, type Page } from "@playwright/test";

/**
 * Navigate to the shelf root page and wait for book cards to load.
 */
export async function gotoShelf(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid^="book-card-"]').first()).toBeVisible({ timeout: 15000 });
}

/**
 * Import a book file via the sidebar import dialog, using web-first waits.
 * @param importTimeout max ms to wait for import completion ("完成" button)
 */
export async function uploadBook(page: Page, filePath: string, title: string, importTimeout = 15000) {
  await page.click('[data-testid="sidebar-import"]');
  await expect(page.locator('button:has-text("文件")')).toBeVisible({ timeout: 5000 });

  await page.click('button:has-text("文件")');
  await page.locator('input[type="file"]').setInputFiles(filePath);

  const titleInput = page.locator('input').first();
  if (await titleInput.isVisible()) {
    await titleInput.fill(title);
  }

  await page.click('button:has-text("开始导入")');

  const doneBtn = page.locator('button:has-text("完成")');
  if (await doneBtn.isVisible({ timeout: importTimeout }).catch(() => false)) {
    // Start waiting for shelf to refresh BEFORE clicking 完成.
    // The shelf re-fetches GET /api/books after import, and we must wait
    // for that response so openBookByTitle picks the newly uploaded card.
    const booksRefreshed = page.waitForResponse(
      (res) => res.url().includes("/api/books") && res.request().method() === "GET" && res.status() === 200,
      { timeout: importTimeout }
    );
    await doneBtn.click();
    await booksRefreshed;
    await expect(page.locator('[data-testid="sidebar-import"]')).toBeVisible({ timeout: 5000 });
  } else {
    await page.keyboard.press("Escape");
  }
}
