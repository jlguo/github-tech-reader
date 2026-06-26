import { test, expect } from "@playwright/test";
import { generateTestFiles, type TestFile } from "./fixtures/generate";
import { uploadBook } from "./helpers/shelf";
import { centerTap, closeReader, openBookByTitle } from "./helpers/reader";

let testFiles: Record<string, TestFile>;

test.beforeAll(async () => {
  testFiles = await generateTestFiles();
});

// ImportDialog derives title from filename (remove extension), so all
// "test.{ext}" files get title "test". The dialog has no title input.
const BOOK_TYPES: { ext: string; name: string; badge: string; testIdPrefix: string }[] = [
  { ext: "txt", name: "test", badge: "TXT", testIdPrefix: "txt-reader" },
  { ext: "epub", name: "test", badge: "EPUB", testIdPrefix: "epub-reader" },
  { ext: "pdf", name: "test", badge: "PDF", testIdPrefix: "" },
  { ext: "docx", name: "test", badge: "WORD", testIdPrefix: "doc-reader" },
  { ext: "xlsx", name: "test", badge: "XLSX", testIdPrefix: "excel-reader" },
  { ext: "pptx", name: "test", badge: "PPT", testIdPrefix: "ppt-reader" },
  { ext: "html", name: "test", badge: "HTML", testIdPrefix: "" },
];

test.describe("Readers - Local Mode", () => {
  test.setTimeout(120000);

  for (const bt of BOOK_TYPES) {
    test(`upload and read ${bt.ext} file`, async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-testid^="book-card-"]').first()).toBeVisible({ timeout: 15000 });

      await uploadBook(page, testFiles[bt.ext].path, bt.name);

      await openBookByTitle(page, bt.name);

      await expect(page.locator('[data-testid="reader-title"]')).toContainText(bt.name, { timeout: 5000 });
      await expect(page.locator('[data-testid="reader-type-badge"]')).toContainText(bt.badge);

      const readerText = await page.locator('[data-testid="reader-modal"]').textContent() ?? "";
      expect(readerText).not.toMatch(/失败|Failed to load|Error loading/);

      await closeReader(page);
    });
  }

  test("epub reader shows TOC and navigation", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid^="book-card-"]').first()).toBeVisible({ timeout: 15000 });

    await uploadBook(page, testFiles.epub.path, "test");

    await openBookByTitle(page, "test");

    const tocToggle = page.locator('[data-testid="epub-reader-toc-toggle"]');
    if (await tocToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tocToggle.click();
    }

    await expect(page.locator('[data-testid="epub-reader-area"]')).toBeVisible({ timeout: 5000 });

    const nextBtn = page.locator('[data-testid="epub-reader-next"]');
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
      // Wait for next chapter content to render after navigation
      await expect(page.locator('[data-testid="epub-reader-area"]')).toBeVisible({ timeout: 5000 });
    }

    await closeReader(page);
  });

  test("txt reader font size and dark mode", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid^="book-card-"]').first()).toBeVisible({ timeout: 15000 });

    await uploadBook(page, testFiles.txt.path, "test");

    await openBookByTitle(page, "test");

    const fontIncrease = page.locator('[data-testid="txt-reader-font-increase"]');
    if (await fontIncrease.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fontIncrease.click();
    }

    const darkToggle = page.locator('[data-testid="txt-reader-dark-toggle"]');
    if (await darkToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await darkToggle.click();
    }

    await closeReader(page);
  });

  test("topbar auto-hides and tap toggles", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid^="book-card-"]').first()).toBeVisible({ timeout: 15000 });

    await uploadBook(page, testFiles.txt.path, "test");

    await openBookByTitle(page, "test");

    await expect(page.locator('[data-testid="reader-topbar"]')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "false", { timeout: 7000 });

    await centerTap(page);
    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "true", { timeout: 3000 });

    await centerTap(page);
    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "false", { timeout: 3000 });

    await closeReader(page);
  });
});
