import { test, expect } from "@playwright/test";

test.describe("继续阅读 — all book types", () => {
  test("recent-reading section includes real (non-demo) books", async ({ page }) => {
    const booksResp = page.waitForResponse(
      (r) => r.url().includes("/api/books") && r.request().method() === "GET",
      { timeout: 15000 },
    );

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const resp = await booksResp;
    const books = (await resp.json()) as Array<{
      repo_id: string;
      book_id: string;
      source_type: string;
      last_read_at: string | null;
    }>;

    const readReal = books.filter((b) => b.last_read_at);

    test.skip(
      readReal.length === 0,
      "No real read books in backend — cannot verify recent-reading population",
    );

    const section = page.locator('[data-testid="recent-reading-section"]');
    await expect(section).toBeVisible({ timeout: 10000 });

    const renderedIds = await page
      .locator('[data-testid^="recent-book-"]')
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-testid")!.replace("recent-book-", "")),
      );

    console.log("rendered recent-book ids:", renderedIds);
    console.log("real read book ids:", readReal.map((b) => b.repo_id || b.book_id));

    const demoIds = new Set(Array.from({ length: 13 }, (_, i) => String(i + 1)));
    const renderedRealIds = renderedIds.filter((id) => !demoIds.has(id));

    expect(renderedRealIds.length).toBeGreaterThan(0);
  });
});
