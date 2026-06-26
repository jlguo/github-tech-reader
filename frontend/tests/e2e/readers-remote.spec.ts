import { test, expect } from "@playwright/test";
import { generateTestFiles, type TestFile } from "./fixtures/generate";
import { uploadBook } from "./helpers/shelf";
import { closeReader, openBookByTitle } from "./helpers/reader";

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

test.describe("Readers - Remote Mode", () => {
  test.setTimeout(180000);

  for (const bt of BOOK_TYPES) {
    test(`upload and read ${bt.ext} file`, async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-testid^="book-card-"]').first()).toBeVisible({ timeout: 15000 });

      await uploadBook(page, testFiles[bt.ext].path, bt.name);

      await openBookByTitle(page, bt.name);

      await expect(page.locator('[data-testid="reader-title"]')).toContainText(bt.name, { timeout: 10000 });
      await expect(page.locator('[data-testid="reader-type-badge"]')).toContainText(bt.badge);

      const readerText = await page.locator('[data-testid="reader-modal"]').textContent() ?? "";
      expect(readerText).not.toMatch(/失败|Failed to load|Error loading/);

      await closeReader(page);
    });
  }

  test("reading progress persists after closing and reopening", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid^="book-card-"]').first()).toBeVisible({ timeout: 15000 });

    await uploadBook(page, testFiles.txt.path, "test");

    await openBookByTitle(page, "test");

    const readerContent = page.locator('[data-testid="reader-content"]');
    await readerContent.hover();
    await page.mouse.wheel(0, 300);
    await expect(readerContent).toBeVisible({ timeout: 5000 });

    await closeReader(page);

    // Navigate back to shelf (closeReader leaves the detail panel open)
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid^="book-card-"]').first()).toBeVisible({ timeout: 15000 });

    await openBookByTitle(page, "test");

    await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 10000 });

    await closeReader(page);
  });
});
