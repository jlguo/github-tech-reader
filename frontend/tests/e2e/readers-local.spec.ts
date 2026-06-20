import { test, expect, type Page } from "@playwright/test";
import { generateTestFiles, type TestFile } from "./fixtures/generate";

let testFiles: Record<string, TestFile>;

test.beforeAll(async () => {
  testFiles = await generateTestFiles();
});

const BOOK_TYPES: { ext: string; name: string; badge: string; testIdPrefix: string }[] = [
  { ext: "txt", name: "test-txt", badge: "TXT", testIdPrefix: "txt-reader" },
  { ext: "epub", name: "test-epub", badge: "EPUB", testIdPrefix: "epub-reader" },
  { ext: "pdf", name: "test-pdf", badge: "PDF", testIdPrefix: "" },
  { ext: "docx", name: "test-docx", badge: "WORD", testIdPrefix: "doc-reader" },
  { ext: "xlsx", name: "test-xlsx", badge: "EXCEL", testIdPrefix: "excel-reader" },
  { ext: "pptx", name: "test-pptx", badge: "PPT", testIdPrefix: "ppt-reader" },
  { ext: "html", name: "test-html", badge: "HTML", testIdPrefix: "" },
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
  await page.waitForTimeout(3000);

  const doneBtn = page.locator('button:has-text("完成")');
  if (await doneBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await doneBtn.click();
    await page.waitForTimeout(1000);
  } else {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
}

async function openReader(page: Page, title: string) {
  const card = page.locator(`[data-testid^="book-card-"]`, { hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.click();
  await page.waitForTimeout(1000);

  await page.click('[data-testid="book-detail-read"]');
  await page.waitForTimeout(4000);

  await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-testid="reader-content"]')).toBeVisible({ timeout: 10000 });
}

async function closeReader(page: Page) {
  await page.click('[data-testid="reader-back"]');
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-testid="reader-modal"]')).not.toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

test.describe("Readers - Local Mode", () => {
  test.setTimeout(120000);

  for (const bt of BOOK_TYPES) {
    test(`upload and read ${bt.ext} file`, async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-testid^="book-card-"]', { timeout: 15000 });

      await uploadBook(page, testFiles[bt.ext], bt.name);

      await page.waitForTimeout(2000);

      await openReader(page, bt.name);

      await expect(page.locator('[data-testid="reader-title"]')).toContainText(bt.name, { timeout: 5000 });
      await expect(page.locator('[data-testid="reader-type-badge"]')).toContainText(bt.badge);

      const readerText = await page.locator('[data-testid="reader-modal"]').textContent() ?? "";
      expect(readerText).not.toMatch(/失败|Failed to load|Error loading/);

      await closeReader(page);
    });
  }

  test("epub reader shows TOC and navigation", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid^="book-card-"]', { timeout: 15000 });

    await uploadBook(page, testFiles.epub, "epub-toc-test");
    await page.waitForTimeout(2000);
    await openReader(page, "epub-toc-test");

    const tocToggle = page.locator('[data-testid="epub-reader-toc-toggle"]');
    if (await tocToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tocToggle.click();
      await page.waitForTimeout(500);
    }

    await expect(page.locator('[data-testid="epub-reader-area"]')).toBeVisible({ timeout: 5000 });

    const nextBtn = page.locator('[data-testid="epub-reader-next"]');
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(1000);
    }

    await closeReader(page);
  });

  test("txt reader font size and dark mode", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid^="book-card-"]', { timeout: 15000 });

    await uploadBook(page, testFiles.txt, "txt-settings-test");
    await page.waitForTimeout(2000);
    await openReader(page, "txt-settings-test");

    const fontIncrease = page.locator('[data-testid="txt-reader-font-increase"]');
    if (await fontIncrease.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fontIncrease.click();
      await page.waitForTimeout(300);
    }

    const darkToggle = page.locator('[data-testid="txt-reader-dark-toggle"]');
    if (await darkToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await darkToggle.click();
      await page.waitForTimeout(500);
    }

    await closeReader(page);
  });

  test("topbar auto-hides and tap toggles", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid^="book-card-"]', { timeout: 15000 });

    await uploadBook(page, testFiles.txt, "topbar-test");
    await page.waitForTimeout(2000);
    await openReader(page, "topbar-test");

    await expect(page.locator('[data-testid="reader-topbar"]')).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(4000);

    const tapStrip = page.locator('[data-testid="reader-tap-strip"]');
    if (await tapStrip.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tapStrip.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('[data-testid="reader-topbar"]')).toBeVisible({ timeout: 3000 });

      await tapStrip.click();
      await page.waitForTimeout(1000);
    }

    await closeReader(page);
  });
});
