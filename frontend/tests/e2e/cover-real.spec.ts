import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8000/api";

test("real backend cover img loads (no mocking)", async ({ page }) => {
  const r = await fetch(`${API_BASE}/books`);
  const books: Record<string, unknown>[] = await r.json();
  const withCover = books.filter((b) => b.cover_url);
  expect(withCover.length).toBeGreaterThan(0);
  const target = withCover[0];
  const repoId = (target.repo_id as string) || (target.book_id as string);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  const card = page.locator(`[data-testid="book-card-grid-${repoId}"]`);
  await expect(card).toBeVisible({ timeout: 10000 });

  const img = card.locator("img").first();
  await expect(img).toBeVisible({ timeout: 5000 });

  const src = await img.getAttribute("src");
  expect(src).toContain("/api/books/");
  expect(src).toContain("/cover");

  // The image must actually decode — real bytes, not a broken link.
  await expect
    .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth), {
      timeout: 8000,
    })
    .toBeGreaterThan(0);
});
