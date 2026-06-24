import { test, expect, type Page } from "@playwright/test";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = resolve(__dirname, "fixtures/test-files");

async function uploadBook(page: Page, fileName: string) {
  await page.click('[data-testid="sidebar-import"]');
  await page.locator('[data-testid="import-dialog-content"]').waitFor({ state: "visible", timeout: 5000 });
  await page.click('button:has-text("上传文件")');
  await page.locator('input[type="file"]').setInputFiles(resolve(FIXTURES, fileName));
  await page.locator('[data-testid="import-dialog-submit"]').click();

  const doneBtn = page.locator('button:has-text("完成")');
  const errorEl = page.locator('[data-testid="import-dialog-error"]');
  const result = await Promise.race([
    doneBtn.waitFor({ state: "visible", timeout: 20000 }).then(() => "done" as const),
    errorEl.waitFor({ state: "visible", timeout: 20000 }).then(() => "error" as const),
  ]).catch(() => "timeout" as const);

  if (result === "done") {
    await doneBtn.click();
    await page.waitForTimeout(1000);
  } else if (result === "error") {
    const msg = await errorEl.locator('[data-testid="import-dialog-error-message"]').textContent();
    await page.keyboard.press("Escape");
    throw new Error(`File upload failed: ${msg}`);
  } else {
    await page.keyboard.press("Escape");
    throw new Error("File upload timed out after 20s");
  }
}

async function openReader(page: Page, title: string) {
  const card = page.locator('[data-testid^="book-card-"]', { hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
  await page.waitForTimeout(1000);
  await page.click('[data-testid="book-detail-read"]');
  await page.waitForTimeout(3000);
  await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="reader-content"]')).toBeVisible({ timeout: 10000 });
}

async function revealTopbar(page: Page) {
  const topbar = page.locator('[data-testid="reader-topbar"]');
  if ((await topbar.getAttribute("data-visible")) === "true") return;
  const content = page.locator('[data-testid="reader-content"]');
  const box = await content.boundingBox();
  if (!box) throw new Error("reader-content has no bounding box");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(500);
  await expect(topbar).toHaveAttribute("data-visible", "true");
}

test.describe("Bookmarks", () => {
  test.setTimeout(120000);

  test("txt reader: add, list, restore, delete bookmark", async ({ page }) => {
    test.skip(!existsSync(resolve(FIXTURES, "test.txt")), "missing fixture test.txt");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid^="book-card-"]', { timeout: 15000 });

    await uploadBook(page, "test.txt");
    await page.waitForTimeout(1500);
    await openReader(page, "test");

    await revealTopbar(page);
    const bookmarkBtn = page.locator('[data-testid="reader-bookmark"]');
    await expect(bookmarkBtn).toBeVisible();
    await expect(bookmarkBtn).toBeEnabled();

    await bookmarkBtn.click();
    const drawer = page.locator('[data-testid="bookmark-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    await expect(page.locator('[data-testid="bookmark-item"]')).toHaveCount(0);

    await page.locator('[data-testid="bookmark-add"]').click();
    await expect(page.locator('[data-testid="bookmark-item"]')).toHaveCount(1, { timeout: 5000 });

    const label = await page.locator('[data-testid="bookmark-item"]').first().innerText();
    console.log("BOOKMARK_LABEL:", label);
    expect(label).toMatch(/%|Page|Sheet/);

    await page.locator('[data-testid="bookmark-item"]').first().click();
    await expect(drawer).not.toBeVisible({ timeout: 5000 });

    await revealTopbar(page);
    await bookmarkBtn.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="bookmark-delete"]').first().click();
    await expect(page.locator('[data-testid="bookmark-item"]')).toHaveCount(0, { timeout: 5000 });
  });

  test("bookmark persists across reader reopen", async ({ page }) => {
    test.skip(!existsSync(resolve(FIXTURES, "smoke-test.html")), "missing fixture smoke-test.html");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid^="book-card-"]', { timeout: 15000 });

    await uploadBook(page, "smoke-test.html");
    await page.waitForTimeout(1500);
    await openReader(page, "smoke-test");

    await revealTopbar(page);
    const bookmarkBtn = page.locator('[data-testid="reader-bookmark"]');
    await expect(bookmarkBtn).toBeEnabled();
    await bookmarkBtn.click();
    await expect(page.locator('[data-testid="bookmark-drawer"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="bookmark-add"]').click();
    await expect(page.locator('[data-testid="bookmark-item"]')).toHaveCount(1, { timeout: 5000 });

    await page.mouse.click(20, 300);
    await expect(page.locator('[data-testid="bookmark-drawer"]')).not.toBeVisible({ timeout: 5000 });
    await revealTopbar(page);
    await page.click('[data-testid="reader-back"]');
    await expect(page.locator('[data-testid="reader-modal"]')).not.toBeVisible({ timeout: 5000 });

    await openReader(page, "smoke-test");
    await revealTopbar(page);
    await bookmarkBtn.click();
    await expect(page.locator('[data-testid="bookmark-drawer"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="bookmark-item"]')).toHaveCount(1, { timeout: 5000 });

    await page.locator('[data-testid="bookmark-delete"]').first().click();
    await expect(page.locator('[data-testid="bookmark-item"]')).toHaveCount(0, { timeout: 5000 });
  });

  test("demo book: bookmark button disabled", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid^="book-card-grid-"]', { timeout: 15000 });

    const demoCard = page.locator('[data-testid^="book-card-grid-"]', { hasText: "示例" }).first();
    await expect(demoCard).toBeVisible({ timeout: 15000 });
    await demoCard.click();
    await page.waitForTimeout(800);
    await page.locator('[data-testid="book-detail-read"]').click();
    await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    await revealTopbar(page);
    const bookmarkBtn = page.locator('[data-testid="reader-bookmark"]');
    await expect(bookmarkBtn).toBeVisible();
    await expect(bookmarkBtn).toBeDisabled();
  });
});
