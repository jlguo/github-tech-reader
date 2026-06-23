import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8000/api";

test("file-source fallback renders live for no-image books", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  const fileFallback = page.locator('[data-testid^="book-cover-color-"][data-source="file"]').first();
  await expect(fileFallback).toBeVisible({ timeout: 10000 });
  await expect(fileFallback.locator("svg").first()).toBeVisible();
  const gradient = await fileFallback.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(gradient).toContain("gradient");
});

test("each source shows a distinct fallback when its cover image fails to load", async ({ page }) => {
  const r = await fetch(`${API_BASE}/books`);
  const books: Record<string, unknown>[] = await r.json();
  const wanted = ["github", "youtube", "url", "file"];
  const pick = new Map<string, string>();
  for (const b of books) {
    const st = b.source_type as string;
    const id = (b.repo_id as string) || (b.book_id as string);
    if (wanted.includes(st) && !pick.has(st) && id) pick.set(st, id);
  }
  expect(pick.size).toBeGreaterThan(1);

  await page.route("**/*", (route) => {
    if (route.request().resourceType() === "image") return route.abort();
    return route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);

  const gradients = new Map<string, string>();
  for (const [source, id] of pick) {
    const card = page.locator(`[data-testid="book-card-grid-${id}"]`);
    await expect(card).toBeVisible({ timeout: 10000 });
    const fb = card.locator(`[data-testid="book-cover-color-${id}"]`);
    await expect(fb).toBeVisible({ timeout: 8000 });
    expect(await fb.getAttribute("data-source")).toBe(source);
    await expect(fb.locator("svg").first()).toBeVisible();
    const label = await fb.locator("div").last().innerText();
    const grad = await fb.evaluate((el) => getComputedStyle(el).backgroundImage);
    gradients.set(source, grad);
    console.log(`source=${source} label="${label}" grad=${grad.slice(0, 50)}`);
  }
  expect(new Set(gradients.values()).size).toBe(pick.size);
});
