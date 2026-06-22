import { test, expect, type Page } from "@playwright/test";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = resolve(__dirname, "fixtures/test-files");

const READERS: { ext: string; file: string; title: string; badge: string }[] = [
  { ext: "epub", file: "dive-into-docker.epub", title: "dive-into-docker", badge: "EPUB" },
  { ext: "docx", file: "Docker-podman.docx", title: "Docker-podman", badge: "WORD" },
  { ext: "pptx", file: "AWS-digital-Transform.pptx", title: "AWS-digital-Transform", badge: "PPT" },
  { ext: "xlsx", file: "classic-books.xlsx", title: "classic-books", badge: "XLSX" },
  { ext: "txt", file: "test.txt", title: "test", badge: "TXT" },
  { ext: "html", file: "smoke-test.html", title: "smoke-test", badge: "HTML" },
];

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
  await page.waitForTimeout(5000);
  await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="reader-content"]')).toBeVisible({ timeout: 10000 });
}

async function centerTap(page: Page) {
  const content = page.locator('[data-testid="reader-content"]');
  const box = await content.boundingBox();
  if (!box) throw new Error("reader-content has no bounding box");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(600);
}

async function expectTopbar(page: Page, visible: boolean) {
  await expect(page.locator('[data-testid="reader-topbar"]')).toHaveAttribute(
    "data-visible",
    visible ? "true" : "false",
  );
}

test.describe("Reader - Topbar Toggle (real uploaded files)", () => {
  test.setTimeout(120000);

  for (const r of READERS) {
    test(`center tap toggles topbar in ${r.ext} reader`, async ({ page }) => {
      test.skip(!existsSync(resolve(FIXTURES, r.file)), `missing fixture ${r.file} — see fixtures/test-files/README.md`);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-testid^="book-card-"]', { timeout: 15000 });

      await uploadBook(page, r.file);
      await page.waitForTimeout(2000);
      await openReader(page, r.title);

      await expect(page.locator('[data-testid="reader-type-badge"]')).toContainText(r.badge);

      await page.waitForTimeout(3500);
      await expectTopbar(page, false);

      await centerTap(page);
      await expectTopbar(page, true);

      await centerTap(page);
      await expectTopbar(page, false);

      await centerTap(page);
      await expectTopbar(page, true);

      await page.click('[data-testid="reader-back"]');
      await page.waitForTimeout(1000);
      await expect(page.locator('[data-testid="reader-modal"]')).not.toBeVisible({ timeout: 5000 });
    });
  }
});
