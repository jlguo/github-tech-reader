import { test, expect, type Page } from "@playwright/test";

const REPO_BOOK_TITLE = "pi";

async function openBookDetail(page: Page): Promise<boolean> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid^="book-card-grid-"]').first().waitFor({ state: "visible", timeout: 15000 });
  const card = page.locator(`[data-testid^="book-card-grid-"]`, { hasText: REPO_BOOK_TITLE }).first();
  if (!(await card.isVisible().catch(() => false))) return false;
  await card.click();
  await expect(page.locator('[data-testid="book-detail-read"]')).toBeVisible({ timeout: 10000 });
  return true;
}

test.describe("Book detail - read button progress", () => {
  test.setTimeout(30000);

  test("completed book shows reading action without generation progress fill", async ({ page }) => {
    test.skip(!(await openBookDetail(page)), "no repo book on shelf");
    const btn = page.locator('[data-testid="book-detail-read"]');
    await expect(btn).toBeVisible();

    const text = await btn.textContent() ?? "";
    expect(text).not.toContain("%");
    expect(["开始阅读", "继续阅读", "重新阅读"]).toContain(text.trim());

    const fill = btn.locator("div[style*='width']");
    expect(await fill.count()).toBe(0);
  });
});