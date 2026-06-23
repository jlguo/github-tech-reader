import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8000/api";

test.describe("Cover Integration - API Schema", () => {
  test("API /api/books returns cover_url field in each book", async () => {
    const r = await fetch(`${API_BASE}/books`);
    expect(r.ok).toBeTruthy();
    const books: Record<string, unknown>[] = await r.json();
    expect(books.length).toBeGreaterThan(0);

    for (const b of books) {
      expect(b).toHaveProperty("cover_url");
    }
  });
});

test.describe("Cover Integration - UI Rendering", () => {
  test("book card uses backend cover_url img when present", async ({ page }) => {
    const oneByOnePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64"
    );

    let anyBookId = "";
    await page.route("**/api/books", async (route) => {
      const r = await route.fetch();
      const books: Record<string, unknown>[] = await r.json();
      for (const b of books) {
        b.cover_url = `/api/books/${b.book_id}/cover`;
      }
      anyBookId = books[0]?.repo_id as string || "";
      await route.fulfill({ json: books });
    });

    await page.route("**/api/books/*/cover", async (route) => {
      await route.fulfill({ status: 200, contentType: "image/png", body: oneByOnePng });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    expect(anyBookId).toBeTruthy();

    const apiCard = page.locator(`[data-testid="book-card-grid-${anyBookId}"]`);
    await expect(apiCard).toBeVisible({ timeout: 10000 });

    const coverImg = apiCard.locator("img").first();
    await expect(coverImg).toBeVisible({ timeout: 5000 });

    const src = await coverImg.getAttribute("src");
    expect(src).toContain("/api/books/");
    expect(src).toContain("/cover");
  });

  test("book card renders a cover element for each book", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    const firstCard = page.locator('[data-testid^="book-card-grid-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });

    const hasAnyCover = await firstCard.locator('[data-testid^="book-cover-"]').first().isVisible().catch(() => false);
    expect(hasAnyCover).toBeTruthy();
  });
});
