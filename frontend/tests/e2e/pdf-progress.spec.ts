import { test, expect, type Page } from "@playwright/test";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = resolve(__dirname, "fixtures/test-files");
const PDF_FILE = "multipage.pdf";
const PDF_TITLE = "multipage";

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
  await page.waitForTimeout(800);
  await page.click('[data-testid="book-detail-read"]');
  await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="reader-content"]')).toBeVisible({ timeout: 20000 });
}

async function centerTap(page: Page) {
  const box = await page.locator('[data-testid="reader-content"]').boundingBox();
  if (!box) return;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(600);
}

async function closeReader(page: Page) {
  await centerTap(page);
  await page.click('[data-testid="reader-back"]');
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-testid="reader-modal"]')).not.toBeVisible({ timeout: 5000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

async function scrollPdf(page: Page, steps: number) {
  const box = await page.locator('[data-testid="reader-content"]').boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(300);
  }
}

async function detailPercent(page: Page): Promise<number> {
  const el = page.locator('[data-testid="book-detail-progress"]');
  await expect(el).toBeVisible({ timeout: 10000 });
  const text = (await el.innerText()).trim();
  if (/已读完/.test(text)) return 100;
  const match = text.match(/(\d+)\s*%/);
  return match ? parseInt(match[1], 10) : 0;
}

test.describe("PDF reading progress", () => {
  test.setTimeout(120000);
  test.skip(!existsSync(resolve(FIXTURES, PDF_FILE)), `missing fixture ${PDF_FILE}`);

  test("tracks page-based position, persists, and shows progress bar", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid^="book-card-"]', { timeout: 15000 });

    await uploadBook(page, PDF_FILE);
    await page.waitForTimeout(2000);

    await openReader(page, PDF_TITLE);
    await page.waitForTimeout(5000);
    await scrollPdf(page, 10);
    await page.waitForTimeout(1500);

    await closeReader(page);
    await page.waitForTimeout(2000);

    const card = page.locator(`[data-testid^="book-card-"]`, { hasText: PDF_TITLE }).first();
    await card.click();
    const percent = await detailPercent(page);
    console.log("[pdf-progress] persisted percent:", percent);
    expect(percent).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
  });
});
