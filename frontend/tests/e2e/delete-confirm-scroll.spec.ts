import { test, expect } from "@playwright/test";

// Regression: the delete confirm panel sits at the bottom of a scrollable
// maxHeight:90vh modal and previously stayed off-screen when opened.
test.describe("Book Detail - Delete confirm scroll into view", () => {
  test("delete confirm panel is scrolled into the viewport when opened", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const card = page.locator('[data-testid^="book-card-grid-"]').first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();

    await page.locator('[data-testid="book-detail-delete"]').click();

    const confirm = page.locator('[data-testid="book-detail-delete-confirm"]');
    await expect(confirm).toBeVisible();

    await expect(confirm).toBeInViewport();
    await expect(page.locator('[data-testid="book-detail-delete-cancel"]')).toBeInViewport();
  });
});
