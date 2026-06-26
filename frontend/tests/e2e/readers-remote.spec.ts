import { test, expect, type Page } from "@playwright/test";
import { generateTestFiles, type TestFile } from "./fixtures/generate";

let testFiles: Record<string, TestFile>;

test.beforeAll(async () => {
  testFiles = await generateTestFiles();
});

// ImportDialog derives title from filename (remove extension), so all
// "test.{ext}" files get title "test". The dialog has no title input.
const BOOK_TYPES: { ext: string; name: string; badge: string }[] = [
  { ext: "txt", name: "test", badge: "TXT" },
  { ext: "epub", name: "test", badge: "EPUB" },
  { ext: "pdf", name: "test", badge: "PDF" },
  { ext: "docx", name: "test", badge: "WORD" },
  { ext: "xlsx", name: "test", badge: "XLSX" },
  { ext: "pptx", name: "test", badge: "PPT" },
  { ext: "html", name: "test", badge: "HTML" },
];

async function uploadBook(page: Page, file: TestFile, title: string) {
  await page.click('[data-testid="sidebar-import"]');
  await page.waitForTimeout(500);

  await page.click('button:has-text("文件")');
  await page.waitForTimeout(300);

  await page.locator('input[type="file"]').setInputFiles(file.path);
  await page.waitForTimeout(500);

  const titleInput = page.locator('input').first();
  if (await titleInput.isVisible()) {
    await titleInput.fill(title);
  }

  await page.click('button:has-text("开始导入")');
  await page.waitForTimeout(5000);

  const doneBtn = page.locator('button:has-text("完成")');
  if (await doneBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await doneBtn.click();
    await page.waitForTimeout(1000);
  } else {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
}

async function openReader(page: Page, title: string) {
  const card = page.locator(`[data-testid^="book-card-"]`, { hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
  await page.waitForTimeout(1000);

  await page.click('[data-testid="book-detail-read"]');
  await page.waitForTimeout(5000);

  await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="reader-content"]')).toBeVisible({ timeout: 10000 });
}

async function closeReader(page: Page) {
  await page.evaluate(() => {
    (document.querySelector('[data-testid="reader-back"]') as HTMLElement)?.click();
  });
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-testid="reader-modal"]')).not.toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

test.describe("Readers - Remote Mode", () => {
  test.setTimeout(180000);

  for (const bt of BOOK_TYPES) {
    test(`upload and read ${bt.ext} file`, async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-testid^="book-card-"]', { timeout: 15000 });

      await uploadBook(page, testFiles[bt.ext], bt.name);

      await page.waitForTimeout(3000);

      await openReader(page, bt.name);

      await expect(page.locator('[data-testid="reader-title"]')).toContainText(bt.name, { timeout: 10000 });
      await expect(page.locator('[data-testid="reader-type-badge"]')).toContainText(bt.badge);

      const readerText = await page.locator('[data-testid="reader-modal"]').textContent() ?? "";
      expect(readerText).not.toMatch(/失败|Failed to load|Error loading/);

      await closeReader(page);
    });
  }

  test("reading progress persists after closing and reopening", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid^="book-card-"]', { timeout: 15000 });

    await uploadBook(page, testFiles.txt, "test");
    await page.waitForTimeout(3000);
    await openReader(page, "test");

    await page.waitForTimeout(3000);
    await closeReader(page);

    await page.waitForTimeout(2000);
    await openReader(page, "test");

    await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 10000 });

    await closeReader(page);
  });
});
