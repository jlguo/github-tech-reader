import { test, expect } from "@playwright/test";

test.describe("Book Detail Modal - Download", () => {
  test.setTimeout(120000);

  test("download button triggers a file download for an existing uploaded book", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid^="book-card-"]', { timeout: 15000 });

    const card = page.locator('[data-testid^="book-card-"]', { hasText: "progress-test" }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();
    await page.waitForTimeout(1000);

    const downloadBtn = page.locator('[data-testid="book-detail-download"]');
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      downloadBtn.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.(html|txt)$/i);
  });
});
