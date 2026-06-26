import { expect, type Page } from "@playwright/test";

/**
 * Open a demo book by card ID: navigate to shelf, click the book card, then click the read button.
 * Replaces fixed delays with web-first assertions that wait for each element to appear.
 */
export async function openBook(page: Page, cardId: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const card = page.locator(`[data-testid="${cardId}"]`);
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
  // Wait for the detail panel's read button instead of a fixed 1000ms
  await expect(page.locator('[data-testid="book-detail-read"]')).toBeVisible({ timeout: 10000 });
  await page.click('[data-testid="book-detail-read"]');
  // Wait for the reader modal + content — the original had a redundant 2000ms before these expects
  await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-testid="reader-content"]')).toBeVisible({ timeout: 10000 });
}

/**
 * Tap the center of the reader content area to toggle the topbar.
 * No fixed delay — callers should assert the resulting state with auto-waiting expectations.
 */
export async function centerTap(page: Page) {
  const content = page.locator('[data-testid="reader-content"]');
  const box = await content.boundingBox();
  if (!box) return;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
}

/**
 * Close the reader: ensure the topbar is visible, click the back button,
 * then wait for the modal to be dismissed.
 */
export async function closeReader(page: Page) {
  const topbar = page.locator('[data-testid="reader-topbar"]');
  const visible = await topbar.getAttribute("data-visible");
  if (visible !== "true") {
    await centerTap(page);
    await expect(topbar).toHaveAttribute("data-visible", "true", { timeout: 5000 });
  }
  await page.click('[data-testid="reader-back"]');
  await expect(page.locator('[data-testid="reader-modal"]')).not.toBeVisible({ timeout: 5000 });
}

/**
 * Perform a swipe gesture (10-step mouse drag) within the given element or the default reader-content.
 * The 10-step mechanics are preserved; the trailing fixed delay is removed.
 * Callers should assert the resulting state instead of relying on a blind wait.
 */
export async function swipe(page: Page, direction: "left" | "right", selector?: string) {
  const target = selector
    ? page.locator(selector)
    : page.locator('[data-testid="reader-content"]');
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
}

/**
 * Tap at absolute coordinates. No fixed delay — callers should assert the resulting state.
 */
export async function tapAt(page: Page, x: number, y: number) {
  await page.mouse.click(x, y);
}

/**
 * Open a book by finding its card by title text (not data-testid).
 * Navigates to the shelf first to ensure a fresh book list, then locates
 * the first card matching the title via hasText and clicks through to the reader.
 */
export async function openBookByTitle(page: Page, title: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid^="book-card-"]').first()).toBeVisible({ timeout: 15000 });
  const card = page.locator(`[data-testid^="book-card-"]`, { hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
  await expect(page.locator('[data-testid="book-detail-read"]')).toBeVisible({ timeout: 10000 });
  await page.click('[data-testid="book-detail-read"]');
  await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="reader-content"]')).toBeVisible({ timeout: 10000 });
}
