import { test, expect, type Page } from "@playwright/test";

const REPO_BOOK_TITLE = "pi";
const REPO_BASE = "https://github.com/earendil-works/pi";

async function openRepoBook(page: Page): Promise<boolean> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid^="book-card-grid-"]').first().waitFor({ state: "visible", timeout: 15000 });
  const card = page.locator(`[data-testid^="book-card-grid-"]`, { hasText: REPO_BOOK_TITLE }).first();
  if (!(await card.isVisible().catch(() => false))) return false;
  await card.click();
  await expect(page.locator('[data-testid="book-detail-read"]')).toBeVisible({ timeout: 10000 });
  await page.click('[data-testid="book-detail-read"]');
  await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="reader-content"]')).toBeVisible({ timeout: 10000 });
  const cover = page.locator("text=开始阅读");
  if (await cover.isVisible().catch(() => false)) await cover.click();
  return true;
}

// Records the URLs passed to window.open inside the srcdoc reader frame, since
// noopener popups do not surface as controllable Playwright page events headless.
async function srcdocFrame(page: Page) {
  await page.locator('[data-testid="reader-content"] iframe').first().waitFor({ state: "visible", timeout: 10000 });
  await expect.poll(() => page.frames().some((f) => f.url() === "about:srcdoc"), { timeout: 10000 }).toBe(true);
  const frame = page.frames().find((f) => f.url() === "about:srcdoc");
  if (!frame) throw new Error("reader srcdoc frame not found");
  return frame;
}

async function recordWindowOpen(page: Page): Promise<void> {
  const frame = await srcdocFrame(page);
  await frame.evaluate(() => {
    const calls: string[] = [];
    (window as unknown as { __opened: string[] }).__opened = calls;
    window.open = (url?: string | URL) => { calls.push(String(url)); return null; };
  });
}

async function openedUrls(page: Page): Promise<string[]> {
  const frame = page.frames().find((f) => f.url() === "about:srcdoc");
  if (!frame) return [];
  return frame.evaluate(() => (window as unknown as { __opened?: string[] }).__opened ?? []);
}

test.describe("Reader - link behavior (sandboxed iframe)", () => {
  test.setTimeout(60000);

  test("in-page anchor scrolls without opening a tab or leaving the book", async ({ page }) => {
    test.skip(!(await openRepoBook(page)), "no repo book on shelf");
    await recordWindowOpen(page);
    const frame = page.frameLocator('[data-testid="reader-content"] iframe');
    const anchor = frame.locator('a[href^="#"]').first();
    test.skip((await anchor.count()) === 0, "no in-content anchor link in this book");
    await expect(anchor).toBeVisible({ timeout: 10000 });

    await anchor.click();
    await page.waitForTimeout(300);

    expect(await openedUrls(page)).toHaveLength(0);
    await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible();
  });

  test("external link opens in a new tab and keeps the book intact", async ({ page }) => {
    test.skip(!(await openRepoBook(page)), "no repo book on shelf");
    await recordWindowOpen(page);
    const frame = page.frameLocator('[data-testid="reader-content"] iframe');
    const ext = frame.locator('a[href^="http"]').first();
    await expect(ext).toBeVisible({ timeout: 10000 });
    const href = await ext.getAttribute("href");

    await ext.click();
    await page.waitForTimeout(300);

    expect(await openedUrls(page)).toContain(href);
    await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible();
  });

  test("relative repo link resolves to the GitHub blob URL in a new tab", async ({ page }) => {
    test.skip(!(await openRepoBook(page)), "no repo book on shelf");
    await recordWindowOpen(page);
    const frame = page.frameLocator('[data-testid="reader-content"] iframe');
    const rel = frame.locator('a:not([href^="#"]):not([href^="http"]):not([href^="mailto"])').first();
    test.skip((await rel.count()) === 0, "no relative repo link in this book");
    await expect(rel).toBeVisible({ timeout: 10000 });
    const href = (await rel.getAttribute("href"))!.replace(/^\.?\//, "");

    await rel.click();
    await page.waitForTimeout(300);

    expect(await openedUrls(page)).toContain(`${REPO_BASE}/blob/HEAD/${href}`);
    await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible();
  });

  test("embedded chapter TOC list is stripped from the content body", async ({ page }) => {
    test.skip(!(await openRepoBook(page)), "no repo book on shelf");
    const frame = page.frameLocator('[data-testid="reader-content"] iframe');
    await expect(frame.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(frame.locator("ul.toc")).toHaveCount(0);
    await expect(frame.locator("li.toc-item")).toHaveCount(0);
  });

  test("repo-name heading is removed from the content body", async ({ page }) => {
    test.skip(!(await openRepoBook(page)), "no repo book on shelf");
    const frame = page.frameLocator('[data-testid="reader-content"] iframe');
    await expect(frame.locator("body")).toBeVisible({ timeout: 10000 });
    const h1s = frame.locator("h1");
    const count = await h1s.count();
    for (let i = 0; i < count; i++) {
      const text = (await h1s.nth(i).textContent()) ?? "";
      expect(text).not.toMatch(/^[^\s]+\/[^\s]+$/);
    }
  });

  test("sidebar TOC shows Chinese chapter titles", async ({ page }) => {
    test.skip(!(await openRepoBook(page)), "no repo book on shelf");
    const sidebar = page.locator('[data-testid="reader-modal"] aside').filter({ hasText: "目录" });
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    const text = await sidebar.textContent() ?? "";
    expect(text).toContain("第1章");
    expect(text).not.toContain("Chapter 1:");
  });

  test("Prism syntax highlighter is loaded in the reader iframe", async ({ page }) => {
    test.skip(!(await openRepoBook(page)), "no repo book on shelf");
    const frame = page.frameLocator('[data-testid="reader-content"] iframe');
    await expect(frame.locator("body")).toBeVisible({ timeout: 10000 });
    const srcdocFrame = page.frames().find((f) => f.url() === "about:srcdoc");
    if (!srcdocFrame) throw new Error("reader srcdoc frame not found");
    await expect.poll(async () => {
      return srcdocFrame.evaluate(() => typeof (window as unknown as { Prism?: unknown }).Prism !== "undefined");
    }, { timeout: 10000 }).toBe(true);
    const hasPrismStyle = await srcdocFrame.evaluate(() =>
      Array.from(document.querySelectorAll("style")).some((s) => s.textContent?.includes("language-") ?? false)
    );
    expect(hasPrismStyle).toBe(true);
  });
});
