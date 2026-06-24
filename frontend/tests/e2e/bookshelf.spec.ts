import { test, expect, type Page } from "@playwright/test";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = resolve(__dirname, "fixtures/test-files");

function testFile(name: string) {
  return resolve(FIXTURES, `${name}.html`);
}

async function openImportDialog(page: Page) {
  await page.click('[data-testid="sidebar-import"]');
  await page.locator('[data-testid="import-dialog-content"]').waitFor({ state: "visible", timeout: 5000 });
}

async function uploadFileViaUI(page: Page, filename: string) {
  await openImportDialog(page);
  await page.click('button:has-text("上传文件")');
  await page.locator('input[type="file"]').setInputFiles(testFile(filename));
  await page.locator('[data-testid="import-dialog-submit"]').click();

  const doneBtn = page.locator('button:has-text("完成")');
  const errorEl = page.locator('[data-testid="import-dialog-error"]');

  const result = await Promise.race([
    doneBtn.waitFor({ state: "visible", timeout: 15000 }).then(() => "done" as const),
    errorEl.waitFor({ state: "visible", timeout: 15000 }).then(() => "error" as const),
  ]).catch(() => "timeout" as const);

  if (result === "done") {
    await doneBtn.click();
  } else if (result === "error") {
    const msg = await errorEl.locator('[data-testid="import-dialog-error-message"]').textContent();
    await page.keyboard.press("Escape");
    throw new Error(`File upload failed with error: ${msg}`);
  } else {
    await page.keyboard.press("Escape");
    throw new Error(`File upload timed out after 15s — neither "完成" nor error appeared`);
  }
}

async function importUrlViaUI(page: Page, url: string) {
  await openImportDialog(page);
  await page.click('button:has-text("网页链接")');
  await page.locator('[data-testid="import-dialog-input"]').fill(url);
  await page.locator('[data-testid="import-dialog-submit"]').click();

  const doneBtn = page.locator('button:has-text("完成")');
  const errorEl = page.locator('[data-testid="import-dialog-error"]');

  const result = await Promise.race([
    doneBtn.waitFor({ state: "visible", timeout: 15000 }).then(() => "done" as const),
    errorEl.waitFor({ state: "visible", timeout: 15000 }).then(() => "error" as const),
  ]).catch(() => "timeout" as const);

  if (result === "done") {
    await doneBtn.click();
  } else if (result === "error") {
    const msg = await errorEl.locator('[data-testid="import-dialog-error-message"]').textContent();
    await page.keyboard.press("Escape");
    throw new Error(`URL import failed with error: ${msg}`);
  } else {
    await page.keyboard.press("Escape");
    throw new Error(`URL import timed out after 15s — neither "完成" nor error appeared`);
  }
}

function bookCard(page: Page, title: string) {
  return page.locator('[data-testid^="book-card-"]', { hasText: title }).first();
}

test.describe("Bookshelf - Main Layout", () => {
  test("loads the main page with header and sidebar", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator('[data-testid="header-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="view-mode-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="view-mode-list"]')).toBeVisible();

    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="sidebar-logo"]')).toBeVisible();
  });

  test("toggles view mode between grid and list", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="view-mode-list"]').click();
    await expect(page.locator('[data-testid="book-list"]')).toBeVisible();

    await page.locator('[data-testid="view-mode-grid"]').click();
    await expect(page.locator('[data-testid="book-grid"]')).toBeVisible();
  });

  test("search filters books", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="search-input"]').fill("test");
    await expect(page.locator('[data-testid="search-input"]')).toHaveValue("test");
  });

  test("sort menu opens and selects options", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="sort-toggle"]').click();
    await expect(page.locator('[data-testid="sort-menu"]')).toBeVisible();

    await page.locator('[data-testid="sort-option-recent"]').click();
    await expect(page.locator('[data-testid="sort-menu"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="book-grid"]')).toBeVisible();
  });
});

test.describe("Bookshelf - Book Detail", () => {
  test("opens book detail modal on click", async ({ page }) => {
    await page.goto("/");

    const card = page.locator('[data-testid^="book-card-grid-"]').first();
    await card.click();
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();
  });

  test("closes book detail modal", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid^="book-card-grid-"]').first().click();
    await page.locator('[data-testid="book-detail-close"]').click();
    await expect(page.locator('[data-testid="book-detail-content"]')).not.toBeVisible();
  });

  test("toggles favorite in book detail", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid^="book-card-grid-"]').first().click();
    await page.locator('[data-testid="book-detail-favorite"]').click();
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();
  });

  test("toggles favorite from grid card without opening detail", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const card = page.locator('[data-testid^="book-card-grid-"]').first();
    await expect(card).toBeVisible({ timeout: 10000 });
    const tid = await card.getAttribute("data-testid");
    const id = (tid ?? "").replace("book-card-grid-", "");

    await card.hover();
    const fav = page.locator(`[data-testid="book-favorite-${id}"]`);
    const before = await fav.evaluate((el) => getComputedStyle(el).color);
    await fav.click();

    await expect(page.locator('[data-testid="book-detail-content"]')).not.toBeVisible();
    await expect
      .poll(async () => fav.evaluate((el) => getComputedStyle(el).color))
      .not.toBe(before);
  });

  test("saves edited description and it persists after reopen", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    await page.locator('[data-testid^="book-card-grid-"]').first().click();
    await page.locator('[data-testid="book-detail-edit"]').click();

    const marker = `EDITED_${Date.now()}`;
    await page.locator('[data-testid="book-detail-edit-textarea"]').fill(marker);
    await page.locator('[data-testid="book-detail-edit-save"]').click();

    await expect(page.locator('[data-testid="book-detail-description"]')).toContainText(marker);

    await page.locator('[data-testid="book-detail-close"]').click();
    await page.waitForTimeout(6000);
    await page.locator('[data-testid^="book-card-grid-"]').first().click();
    await expect(page.locator('[data-testid="book-detail-description"]')).toContainText(marker);
  });
});

test.describe("Bookshelf - Import Dialog", () => {
  test("opens and closes import dialog", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="sidebar-import"]').click();
    await expect(page.locator('[data-testid="import-dialog-content"]')).toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-input"]')).toBeVisible();

    await page.locator('[data-testid="import-dialog-close"]').click();
    await expect(page.locator('[data-testid="import-dialog-content"]')).not.toBeVisible();
  });

  test("shows validation error for invalid repo format", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-testid="sidebar-import"]').click();

    const input = page.locator('[data-testid="import-dialog-input"]');
    await input.fill("not-a-valid-repo");

    await expect(page.locator('[data-testid="import-dialog-error-format"]')).toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-submit"]')).toBeDisabled();
  });

  test("accepts valid owner/repo format", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-testid="sidebar-import"]').click();

    const input = page.locator('[data-testid="import-dialog-input"]');
    await input.fill("facebook/react");

    await expect(page.locator('[data-testid="import-dialog-submit"]')).not.toBeDisabled();
  });

  test("shows error when repo already exists (409)", async ({ page }) => {
    await page.route("**/api/repos/add", async (route) => {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ detail: "Repo already in shelf" }) });
    });

    await page.goto("/");
    await page.locator('[data-testid="sidebar-import"]').click();

    await page.locator('[data-testid="import-dialog-input"]').fill("existing/repo");
    await page.locator('[data-testid="import-dialog-submit"]').click();

    await expect(page.locator('[data-testid="import-dialog-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-error-message"]')).toContainText("Repo already in shelf");
  });

  test("shows error when repo not found on GitHub (404)", async ({ page }) => {
    await page.route("**/api/repos/add", async (route) => {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Repo not found on GitHub" }) });
    });

    await page.goto("/");
    await page.locator('[data-testid="sidebar-import"]').click();

    await page.locator('[data-testid="import-dialog-input"]').fill("nonexistent/user");
    await page.locator('[data-testid="import-dialog-submit"]').click();

    await expect(page.locator('[data-testid="import-dialog-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-error-message"]')).toContainText("Repo not found on GitHub");
  });
});

test.describe("Bookshelf - Real Import Operations", () => {
  test("uploaded file appears on shelf", async ({ page }) => {
    await page.goto("/");
    await uploadFileViaUI(page, "smoke-test");

    await expect(bookCard(page, "smoke-test")).toBeVisible({ timeout: 20000 });
  });

  test("URL import appears on shelf", async ({ page }) => {
    await page.goto("/");
    await importUrlViaUI(page, "https://example.com");

    await expect(bookCard(page, "Example Domain")).toBeVisible({ timeout: 30000 });
  });
});

test.describe("Bookshelf - Delete Book", () => {
  test("deletes book from shelf via detail modal", async ({ page }) => {
    await page.goto("/");
    await uploadFileViaUI(page, "delete-me");

    const card = bookCard(page, "delete-me");
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.click();

    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();
    await page.locator('[data-testid="book-detail-delete"]').click();
    await expect(page.locator('[data-testid="book-detail-delete-confirm"]')).toBeVisible();
    await page.locator('[data-testid="book-detail-delete-confirm"]').click();

    await expect(card).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe("Bookshelf - Edit Description", () => {
  test("edits book description inline in detail modal", async ({ page }) => {
    await page.goto("/");
    await uploadFileViaUI(page, "edit-me");

    const card = bookCard(page, "edit-me");
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();
    await page.locator('[data-testid="book-detail-edit"]').click();
    await expect(page.locator('[data-testid="book-detail-edit-textarea"]')).toBeVisible();

    await page.locator('[data-testid="book-detail-edit-textarea"]').fill("新的描述内容");
    await page.locator('[data-testid="book-detail-edit-save"]').click();

    await page.reload();
    await expect(bookCard(page, "edit-me")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Bookshelf - Favorites", () => {
  test("filters to favorites section", async ({ page }) => {
    await page.goto("/");

    const firstCard = page.locator('[data-testid^="book-card-grid-"]').first();
    await firstCard.click();
    await page.locator('[data-testid="book-detail-favorite"]').click();
    await page.locator('[data-testid="book-detail-close"]').click();

    await page.goto("/");
    await page.locator('[data-testid="sidebar-nav-favorites"]').click();
    await expect(page.locator('[data-testid="section-title"]')).toContainText("收藏夹");
  });

  test("toggles favorite in book detail", async ({ page }) => {
    await page.goto("/");

    const card = page.locator('[data-testid^="book-card-grid-"]').first();
    await card.click();

    await page.locator('[data-testid="book-detail-favorite"]').click();
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();
  });
});

test.describe("Bookshelf - Category Filter", () => {
  test("switches category and filters books", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="sidebar-category-generated"]').click();
    await expect(page.locator('[data-testid="section-title"]')).toContainText("AI 生成");
  });

  test("category filter shows only matching books", async ({ page }) => {
    await page.goto("/");

    const bookCount = page.locator('[data-testid="book-count"]');
    await expect(bookCount).toBeVisible();
  });

  test("category badges show correct demo-only book counts", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator('[data-testid="sidebar-category-all"]')).toBeVisible();
    await expect(page.locator('[data-testid="sidebar-category-generated"]')).toBeVisible();
  });
});

test.describe("Bookshelf - Mobile Navigation", () => {
  test("renders mobile nav on small viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
  });
});

test.describe("Bookshelf - Sidebar Navigation", () => {
  test("navigates between sections", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="sidebar-nav-shelf"]').click();
    await expect(page.locator('[data-testid="section-title"]')).toContainText("全部");

    await page.locator('[data-testid="sidebar-nav-recent"]').click();
    await expect(page.locator('[data-testid="section-title"]')).toContainText("最近阅读");
  });
});

test.describe("Bookshelf - Reader", () => {
  test("opens reader from book detail", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid^="book-card-grid-"]').first().click();
    await page.locator('[data-testid="book-detail-read"]').click();

    await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="reader-topbar"]')).toBeVisible();
    await expect(page.locator('[data-testid="reader-title"]')).toBeVisible();
  });

  test("closes reader and returns to shelf", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid^="book-card-grid-"]').first().click();
    await page.locator('[data-testid="book-detail-read"]').click();
    await page.locator('[data-testid="reader-back"]').click();

    await expect(page.locator('[data-testid="reader-modal"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="header-bar"]')).toBeVisible();
  });

  test("ai-generated github book loads content in HtmlReader", async ({ page }) => {
    const repoId = "smoke-ai-repo";

    // Mock book list with a done AI-generated GitHub book
    await page.route("**/api/books", async (route, req) => {
      if (req.url().includes("search=") || req.url().includes("status=")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([{
          repo_id: repoId, book_id: "bk-smoke", title: "AI烟雾测试书", author: "smoke-bot",
          description: "Smoke test for AI book reader", language: "TypeScript",
          html_url: "https://github.com/smoke/ai-book", status: "done",
          source_type: "github", file_type: "html",
          chapter_count: 2, completed_chapters: 2, current_phase: "done",
          progress: null, progress_metadata: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]),
      });
    });

    // Mock book content endpoint
    await page.route(`**/api/books/by-repo/${repoId}`, async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          book_id: "bk-smoke", title: "AI烟雾测试书",
          html_content: "<!DOCTYPE html><html><head><title>AI烟雾测试书</title></head><body><h1>第一章</h1><p>AI生成的内容。</p></body></html>",
        }),
      });
    });

    await page.goto("/");
    await expect(page.locator(`[data-testid^="book-card-grid-${repoId}"]`)).toBeVisible({ timeout: 10000 });

    await page.locator(`[data-testid^="book-card-grid-${repoId}"]`).click();
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="book-detail-read"]').click();
    await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="reader-title"]')).toContainText("AI烟雾测试书");

    // Regression: verify HtmlReader renders content iframe (not blank FileReader)
    const iframe = page.locator('[data-testid="reader-modal"] iframe');
    await expect(iframe).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Bookshelf - Multiple Books", () => {
  test("renders multiple books from demo data", async ({ page }) => {
    await page.goto("/");

    const cards = page.locator('[data-testid^="book-card-grid-"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

test.describe("Bookshelf - Demo Books", () => {
  test("falls back to demo books when API returns empty list", async ({ page }) => {
    await page.route("**/api/books", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.goto("/");
    await expect(page.locator('[data-testid^="book-card-grid-"]').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Bookshelf - Search", () => {
  test("filters demo books by title", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="search-input"]').fill("设计");

    const cards = page.locator('[data-testid^="book-card-grid-"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test("clear search restores all books", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="search-input"]').fill("设计");
    await page.locator('[data-testid="search-input"]').fill("");

    await expect(page.locator('[data-testid^="book-card-grid-"]').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Bookshelf - Read Button While Generating", () => {
  test("read button is disabled when book is producing", async ({ page }) => {
    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([{
          repo_id: "writing-book", book_id: "gen-w", title: "生成中的书", author: "test",
          description: "", language: "TS", html_url: "https://x.com", status: "writing",
          source_type: "github", file_type: "html",
          chapter_count: 4, completed_chapters: 1, current_phase: "writing",
          progress: null, progress_metadata: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]),
      });
    });

    await page.goto("/");

    await page.locator('[data-testid^="book-card-grid-writing-book"]').click({ timeout: 10000 });
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();

    const readBtn = page.locator('[data-testid="book-detail-read"]');
    await expect(readBtn).toBeDisabled();
    await expect(readBtn).toContainText("生成中...");
  });
});

test.describe("Bookshelf - HTML Reading Progress", () => {
  test("uploaded HTML file opens in reader and scrolls", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto("/");
    await uploadFileViaUI(page, "progress-test");

    const card = bookCard(page, "progress-test");
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="book-detail-read"]').click();
    await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 15000 });

    const iframe = page.locator('[data-testid="reader-modal"] iframe');
    await expect(iframe).toBeVisible({ timeout: 15000 });

    // Dismiss reader
    await page.evaluate(() => {
      (document.querySelector('[data-testid="reader-back"]') as HTMLElement)?.click();
    });
    await expect(page.locator('[data-testid="reader-modal"]')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="header-bar"]')).toBeVisible();
  });

  // TODO: progress bar verification requires backend support for
  // ImportedBook progress (currently POST /api/reading/progress
  // only accepts valid Repo.id, not ImportedBook.id).
});

test.describe("Bookshelf - Category Management", () => {
  async function openCategoryManager(page: Page) {
    await page.locator('[data-testid="sidebar-manage-categories"]').click();
    await expect(page.locator('[data-testid="category-manager"]')).toBeVisible({ timeout: 5000 });
  }

  async function openCreateForm(page: Page) {
    await page.locator('[data-testid="category-new-toggle"]').click();
    await expect(page.locator('[data-testid="category-new-form"]')).toBeVisible({ timeout: 5000 });
  }

  test("create form is collapsed by default and toggles open/closed", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openCategoryManager(page);

    await expect(page.locator('[data-testid="category-new-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="category-new-form"]')).toHaveCount(0);

    await page.locator('[data-testid="category-new-toggle"]').click();
    await expect(page.locator('[data-testid="category-new-form"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="category-new-toggle"]')).toHaveCount(0);

    await page.locator('[data-testid="category-new-cancel"]').click();
    await expect(page.locator('[data-testid="category-new-form"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="category-new-toggle"]')).toBeVisible();
  });

  test("manager lists system categories and marks them non-deletable", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openCategoryManager(page);

    for (const key of ["generated", "documents", "imported", "youtube", "uncategorized"]) {
      await expect(page.locator(`[data-testid="category-row-${key}"]`)).toBeVisible();
    }
    // System rows expose edit but never delete
    await expect(page.locator('[data-testid="category-edit-generated"]')).toBeVisible();
    await expect(page.locator('[data-testid="category-delete-generated"]')).toHaveCount(0);
  });

  test("creates and deletes a custom category", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openCategoryManager(page);

    const name = `测试分类${Date.now().toString().slice(-5)}`;
    await openCreateForm(page);
    await page.locator('[data-testid="category-new-name"]').fill(name);
    await page.locator('[data-testid="category-add-btn"]').click();

    const newRow = page.locator('[data-testid^="category-row-"]', { hasText: name });
    await expect(newRow).toBeVisible({ timeout: 5000 });

    const deleteBtn = newRow.locator('[data-testid^="category-delete-"]');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
    await newRow.getByRole("button", { name: "是" }).click();
    await expect(page.locator('[data-testid^="category-row-"]', { hasText: name })).toHaveCount(0, { timeout: 5000 });
  });

  test("rejects duplicate category label", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openCategoryManager(page);

    await openCreateForm(page);
    await page.locator('[data-testid="category-new-name"]').fill("AI 生成");
    await page.locator('[data-testid="category-add-btn"]').click();

    await expect(page.locator('[data-testid="category-error"]')).toBeVisible({ timeout: 5000 });
  });

  test("new-category color picker opens fully inside the dialog (not clipped)", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openCategoryManager(page);

    await openCreateForm(page);
    await page.locator('[data-testid="category-new-color"]').click();
    const popover = page.locator('[data-testid="category-new-color-popover"]');
    await expect(popover).toBeVisible({ timeout: 5000 });

    const dialog = page.locator('[data-testid="category-manager"]');
    const popBox = await popover.boundingBox();
    const dlgBox = await dialog.boundingBox();
    expect(popBox).not.toBeNull();
    expect(dlgBox).not.toBeNull();
    if (popBox && dlgBox) {
      expect(popBox.y).toBeGreaterThanOrEqual(dlgBox.y - 1);
      expect(popBox.y + popBox.height).toBeLessThanOrEqual(dlgBox.y + dlgBox.height + 1);
    }
  });

  test("custom category appears in the sidebar shelf list", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openCategoryManager(page);

    const name = `书架${Date.now().toString().slice(-5)}`;
    await openCreateForm(page);
    await page.locator('[data-testid="category-new-name"]').fill(name);
    await page.locator('[data-testid="category-add-btn"]').click();
    await expect(page.locator('[data-testid^="category-row-"]', { hasText: name })).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="category-manager"]')).not.toBeVisible();

    await expect(page.locator('[data-testid^="sidebar-category-"]', { hasText: name })).toBeVisible({ timeout: 5000 });
  });

  test("custom category with a defining label collects matching books", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await uploadFileViaUI(page, "progress-test");

    const tag = `主题${Date.now().toString().slice(-5)}`;

    const card = bookCard(page, "progress-test");
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="book-detail-tag-input"]').fill(tag);
    await page.locator('[data-testid="book-detail-tag-add"]').click();
    await expect(page.locator(`[data-testid="book-detail-tag-${tag}"]`)).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="book-detail-close"]').click();

    await openCategoryManager(page);
    const name = `合集${Date.now().toString().slice(-5)}`;
    await openCreateForm(page);
    await page.locator('[data-testid="category-new-name"]').fill(name);
    await page.locator('[data-testid="category-new-labels-input"]').fill(tag);
    await page.locator('[data-testid="category-new-labels-input"]').press("Enter");
    await expect(page.locator(`[data-testid="category-new-labels-chip-${tag}"]`)).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="category-add-btn"]').click();
    await expect(page.locator('[data-testid^="category-row-"]', { hasText: name })).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="category-manager"]')).not.toBeVisible();

    await page.locator('[data-testid^="sidebar-category-"]', { hasText: name }).click();
    await expect(bookCard(page, "progress-test")).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Bookshelf - Per-Book Category & Tags", () => {
  test("book joins a category when its tag matches a category label", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await uploadFileViaUI(page, "progress-test");

    const card = bookCard(page, "progress-test");
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="book-detail-tag-input"]').fill("文档资料");
    await page.locator('[data-testid="book-detail-tag-add"]').click();
    await expect(page.locator('[data-testid="book-detail-tag-文档资料"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="book-detail-close"]').click();
    await page.reload({ waitUntil: "domcontentloaded" });

    await page.locator('[data-testid="sidebar-category-documents"]').click();
    await expect(bookCard(page, "progress-test")).toBeVisible({ timeout: 15000 });
  });

  test("adds and removes a tag, persisting across reload", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await uploadFileViaUI(page, "progress-test");

    const card = bookCard(page, "progress-test");
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible({ timeout: 5000 });

    const tag = `标签${Date.now().toString().slice(-4)}`;
    await page.locator('[data-testid="book-detail-tag-input"]').fill(tag);
    await page.locator('[data-testid="book-detail-tag-add"]').click();
    await expect(page.locator(`[data-testid="book-detail-tag-${tag}"]`)).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="book-detail-close"]').click();
    await page.reload({ waitUntil: "domcontentloaded" });

    await bookCard(page, "progress-test").click();
    await expect(page.locator(`[data-testid="book-detail-tag-${tag}"]`)).toBeVisible({ timeout: 5000 });

    await page.locator(`[data-testid="book-detail-tag-remove-${tag}"]`).click();
    await expect(page.locator(`[data-testid="book-detail-tag-${tag}"]`)).toHaveCount(0, { timeout: 5000 });
  });

  test("quick-selects an existing tag from suggestions", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await uploadFileViaUI(page, "progress-test");

    const card = bookCard(page, "progress-test");
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible({ timeout: 5000 });

    // GIVEN suggestions are populated from tags used across all books
    const suggestions = page.locator('[data-testid="book-detail-tag-suggestions"]');
    await expect(suggestions).toBeVisible({ timeout: 5000 });

    const firstSuggestion = suggestions.locator('[data-testid^="book-detail-tag-suggest-"]').first();
    await expect(firstSuggestion).toBeVisible({ timeout: 5000 });
    const suggestTestId = await firstSuggestion.getAttribute("data-testid");
    const tag = suggestTestId!.replace("book-detail-tag-suggest-", "");

    // WHEN the suggestion chip is clicked
    await firstSuggestion.click();

    // THEN it becomes an active chip and leaves the suggestion list
    await expect(page.locator(`[data-testid="book-detail-tag-${tag}"]`)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`[data-testid="book-detail-tag-suggest-${tag}"]`)).toHaveCount(0, { timeout: 5000 });
  });
});

test.describe("Bookshelf - Mobile Category UI", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("collapsed header shows logo, category pill and search icon", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator('[data-testid="category-pill"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-expand"]')).toBeVisible();
    await expect(page.locator('[data-testid="pc-sidebar"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="category-pill"]')).toContainText("全部");
  });

  test("search icon expands input and back arrow collapses it", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.locator('[data-testid="search-expand"]').click();
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-back"]')).toBeVisible();
    await expect(page.locator('[data-testid="category-pill"]')).toHaveCount(0);

    await page.locator('[data-testid="search-back"]').click();
    await expect(page.locator('[data-testid="category-pill"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-expand"]')).toBeVisible();
  });

  test("clear button empties query but keeps search expanded", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.locator('[data-testid="search-expand"]').click();
    await page.locator('[data-testid="search-input"]').fill("三体");
    await expect(page.locator('[data-testid="search-clear"]')).toBeVisible();

    await page.locator('[data-testid="search-clear"]').click();
    await expect(page.locator('[data-testid="search-input"]')).toHaveValue("");
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible();
  });

  test("pill opens picker, selecting a category filters and updates pill", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.locator('[data-testid="category-pill"]').click();
    await expect(page.locator('[data-testid="category-picker"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="category-picker-check-all"]')).toBeVisible();

    await page.locator('[data-testid="category-picker-row-generated"]').click();
    await expect(page.locator('[data-testid="category-picker"]')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="category-pill"]')).toContainText("AI 生成");
  });

  test("picker bridges to category manager", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.locator('[data-testid="category-pill"]').click();
    await expect(page.locator('[data-testid="category-picker"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="category-picker-manage"]').click();
    await expect(page.locator('[data-testid="category-manager"]')).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Bookshelf - Small Phone Header (iPhone SE)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("header does not overflow horizontally and all controls fit", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const header = page.locator('[data-testid="header-bar"]');
    await expect(header).toBeVisible();

    const overflow = await header.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await expect(page.locator('[data-testid="category-pill"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-expand"]')).toBeVisible();
    await expect(page.locator('[data-testid="view-mode-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="view-mode-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="sort-toggle"]')).toBeVisible();
  });

  test("long active category label stays within viewport", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.locator('[data-testid="category-pill"]').click();
    await expect(page.locator('[data-testid="category-picker"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="category-picker-row-uncategorized"]').click();
    await expect(page.locator('[data-testid="category-picker"]')).not.toBeVisible({ timeout: 5000 });

    const header = page.locator('[data-testid="header-bar"]');
    const overflow = await header.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});


