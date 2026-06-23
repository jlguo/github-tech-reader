import { test, expect, type Page } from "@playwright/test";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = resolve(__dirname, "fixtures/test-files");
const EPUB_FILE = "dive-into-docker.epub";
const EPUB_TITLE = "dive-into-docker";

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
  const card = page.locator(`[data-testid^="book-card-"]`, { hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
  await page.waitForTimeout(1000);
  await page.click('[data-testid="book-detail-read"]');
  await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 15000 });
}

async function centerTap(page: Page) {
  const content = page.locator('[data-testid="reader-content"]');
  const box = await content.boundingBox();
  if (!box) throw new Error("reader-content has no bounding box");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(600);
}

async function closeReader(page: Page) {
  const topbar = page.locator('[data-testid="reader-topbar"]');
  if ((await topbar.getAttribute("data-visible")) !== "true") {
    await centerTap(page);
  }
  await expect(topbar).toHaveAttribute("data-visible", "true", { timeout: 5000 });
  await page.click('[data-testid="reader-back"]');
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-testid="reader-modal"]')).not.toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

async function readPercent(page: Page): Promise<number> {
  const indicator = page.locator('[data-testid="epub-reader-page-indicator"]');
  await expect(indicator).toBeVisible({ timeout: 15000 });
  const text = (await indicator.innerText()).trim();
  return parseInt(text.replace("%", ""), 10);
}

test.describe("EPUB reading progress", () => {
  test.setTimeout(180000);
  test.skip(!existsSync(resolve(FIXTURES, EPUB_FILE)), `missing fixture ${EPUB_FILE}`);

  test("advances, persists, and restores reading position", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid^="book-card-"]', { timeout: 15000 });

    await uploadBook(page, EPUB_FILE);
    await page.waitForTimeout(2000);

    await openReader(page, EPUB_TITLE);

    const startPercent = await readPercent(page);
    console.log("[epub-progress] initial percent:", startPercent);
    expect(startPercent).toBe(0);

    const nextBtn = page.locator('[data-testid="epub-reader-next"]');
    for (let i = 0; i < 12; i++) {
      await nextBtn.click();
      await page.waitForTimeout(400);
    }

    const advancedPercent = await readPercent(page);
    console.log("[epub-progress] advanced percent:", advancedPercent);
    expect(advancedPercent).toBeGreaterThan(0);

    await closeReader(page);
    await page.waitForTimeout(2000);

    await openReader(page, EPUB_TITLE);

    const indicator = page.locator('[data-testid="epub-reader-page-indicator"]');
    await expect(indicator).toBeVisible({ timeout: 15000 });
    await expect
      .poll(async () => parseInt((await indicator.innerText()).replace("%", ""), 10) || 0, {
        timeout: 20000,
        intervals: [500],
      })
      .toBeGreaterThan(0);

    const restoredPercent = parseInt((await indicator.innerText()).replace("%", ""), 10);
    console.log("[epub-progress] restored percent:", restoredPercent);
    expect(restoredPercent).toBeGreaterThan(0);

    await closeReader(page);
  });
});
