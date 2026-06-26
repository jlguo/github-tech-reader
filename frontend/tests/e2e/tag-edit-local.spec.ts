import { test, expect, type Page } from "@playwright/test";
import { generateTestFiles, type TestFile } from "./fixtures/generate";

let testFiles: Record<string, TestFile>;

test.beforeAll(async () => {
  testFiles = await generateTestFiles();
});

const BOOK_TITLE = "test";
const NEW_TAG = "分布式系统";

async function uploadHtml(page: Page) {
  await page.click('[data-testid="sidebar-import"]');
  await expect(page.locator('button:has-text("上传文件")')).toBeVisible({ timeout: 5000 });
  await page.click('button:has-text("上传文件")');
  await page.locator('input[type="file"]').setInputFiles(testFiles.html.path);
  await page.click('button:has-text("开始导入")');
  const doneBtn = page.locator('button:has-text("完成")');
  await expect(doneBtn).toBeVisible({ timeout: 15000 });
  await doneBtn.click();
  await expect(page.locator('[data-testid="sidebar-import"]')).toBeVisible({ timeout: 5000 });
}

async function openDetail(page: Page) {
  const card = page.locator('[data-testid^="book-card-"]', { hasText: BOOK_TITLE }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
  await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible({ timeout: 10000 });
}

test.describe("Tag editing persists in local mode", () => {
  test.setTimeout(120000);

  test("added tag survives a full page reload", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid^="book-card-"]').first()).toBeVisible({ timeout: 15000 });

    await uploadHtml(page);
    await openDetail(page);

    await page.locator('[data-testid="book-detail-tag-input"]').fill(NEW_TAG);
    await page.locator('[data-testid="book-detail-tag-add"]').click();
    await expect(page.locator(`[data-testid="book-detail-tag-${NEW_TAG}"]`)).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid^="book-card-"]').first()).toBeVisible({ timeout: 15000 });

    await openDetail(page);
    await expect(page.locator(`[data-testid="book-detail-tag-${NEW_TAG}"]`)).toBeVisible({ timeout: 5000 });
  });
});
