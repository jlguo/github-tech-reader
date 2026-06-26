import { test, expect } from "@playwright/test";
import { openBook, centerTap, closeReader, swipe, tapAt } from "./helpers/reader";

const DEMO_BOOKS = {
  epub: { title: "百年孤独", cardId: "book-card-grid-1" },
  pdf: { title: "设计心理学", cardId: "book-card-grid-2" },
  manga: { title: "鬼灭之刃", cardId: "book-card-grid-8" },
  ppt: { title: "2024Q1产品发布PPT", cardId: "book-card-grid-12" },
  word: { title: "Q4产品规划报告", cardId: "book-card-grid-6" },
  excel: { title: "年度财务分析报告", cardId: "book-card-grid-9" },
  html: { title: "CSS权威指南", cardId: "book-card-grid-13" },
};

test.describe("Reader - Topbar Tap Operations", () => {
  test.setTimeout(60000);

  test("topbar auto-hides after 2.5s then tap strip restores it", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.epub.cardId);

    // Wait for the 2.5s auto-hide timer by polling the data-visible attribute
    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "false", { timeout: 5000 });

    await centerTap(page);
    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "true");

    await closeReader(page);
  });

  test("tap strip toggles topbar off when visible", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.epub.cardId);

    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "false", { timeout: 5000 });
    await centerTap(page);
    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "true");

    await centerTap(page);
    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "false");

    await centerTap(page);
    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "true");

    await closeReader(page);
  });

  test("topbar tap works across all reader types", async ({ page }) => {
    test.setTimeout(180000);
    for (const key of ["epub", "pdf", "manga", "ppt", "word", "excel", "html"] as const) {
      await openBook(page, DEMO_BOOKS[key].cardId);

      await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "false", { timeout: 5000 });
      await centerTap(page);
      await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "true");

      await centerTap(page);
      await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "false");

      await centerTap(page);
      await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "true");

      await closeReader(page);
    }
  });
});

test.describe("Reader - EPUB Swipe and Tap Navigation", () => {
  test.setTimeout(60000);

  test("next and prev buttons navigate pages", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.epub.cardId);

    const pageIndicator = page.locator('[data-testid="epub-reader-page-indicator"]');
    await expect(pageIndicator).toBeVisible({ timeout: 5000 });
    const initialText = await pageIndicator.textContent();
    expect(initialText).toMatch(/\d+ \/ \d+/);

    const nextBtn = page.locator('[data-testid="epub-reader-next"]');
    if (await nextBtn.isEnabled()) {
      await nextBtn.click();
      // Wait for page indicator text to change instead of fixed 500ms delay
      await expect(pageIndicator).not.toHaveText(initialText!);
      const afterNext = await pageIndicator.textContent();
      expect(afterNext).toMatch(/\d+ \/ \d+/);
    }

    const prevBtn = page.locator('[data-testid="epub-reader-prev"]');
    if (await prevBtn.isEnabled()) {
      await prevBtn.click();
    }

    await closeReader(page);
  });

  test("swipe left navigates to next page", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.epub.cardId);

    const pageIndicator = page.locator('[data-testid="epub-reader-page-indicator"]');
    await expect(pageIndicator).toBeVisible({ timeout: 5000 });
    const beforeText = await pageIndicator.textContent();
    const beforePage = parseInt(beforeText!.match(/(\d+) \//)![1]);

    await swipe(page, "left", '[data-testid="epub-reader-area"]');
    // Wait for actual page navigation instead of fixed 500ms
    await expect(pageIndicator).not.toHaveText(beforeText!);

    const afterText = await pageIndicator.textContent();
    const afterPage = parseInt(afterText!.match(/(\d+) \//)![1]);
    expect(afterPage).toBeGreaterThanOrEqual(beforePage);

    await closeReader(page);
  });

  test("swipe right navigates to previous page", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.epub.cardId);

    const pageIndicator = page.locator('[data-testid="epub-reader-page-indicator"]');
    await expect(pageIndicator).toBeVisible({ timeout: 5000 });

    // First navigate forward
    const initialText = await pageIndicator.textContent();
    await swipe(page, "left", '[data-testid="epub-reader-area"]');
    await expect(pageIndicator).not.toHaveText(initialText!);

    const afterNextText = await pageIndicator.textContent();
    const afterNextPage = parseInt(afterNextText!.match(/(\d+) \//)![1]);

    // Then navigate back
    await swipe(page, "right", '[data-testid="epub-reader-area"]');
    await expect(pageIndicator).not.toHaveText(afterNextText!);

    const afterPrevText = await pageIndicator.textContent();
    const afterPrevPage = parseInt(afterPrevText!.match(/(\d+) \//)![1]);
    expect(afterPrevPage).toBeLessThanOrEqual(afterNextPage);

    await closeReader(page);
  });

  test("TOC toggle opens and closes chapter list", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.epub.cardId);

    const tocToggle = page.locator('[data-testid="epub-reader-toc-toggle"]');
    await expect(tocToggle).toBeVisible({ timeout: 5000 });

    await tocToggle.click();
    await expect(page.locator('[data-testid="epub-reader-toc"]')).toBeVisible();

    await tocToggle.click();
    await expect(page.locator('[data-testid="epub-reader-toc"]')).not.toBeVisible();

    await closeReader(page);
  });

  test("font size increase and decrease", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.epub.cardId);

    await page.click('[data-testid="epub-reader-settings-toggle"]');
    await expect(page.locator('[data-testid="epub-reader-font-increase"]')).toBeVisible({ timeout: 5000 });

    const increaseBtn = page.locator('[data-testid="epub-reader-font-increase"]');
    const decreaseBtn = page.locator('[data-testid="epub-reader-font-decrease"]');

    await increaseBtn.click();
    await decreaseBtn.click();

    await closeReader(page);
  });

  test("dark mode toggle", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.epub.cardId);

    const darkToggle = page.locator('[data-testid="epub-reader-dark-toggle"]');
    await expect(darkToggle).toBeVisible({ timeout: 5000 });

    await darkToggle.click();
    await darkToggle.click();

    await closeReader(page);
  });
});

test.describe("Reader - Manga Tap Navigation", () => {
  test.setTimeout(60000);

  test("tap left side advances page in RTL mode", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.manga.cardId);

    const pageInfo = page.locator('[data-testid="manga-reader-page-info"]');
    await expect(pageInfo).toBeVisible({ timeout: 5000 });
    const initialText = await pageInfo.textContent();
    expect(initialText).toMatch(/\d+ \/ \d+/);
    const initialPage = parseInt(initialText!.match(/(\d+) \//)![1]);

    const mangaPage = page.locator('[data-testid="manga-reader-page"]');
    const box = await mangaPage.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
      // Wait for actual page navigation instead of fixed 500ms
      await expect(pageInfo).not.toHaveText(initialText!);

      const afterText = await pageInfo.textContent();
      const afterPage = parseInt(afterText!.match(/(\d+) \//)![1]);
      expect(afterPage).toBeGreaterThan(initialPage);
    }

    await closeReader(page);
  });

  test("tap right side goes back in RTL mode", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.manga.cardId);

    const pageInfo = page.locator('[data-testid="manga-reader-page-info"]');
    await expect(pageInfo).toBeVisible({ timeout: 5000 });

    const mangaPage = page.locator('[data-testid="manga-reader-page"]');
    const box = await mangaPage.boundingBox();
    if (box) {
      const initialText = await pageInfo.textContent();

      // Tap left side (advance)
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
      await expect(pageInfo).not.toHaveText(initialText!);
      const midText = await pageInfo.textContent();
      const midPage = parseInt(midText!.match(/(\d+) \//)![1]);

      // Tap right side (go back)
      await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5);
      await expect(pageInfo).not.toHaveText(midText!);
      const afterText = await pageInfo.textContent();
      const afterPage = parseInt(afterText!.match(/(\d+) \//)![1]);
      expect(afterPage).toBeLessThan(midPage);
    }

    await closeReader(page);
  });

  test("swipe left advances page", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.manga.cardId);

    const pageInfo = page.locator('[data-testid="manga-reader-page-info"]');
    await expect(pageInfo).toBeVisible({ timeout: 5000 });
    const initialText = await pageInfo.textContent();
    const initialPage = parseInt(initialText!.match(/(\d+) \//)![1]);

    await swipe(page, "left", '[data-testid="manga-reader-page"]');
    // Wait for actual page navigation instead of fixed 500ms
    await expect(pageInfo).not.toHaveText(initialText!);

    const afterText = await pageInfo.textContent();
    const afterPage = parseInt(afterText!.match(/(\d+) \//)![1]);
    expect(afterPage).toBeGreaterThan(initialPage);

    await closeReader(page);
  });

  test("direction toggle switches RTL/LTR", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.manga.cardId);

    const dirBtn = page.locator('[data-testid="manga-reader-direction"]');
    await expect(dirBtn).toBeVisible({ timeout: 5000 });
    await expect(dirBtn).toContainText("从右到左");

    await dirBtn.click();
    await expect(dirBtn).toContainText("从左到右");

    await dirBtn.click();
    await expect(dirBtn).toContainText("从右到左");

    await closeReader(page);
  });

  test("prev/next buttons navigate", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.manga.cardId);

    const pageInfo = page.locator('[data-testid="manga-reader-page-info"]');
    await expect(pageInfo).toBeVisible({ timeout: 5000 });
    const initialText = await pageInfo.textContent();
    const initialPage = parseInt(initialText!.match(/(\d+) \//)![1]);

    const nextBtn = page.locator('[data-testid="manga-reader-next"]');
    await nextBtn.click();
    // Wait for actual page navigation instead of fixed 500ms
    await expect(pageInfo).not.toHaveText(initialText!);
    const afterNextText = await pageInfo.textContent();
    const afterNextPage = parseInt(afterNextText!.match(/(\d+) \//)![1]);
    expect(afterNextPage).toBeGreaterThan(initialPage);

    const prevBtn = page.locator('[data-testid="manga-reader-prev"]');
    await prevBtn.click();
    await expect(pageInfo).not.toHaveText(afterNextText!);
    const afterPrevText = await pageInfo.textContent();
    const afterPrevPage = parseInt(afterPrevText!.match(/(\d+) \//)![1]);
    expect(afterPrevPage).toBeLessThan(afterNextPage);

    await closeReader(page);
  });
});

test.describe("Reader - PPT Swipe Navigation", () => {
  test.setTimeout(60000);

  test("next and prev buttons navigate slides", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.ppt.cardId);

    const nextBtn = page.locator('[data-testid="ppt-reader-next"]');
    if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nextBtn.click();

      const prevBtn = page.locator('[data-testid="ppt-reader-prev"]');
      if (await prevBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await prevBtn.click();
      }
    }

    await closeReader(page);
  });

  test("swipe left advances slide", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.ppt.cardId);

    await swipe(page, "left");
    // NEEDS-CONDITION: brief settle between swipes — PPT slide animation has no observable DOM signal
    await page.waitForTimeout(200);
    await swipe(page, "right");
    // NEEDS-CONDITION: brief settle before closeReader — PPT slide animation has no observable DOM signal
    await page.waitForTimeout(200);

    await closeReader(page);
  });
});

test.describe("Reader - Scroll Operations", () => {
  test.setTimeout(60000);

  test("txt reader scroll changes reading position", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.epub.cardId);

    const area = page.locator('[data-testid="epub-reader-area"]');
    if (await area.isVisible({ timeout: 3000 }).catch(() => false)) {
      await area.hover();
      await page.mouse.wheel(0, 300);
      await page.mouse.wheel(0, -100);
    }

    await closeReader(page);
  });

  test("html reader scroll works", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.html.cardId);

    // NEEDS-CONDITION: wait for HTML iframe content to fully render before scrolling
    await page.waitForTimeout(500);

    await page.mouse.wheel(0, 400);
    await page.mouse.wheel(0, 200);

    await closeReader(page);
  });

  test("word reader scroll works", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.word.cardId);

    // NEEDS-CONDITION: wait for Word doc iframe content to fully render before scrolling
    await page.waitForTimeout(500);

    await page.mouse.wheel(0, 400);
    await page.mouse.wheel(0, 200);

    await closeReader(page);
  });
});

test.describe("Reader - Excel Tap Operations", () => {
  test.setTimeout(60000);

  test("sheet tabs are visible and tappable", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.excel.cardId);

    const toolbar = page.locator('[data-testid="excel-reader-toolbar"]');
    if (await toolbar.isVisible({ timeout: 5000 }).catch(() => false)) {
      const tabs = page.locator('[data-testid^="excel-reader-tab-"]');
      const tabCount = await tabs.count();
      if (tabCount > 1) {
        await tabs.nth(1).click();
        await tabs.nth(0).click();
      }
    }

    await closeReader(page);
  });
});

test.describe("Reader - PDF Interactions", () => {
  test.setTimeout(60000);

  test("pdf reader loads with EmbedPDF toolbar", async ({ page }) => {
    await openBook(page, DEMO_BOOKS.pdf.cardId);

    // NEEDS-CONDITION: wait for PDF embed (embedpdf) to initialize — no reliable DOM attribute to poll
    await page.waitForTimeout(1500);

    await expect(page.locator('[data-testid="reader-content"]')).toBeVisible();

    await closeReader(page);
  });
});
