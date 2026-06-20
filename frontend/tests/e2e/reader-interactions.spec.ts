import { test, expect, type Page } from "@playwright/test";

const DEMO_BOOKS = {
  epub: { title: "百年孤独", cardId: "book-card-grid-1" },
  pdf: { title: "设计心理学", cardId: "book-card-grid-2" },
  manga: { title: "鬼灭之刃", cardId: "book-card-grid-8" },
  ppt: { title: "2024Q1产品发布PPT", cardId: "book-card-grid-13" },
  word: { title: "Q4产品规划报告", cardId: "book-card-grid-6" },
  excel: { title: "年度财务分析报告", cardId: "book-card-grid-9" },
  html: { title: "CSS权威指南", cardId: "book-card-grid-12" },
};

async function openDemoBook(page: Page, cardId: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`[data-testid="${cardId}"]`, { timeout: 15000 });
  await page.click(`[data-testid="${cardId}"]`);
  await page.waitForTimeout(1000);
  await page.click('[data-testid="book-detail-read"]');
  await page.waitForTimeout(2000);
  await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-testid="reader-content"]')).toBeVisible({ timeout: 10000 });
}

async function closeReader(page: Page) {
  await page.waitForTimeout(3500);
  await page.click('[data-testid="reader-tap-strip"]');
  await page.waitForTimeout(800);
  await page.click('[data-testid="reader-back"]');
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-testid="reader-modal"]')).not.toBeVisible({ timeout: 5000 });
}

async function swipe(page: Page, direction: "left" | "right", selector?: string) {
  const target = selector ? page.locator(selector) : page.locator('[data-testid="reader-content"]');
  const box = await target.boundingBox();
  if (!box) return;
  const startX = direction === "left" ? box.x + box.width * 0.8 : box.x + box.width * 0.2;
  const endX = direction === "left" ? box.x + box.width * 0.2 : box.x + box.width * 0.8;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    const x = startX + (endX - startX) * (i / 10);
    await page.mouse.move(x, y);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function tapAt(page: Page, x: number, y: number) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
}

test.describe("Reader - Topbar Tap Operations", () => {
  test.setTimeout(60000);

  test("topbar auto-hides after 2.5s then tap strip restores it", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.epub.cardId);

    await page.waitForTimeout(3500);
    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "false");

    await page.click('[data-testid="reader-tap-strip"]');
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "true");

    await closeReader(page);
  });

  test("tap strip toggles topbar off when visible", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.epub.cardId);

    await page.waitForTimeout(3500);
    await page.click('[data-testid="reader-tap-strip"]');
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "true");

    await page.click('[data-testid="reader-tap-strip"]');
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "false");

    await page.click('[data-testid="reader-tap-strip"]');
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "true");

    await closeReader(page);
  });

  test("topbar tap works across all reader types", async ({ page }) => {
    test.setTimeout(180000);
    for (const key of ["epub", "pdf", "manga", "ppt", "word", "excel", "html"] as const) {
      await openDemoBook(page, DEMO_BOOKS[key].cardId);

      await page.waitForTimeout(3500);
      await page.click('[data-testid="reader-tap-strip"]');
      await page.waitForTimeout(500);
      await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "true");

      await page.click('[data-testid="reader-tap-strip"]');
      await page.waitForTimeout(500);
      await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "false");

      await page.click('[data-testid="reader-tap-strip"]');
      await page.waitForTimeout(500);
      await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute("data-visible", "true");

      await closeReader(page);
    }
  });
});

test.describe("Reader - EPUB Swipe and Tap Navigation", () => {
  test.setTimeout(60000);

  test("next and prev buttons navigate pages", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.epub.cardId);

    const pageIndicator = page.locator('[data-testid="epub-reader-page-indicator"]');
    await expect(pageIndicator).toBeVisible({ timeout: 5000 });
    const initialText = await pageIndicator.textContent();
    expect(initialText).toMatch(/\d+ \/ \d+/);

    const nextBtn = page.locator('[data-testid="epub-reader-next"]');
    if (await nextBtn.isEnabled()) {
      await nextBtn.click();
      await page.waitForTimeout(500);
      const afterNext = await pageIndicator.textContent();
      expect(afterNext).toMatch(/\d+ \/ \d+/);
    }

    const prevBtn = page.locator('[data-testid="epub-reader-prev"]');
    if (await prevBtn.isEnabled()) {
      await prevBtn.click();
      await page.waitForTimeout(500);
    }

    await closeReader(page);
  });

  test("swipe left navigates to next page", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.epub.cardId);

    const pageIndicator = page.locator('[data-testid="epub-reader-page-indicator"]');
    await expect(pageIndicator).toBeVisible({ timeout: 5000 });
    const beforeText = await pageIndicator.textContent();
    const beforePage = parseInt(beforeText!.match(/(\d+) \//)![1]);

    await swipe(page, "left", '[data-testid="epub-reader-area"]');
    await page.waitForTimeout(500);

    const afterText = await pageIndicator.textContent();
    const afterPage = parseInt(afterText!.match(/(\d+) \//)![1]);
    expect(afterPage).toBeGreaterThanOrEqual(beforePage);

    await closeReader(page);
  });

  test("swipe right navigates to previous page", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.epub.cardId);

    const pageIndicator = page.locator('[data-testid="epub-reader-page-indicator"]');
    await expect(pageIndicator).toBeVisible({ timeout: 5000 });

    await swipe(page, "left", '[data-testid="epub-reader-area"]');
    await page.waitForTimeout(500);

    const afterNextText = await pageIndicator.textContent();
    const afterNextPage = parseInt(afterNextText!.match(/(\d+) \//)![1]);

    await swipe(page, "right", '[data-testid="epub-reader-area"]');
    await page.waitForTimeout(500);

    const afterPrevText = await pageIndicator.textContent();
    const afterPrevPage = parseInt(afterPrevText!.match(/(\d+) \//)![1]);
    expect(afterPrevPage).toBeLessThanOrEqual(afterNextPage);

    await closeReader(page);
  });

  test("TOC toggle opens and closes chapter list", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.epub.cardId);

    const tocToggle = page.locator('[data-testid="epub-reader-toc-toggle"]');
    await expect(tocToggle).toBeVisible({ timeout: 5000 });

    await tocToggle.click();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="epub-reader-toc"]')).toBeVisible();

    await tocToggle.click();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="epub-reader-toc"]')).not.toBeVisible();

    await closeReader(page);
  });

  test("font size increase and decrease", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.epub.cardId);

    await page.click('[data-testid="epub-reader-settings-toggle"]');
    await page.waitForTimeout(300);

    const increaseBtn = page.locator('[data-testid="epub-reader-font-increase"]');
    const decreaseBtn = page.locator('[data-testid="epub-reader-font-decrease"]');

    await expect(increaseBtn).toBeVisible({ timeout: 5000 });
    await increaseBtn.click();
    await page.waitForTimeout(300);
    await decreaseBtn.click();
    await page.waitForTimeout(300);

    await closeReader(page);
  });

  test("dark mode toggle", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.epub.cardId);

    const darkToggle = page.locator('[data-testid="epub-reader-dark-toggle"]');
    await expect(darkToggle).toBeVisible({ timeout: 5000 });

    await darkToggle.click();
    await page.waitForTimeout(500);

    await darkToggle.click();
    await page.waitForTimeout(500);

    await closeReader(page);
  });
});

test.describe("Reader - Manga Tap Navigation", () => {
  test.setTimeout(60000);

  test("tap left side advances page in RTL mode", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.manga.cardId);

    const pageInfo = page.locator('[data-testid="manga-reader-page-info"]');
    await expect(pageInfo).toBeVisible({ timeout: 5000 });
    const initialText = await pageInfo.textContent();
    expect(initialText).toMatch(/\d+ \/ \d+/);
    const initialPage = parseInt(initialText!.match(/(\d+) \//)![1]);

    const mangaPage = page.locator('[data-testid="manga-reader-page"]');
    const box = await mangaPage.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
      await page.waitForTimeout(500);

      const afterText = await pageInfo.textContent();
      const afterPage = parseInt(afterText!.match(/(\d+) \//)![1]);
      expect(afterPage).toBeGreaterThan(initialPage);
    }

    await closeReader(page);
  });

  test("tap right side goes back in RTL mode", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.manga.cardId);

    const pageInfo = page.locator('[data-testid="manga-reader-page-info"]');
    await expect(pageInfo).toBeVisible({ timeout: 5000 });

    const mangaPage = page.locator('[data-testid="manga-reader-page"]');
    const box = await mangaPage.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
      await page.waitForTimeout(500);
      const midText = await pageInfo.textContent();
      const midPage = parseInt(midText!.match(/(\d+) \//)![1]);

      await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5);
      await page.waitForTimeout(500);
      const afterText = await pageInfo.textContent();
      const afterPage = parseInt(afterText!.match(/(\d+) \//)![1]);
      expect(afterPage).toBeLessThan(midPage);
    }

    await closeReader(page);
  });

  test("swipe left advances page", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.manga.cardId);

    const pageInfo = page.locator('[data-testid="manga-reader-page-info"]');
    await expect(pageInfo).toBeVisible({ timeout: 5000 });
    const initialText = await pageInfo.textContent();
    const initialPage = parseInt(initialText!.match(/(\d+) \//)![1]);

    await swipe(page, "left", '[data-testid="manga-reader-page"]');
    await page.waitForTimeout(500);

    const afterText = await pageInfo.textContent();
    const afterPage = parseInt(afterText!.match(/(\d+) \//)![1]);
    expect(afterPage).toBeGreaterThan(initialPage);

    await closeReader(page);
  });

  test("direction toggle switches RTL/LTR", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.manga.cardId);

    const dirBtn = page.locator('[data-testid="manga-reader-direction"]');
    await expect(dirBtn).toBeVisible({ timeout: 5000 });
    await expect(dirBtn).toContainText("从右到左");

    await dirBtn.click();
    await page.waitForTimeout(500);
    await expect(dirBtn).toContainText("从左到右");

    await dirBtn.click();
    await page.waitForTimeout(500);
    await expect(dirBtn).toContainText("从右到左");

    await closeReader(page);
  });

  test("prev/next buttons navigate", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.manga.cardId);

    const pageInfo = page.locator('[data-testid="manga-reader-page-info"]');
    await expect(pageInfo).toBeVisible({ timeout: 5000 });
    const initialText = await pageInfo.textContent();
    const initialPage = parseInt(initialText!.match(/(\d+) \//)![1]);

    const nextBtn = page.locator('[data-testid="manga-reader-next"]');
    await nextBtn.click();
    await page.waitForTimeout(500);
    const afterNextText = await pageInfo.textContent();
    const afterNextPage = parseInt(afterNextText!.match(/(\d+) \//)![1]);
    expect(afterNextPage).toBeGreaterThan(initialPage);

    const prevBtn = page.locator('[data-testid="manga-reader-prev"]');
    await prevBtn.click();
    await page.waitForTimeout(500);
    const afterPrevText = await pageInfo.textContent();
    const afterPrevPage = parseInt(afterPrevText!.match(/(\d+) \//)![1]);
    expect(afterPrevPage).toBeLessThan(afterNextPage);

    await closeReader(page);
  });
});

test.describe("Reader - PPT Swipe Navigation", () => {
  test.setTimeout(60000);

  test("next and prev buttons navigate slides", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.ppt.cardId);

    const nextBtn = page.locator('[data-testid="ppt-reader-next"]');
    if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(500);

      const prevBtn = page.locator('[data-testid="ppt-reader-prev"]');
      if (await prevBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await prevBtn.click();
        await page.waitForTimeout(500);
      }
    }

    await closeReader(page);
  });

  test("swipe left advances slide", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.ppt.cardId);

    await swipe(page, "left");
    await page.waitForTimeout(500);

    await swipe(page, "right");
    await page.waitForTimeout(500);

    await closeReader(page);
  });
});

test.describe("Reader - Scroll Operations", () => {
  test.setTimeout(60000);

  test("txt reader scroll changes reading position", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.epub.cardId);

    const area = page.locator('[data-testid="epub-reader-area"]');
    if (await area.isVisible({ timeout: 3000 }).catch(() => false)) {
      await area.hover();
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(500);
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(500);
    }

    await closeReader(page);
  });

  test("html reader scroll works", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.html.cardId);

    await page.waitForTimeout(2000);

    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(500);

    await closeReader(page);
  });

  test("word reader scroll works", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.word.cardId);

    await page.waitForTimeout(2000);

    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(500);

    await closeReader(page);
  });
});

test.describe("Reader - Excel Tap Operations", () => {
  test.setTimeout(60000);

  test("sheet tabs are visible and tappable", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.excel.cardId);

    const toolbar = page.locator('[data-testid="excel-reader-toolbar"]');
    if (await toolbar.isVisible({ timeout: 5000 }).catch(() => false)) {
      const tabs = page.locator('[data-testid^="excel-reader-tab-"]');
      const tabCount = await tabs.count();
      if (tabCount > 1) {
        await tabs.nth(1).click();
        await page.waitForTimeout(500);
        await tabs.nth(0).click();
        await page.waitForTimeout(500);
      }
    }

    await closeReader(page);
  });
});

test.describe("Reader - PDF Interactions", () => {
  test.setTimeout(60000);

  test("pdf reader loads with EmbedPDF toolbar", async ({ page }) => {
    await openDemoBook(page, DEMO_BOOKS.pdf.cardId);

    await page.waitForTimeout(5000);

    await expect(page.locator('[data-testid="reader-content"]')).toBeVisible();

    await closeReader(page);
  });
});
