import { test, type Page } from "@playwright/test";

const DEMO = {
  pdf: "book-card-grid-2",
  epub: "book-card-grid-1",
  manga: "book-card-grid-8",
  ppt: "book-card-grid-12",
  excel: "book-card-grid-9",
};

test.describe("Product Demo Walkthrough", () => {
  test.setTimeout(360000);

  async function beat(page: Page, ms = 900) {
    await page.waitForTimeout(ms);
  }

  async function hoverClick(page: Page, selector: string, settle = 700) {
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    await el.hover({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(250);
    await el.click({ timeout: 6000 });
    await beat(page, settle);
  }

  async function softClick(page: Page, selector: string, settle = 700) {
    const el = page.locator(selector).first();
    if (!(await el.isVisible().catch(() => false))) return false;
    if (!(await el.isEnabled().catch(() => false))) return false;
    await el.hover({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
    await el.click({ timeout: 4000 }).catch(() => {});
    await beat(page, settle);
    return true;
  }

  async function swipe(page: Page, direction: "left" | "right", selector: string) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) return;
    const startX = direction === "left" ? box.x + box.width * 0.8 : box.x + box.width * 0.2;
    const endX = direction === "left" ? box.x + box.width * 0.2 : box.x + box.width * 0.8;
    const y = box.y + box.height * 0.5;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(startX + (endX - startX) * (i / 10), y);
    }
    await page.mouse.up();
    await beat(page, 800);
  }

  async function tapAt(page: Page, selector: string, fx: number) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) return;
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * 0.5);
    await beat(page, 700);
  }

  async function step(name: string) {
    console.log(`[STEP] ${name} @ ${(Date.now() / 1000).toFixed(1)}`);
  }

  async function openReader(page: Page, cardId: string) {
    await step(`openReader ${cardId}`);
    await page.waitForSelector('[data-testid="book-grid"]', { timeout: 10000 }).catch(() => {});
    await hoverClick(page, '[data-testid="sidebar-category-all"]', 600);
    await page.waitForSelector(`[data-testid="${cardId}"]`, { timeout: 10000 });
    await hoverClick(page, `[data-testid="${cardId}"]`, 700);
    await page.waitForSelector('[data-testid="book-detail-content"]', { timeout: 8000 });
    await hoverClick(page, '[data-testid="book-detail-read"]', 300);
    await page.waitForSelector('[data-testid="reader-modal"]', { timeout: 12000 });
    await page.waitForSelector('[data-testid="reader-content"]', { timeout: 12000 });
    await step(`reader-open ${cardId}`);
    await beat(page, 1400);
  }

  async function centerTap(page: Page) {
    const box = await page.locator('[data-testid="reader-content"]').boundingBox();
    if (!box) return;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await beat(page, 600);
  }

  async function closeReader(page: Page) {
    const modal = page.locator('[data-testid="reader-modal"]');
    const back = page.locator('[data-testid="reader-back"]').first();
    const topbar = page.locator('[data-testid="reader-topbar"]');
    for (let attempt = 0; attempt < 5; attempt++) {
      if ((await topbar.getAttribute("data-visible").catch(() => null)) !== "true") {
        await centerTap(page);
      }
      await back.click({ timeout: 3000 }).catch(() => {});
      const hidden = await modal.waitFor({ state: "hidden", timeout: 2500 }).then(() => true).catch(() => false);
      if (hidden) break;
    }
    await beat(page, 800);
  }

  test("full feature happy-path walkthrough", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="header-bar"]', { timeout: 15000 });
    await page.waitForSelector('[data-testid^="book-card-grid-"]', { timeout: 15000 });
    await beat(page, 1200);

    await hoverClick(page, '[data-testid="view-mode-list"]', 600);
    await page.waitForSelector('[data-testid="book-list"]');
    await beat(page, 700);
    await hoverClick(page, '[data-testid="view-mode-grid"]', 500);
    await page.waitForSelector('[data-testid="book-grid"]');
    await beat(page, 600);

    const search = page.locator('[data-testid="search-input"]');
    await search.click();
    await search.type("设计", { delay: 140 });
    await beat(page, 900);
    await search.fill("");
    await beat(page, 500);

    await hoverClick(page, '[data-testid="sort-toggle"]', 500);
    await page.waitForSelector('[data-testid="sort-menu"]');
    await beat(page, 500);
    await hoverClick(page, '[data-testid="sort-option-title"]', 700);

    await hoverClick(page, '[data-testid="sidebar-import"]', 600);
    await page.waitForSelector('[data-testid="import-dialog-content"]', { timeout: 5000 });
    await step("import-dialog");
    await beat(page, 800);
    await hoverClick(page, 'button:has-text("GitHub")', 400);
    await page.locator('[data-testid="import-dialog-input"]').first().fill("facebook/react");
    await beat(page, 800);
    await hoverClick(page, 'button:has-text("YouTube")', 400);
    await page.locator('[data-testid="import-dialog-input"]').first().fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await beat(page, 800);
    await hoverClick(page, 'button:has-text("上传文件")', 600);
    await beat(page, 600);
    await hoverClick(page, 'button:has-text("网页链接")', 400);
    await page.locator('[data-testid="import-dialog-input"]').first().fill("https://example.com/article");
    await beat(page, 800);
    await hoverClick(page, '[data-testid="import-dialog-close"]', 700);

    await hoverClick(page, '[data-testid="book-card-grid-2"]', 700);
    await page.waitForSelector('[data-testid="book-detail-content"]');
    await step("detail-edit");
    await hoverClick(page, '[data-testid="book-detail-favorite"]', 600);
    await hoverClick(page, '[data-testid="book-detail-favorite"]', 500);
    await hoverClick(page, '[data-testid="book-detail-edit"]', 600);
    const textarea = page.locator('[data-testid="book-detail-edit-textarea"]');
    await textarea.click();
    await textarea.fill("一本关于日常设计的经典之作。");
    await beat(page, 700);
    await hoverClick(page, '[data-testid="book-detail-edit-save"]', 700);
    await hoverClick(page, '[data-testid="book-detail-close"]', 700);

    await hoverClick(page, '[data-testid="sidebar-nav-favorites"]', 1000);
    await step("favorites");
    const docsCat = page.locator('[data-testid="sidebar-category-documents"]');
    if (await docsCat.isVisible().catch(() => false)) {
      await hoverClick(page, '[data-testid="sidebar-category-documents"]', 1000);
    }

    await hoverClick(page, '[data-testid="sidebar-manage-categories"]', 800);
    await page.waitForSelector('[data-testid="category-manager"]', { timeout: 5000 });
    await beat(page, 900);
    const newToggle = page.locator('[data-testid="category-new-toggle"]');
    if (await newToggle.isVisible().catch(() => false)) {
      await hoverClick(page, '[data-testid="category-new-toggle"]', 800);
      await softClick(page, '[data-testid="category-new-close"]', 500);
    }
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="category-manager"]').waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await beat(page, 500);

    await openReader(page, DEMO.epub);
    await centerTap(page);
    await swipe(page, "left", '[data-testid="epub-reader-area"]');
    await swipe(page, "left", '[data-testid="epub-reader-area"]');
    await softClick(page, '[data-testid="epub-reader-prev"]', 800);
    const tocToggle = page.locator('[data-testid="epub-reader-toc-toggle"]');
    if (await tocToggle.isVisible().catch(() => false)) {
      await hoverClick(page, '[data-testid="epub-reader-toc-toggle"]', 1100);
      await tocToggle.click().catch(() => {});
      await beat(page, 600);
    }
    const settings = page.locator('[data-testid="epub-reader-settings-toggle"]');
    if (await settings.isVisible().catch(() => false)) {
      await hoverClick(page, '[data-testid="epub-reader-settings-toggle"]', 600);
      await softClick(page, '[data-testid="epub-reader-font-increase"]', 600);
      await softClick(page, '[data-testid="epub-reader-font-increase"]', 700);
      await settings.click().catch(() => {});
      await beat(page, 500);
    }
    await softClick(page, '[data-testid="epub-reader-dark-toggle"]', 1100);
    await closeReader(page);

    await openReader(page, DEMO.pdf);
    await beat(page, 2500);
    await closeReader(page);

    await openReader(page, DEMO.manga);
    await tapAt(page, '[data-testid="manga-reader-page"]', 0.3);
    await tapAt(page, '[data-testid="manga-reader-page"]', 0.3);
    await tapAt(page, '[data-testid="manga-reader-page"]', 0.7);
    await softClick(page, '[data-testid="manga-reader-direction"]', 1000);
    await closeReader(page);

    await openReader(page, DEMO.ppt);
    await softClick(page, '[data-testid="ppt-reader-next"]', 900);
    await softClick(page, '[data-testid="ppt-reader-next"]', 900);
    await softClick(page, '[data-testid="ppt-reader-prev"]', 900);
    await closeReader(page);

    await openReader(page, DEMO.excel);
    const tabs = page.locator('[data-testid^="excel-reader-tab-"]');
    if ((await tabs.count()) > 1) {
      await tabs.nth(1).click().catch(() => {});
      await beat(page, 900);
      await tabs.nth(0).click().catch(() => {});
      await beat(page, 800);
    }
    await closeReader(page);

    await hoverClick(page, '[data-testid="sidebar-nav-recent"]');
    await beat(page, 1600);
    await hoverClick(page, '[data-testid="sidebar-nav-shelf"]');
    await hoverClick(page, '[data-testid="sidebar-category-all"]');
    await beat(page, 2000);
  });
});
