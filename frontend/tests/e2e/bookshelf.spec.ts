import { test, expect } from "@playwright/test";

test.describe("Bookshelf - Main Layout", () => {
  test("loads the main page with header and sidebar", async ({ page }) => {
    await page.goto("/");

    // Header elements
    await expect(page.locator('[data-testid="header-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="view-mode-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="view-mode-list"]')).toBeVisible();

    // Sidebar elements (may be hidden on mobile)
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="sidebar-nav-shelf"]')).toBeVisible();
    await expect(page.locator('[data-testid="sidebar-import"]')).toBeVisible();
  });

  test("toggles view mode between grid and list", async ({ page }) => {
    await page.goto("/");

    // Default should be grid
    await expect(page.locator('[data-testid="book-grid"]')).toBeVisible();

    // Switch to list
    await page.locator('[data-testid="view-mode-list"]').click();
    await expect(page.locator('[data-testid="book-list"]')).toBeVisible();

    // Switch back to grid
    await page.locator('[data-testid="view-mode-grid"]').click();
    await expect(page.locator('[data-testid="book-grid"]')).toBeVisible();
  });

  test("search filters books", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill("karpathy");

    // Book grid should show matching results
    await expect(page.locator('[data-testid="section-title"]')).toBeVisible();
  });

  test("sort menu opens and selects options", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="sort-toggle"]').click();
    await expect(page.locator('[data-testid="sort-menu"]')).toBeVisible();

    await page.locator('[data-testid="sort-option-title"]').click();
    await expect(page.locator('[data-testid="sort-menu"]')).not.toBeVisible();
  });
});

test.describe("Bookshelf - Book Detail", () => {
  test("opens book detail modal on click", async ({ page }) => {
    await page.goto("/");

    // Click the first book card in grid view
    const bookCard = page.locator('[data-testid^="book-card-grid-"]').first();
    await bookCard.click();

    // Modal should be visible
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();
    await expect(page.locator('[data-testid="book-detail-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="book-detail-read"]')).toBeVisible();
    await expect(page.locator('[data-testid="book-detail-favorite"]')).toBeVisible();
  });

  test("closes book detail modal", async ({ page }) => {
    await page.goto("/");

    const bookCard = page.locator('[data-testid^="book-card-grid-"]').first();
    await bookCard.click();

    await page.locator('[data-testid="book-detail-close"]').click();
    await expect(page.locator('[data-testid="book-detail-content"]')).not.toBeVisible();
  });

  test("toggles favorite in book detail", async ({ page }) => {
    await page.goto("/");

    const bookCard = page.locator('[data-testid^="book-card-grid-"]').first();
    await bookCard.click();

    await page.locator('[data-testid="book-detail-favorite"]').click();
    // Verify the modal is still open (favorite toggle doesn't close it)
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();
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

    await expect(page.locator('[data-testid="import-dialog-submit"]')).toBeEnabled();
  });

  test("shows error when repo already exists (409)", async ({ page }) => {
    // Mock the API to return 409 "already exists"
    await page.route("**/api/repos/add", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Repo already in shelf" }),
      });
    });

    await page.goto("/");
    await page.locator('[data-testid="sidebar-import"]').click();

    const input = page.locator('[data-testid="import-dialog-input"]');
    await input.fill("ultraworkers/claw-code");

    // Submit the import
    await page.locator('[data-testid="import-dialog-submit"]').click();

    // Should show error state
    await expect(page.locator('[data-testid="import-dialog-error"]')).toBeVisible();
    // Should show the specific error message from backend
    await expect(page.locator('[data-testid="import-dialog-error-message"]')).toContainText("Repo already in shelf");
  });

  test("shows error when repo not found on GitHub (404)", async ({ page }) => {
    // Mock the API to return 404 "not found"
    await page.route("**/api/repos/add", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Repo not found on GitHub" }),
      });
    });

    await page.goto("/");
    await page.locator('[data-testid="sidebar-import"]').click();

    const input = page.locator('[data-testid="import-dialog-input"]');
    await input.fill("nonexistent/user");

    await page.locator('[data-testid="import-dialog-submit"]').click();

    await expect(page.locator('[data-testid="import-dialog-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-error-message"]')).toContainText("Repo not found on GitHub");
  });
});

test.describe("Bookshelf - Imported Repos Without Book", () => {
  test("shows imported repos on shelf even when book generation is missing", async ({ page }) => {
    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            repo_id: "test-no-book-repo",
            book_id: "",
            title: "claw-code",
            author: "ultraworkers",
            description: "A test repo without book generation",
            language: "TypeScript",
            html_url: "https://github.com/ultraworkers/claw-code",
            status: "no_book",
            chapter_count: 0,
            completed_chapters: 0,
            current_phase: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.goto("/");


    const importedBook = page.locator('[data-testid^="book-card-grid-test-no-book-repo"]');
    await expect(importedBook).toBeVisible({ timeout: 10000 });
  });

  test("shows generate button in detail modal and triggers generation API", async ({ page }) => {
    let readmeCalled = false;
    let generateCalled = false;

    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            repo_id: "test-gen-btn-repo",
            book_id: "",
            title: "my-repo",
            author: "testuser",
            description: "Needs book generation",
            language: "Python",
            html_url: "https://github.com/testuser/my-repo",
            status: "no_book",
            chapter_count: 0,
            completed_chapters: 0,
            current_phase: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.route("**/api/repos/test-gen-btn-repo/fetch-readme", async (route) => {
      readmeCalled = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, length: 500 }) });
    });

    await page.route("**/api/agents/generate-book/test-gen-btn-repo", async (route) => {
      generateCalled = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/");

    const bookCard = page.locator('[data-testid^="book-card-grid-test-gen-btn-repo"]');
    await expect(bookCard).toBeVisible({ timeout: 10000 });
    await bookCard.click();

    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();
    await expect(page.locator('[data-testid="book-detail-generate"]')).toBeVisible();

    await page.locator('[data-testid="book-detail-generate"]').click();

    await page.waitForTimeout(500);
    expect(readmeCalled).toBe(true);
    expect(generateCalled).toBe(true);
  });
});

test.describe("Bookshelf - AI Generated Books", () => {
  test("generated book appears on shelf and opens in reader", async ({ page }) => {
    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            repo_id: "test-ai-book",
            book_id: "book-gen-123",
            title: "AI生成的书籍",
            author: "test-author",
            description: "这本书是由 AI 自动生成的",
            language: "TypeScript",
            html_url: "https://github.com/test-author/ai-book",
            status: "done",
            chapter_count: 5,
            completed_chapters: 5,
            current_phase: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.route("**/api/books/by-repo/test-ai-book", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          book_id: "book-gen-123",
          title: "AI生成的书籍",
          html_content: "<html><body><h1>第一章</h1><p>这是 AI 生成的内容。</p></body></html>",
          cover_html: null,
          chapters: [
            { id: "ch1", section_type: "book_chapter", title: "第一章", content: "内容...", order_index: 0, metadata_: null, created_at: new Date().toISOString() },
          ],
        }),
      });
    });

    await page.route("**/api/reading/progress", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/");

    const bookCard = page.locator('[data-testid^="book-card-grid-test-ai-book"]');
    await expect(bookCard).toBeVisible({ timeout: 10000 });
    await bookCard.click();

    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();
    await expect(page.locator('[data-testid="book-detail-title"]')).toContainText("AI生成的书籍");

    await page.locator('[data-testid="book-detail-read"]').click();

    await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="reader-topbar"]')).toBeVisible();
    await expect(page.locator('[data-testid="reader-title"]')).toContainText("AI生成的书籍");
    await expect(page.locator('[data-testid="reader-content"]')).toBeVisible();
  });

  test("TOC renders headings and scrolls on click", async ({ page }) => {
    const htmlWithHeadings = `<!DOCTYPE html><html><body>
<h1>第一章 开始</h1><p>内容...</p>
<h2>1.1 安装</h2><p>安装步骤...</p>
<h2>1.2 配置</h2><p>配置说明...</p>
<h1>第二章 进阶</h1><p>进阶内容...</p>
<h2>2.1 高级特性</h2><p>高级用法...</p>
</body></html>`;

    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([{
          repo_id: "test-toc-book", book_id: "toc-gen", title: "TOC测试书", author: "test",
          description: "", language: "ZH", html_url: "", status: "done",
          chapter_count: 2, completed_chapters: 2, current_phase: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]),
      });
    });

    await page.route("**/api/books/by-repo/test-toc-book", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        book_id: "toc-gen", title: "TOC测试书", html_content: htmlWithHeadings,
        cover_html: null, chapters: [],
      })});
    });

    await page.route("**/api/reading/progress", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/");
    const bookCard = page.locator('[data-testid^="book-card-grid-test-toc-book"]');
    await expect(bookCard).toBeVisible({ timeout: 10000 });
    await bookCard.click();
    await page.locator('[data-testid="book-detail-read"]').click();

    await expect(page.locator('[data-testid="html-reader-toc"]')).toBeVisible({ timeout: 10000 });

    const tocItems = page.locator('[data-testid="html-reader-toc"] button');
    await expect(tocItems).toHaveCount(5);

    await page.locator('[data-testid="html-reader-toc-s1"]').click();
    await page.locator('[data-testid="html-reader-toc-s3"]').click();
  });

  test("mobile TOC toggle opens and closes overlay", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const htmlWithHeadings = `<!DOCTYPE html><html><body>
<h1>第一章</h1><p>text</p><h2>1.1 节</h2><p>text</p>
</body></html>`;

    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([{
          repo_id: "mobile-toc-book", book_id: "mtoc", title: "移动端TOC", author: "test",
          description: "", language: "TS", html_url: "", status: "done",
          chapter_count: 1, completed_chapters: 1, current_phase: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]),
      });
    });
    await page.route("**/api/books/by-repo/mobile-toc-book", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        book_id: "mtoc", title: "移动端TOC", html_content: htmlWithHeadings, cover_html: null, chapters: [],
      })});
    });
    await page.route("**/api/reading/progress", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/");
    await page.locator('[data-testid^="book-card-grid-mobile-toc-book"]').click({ timeout: 10000 });
    await page.locator('[data-testid="book-detail-read"]').click();

    // Toggle button visible on mobile, desktop TOC sidebar hidden
    await expect(page.locator('[data-testid="html-reader-toc-toggle"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="html-reader-toc"]')).not.toBeVisible();

    // Open mobile TOC overlay
    await page.locator('[data-testid="html-reader-toc-toggle"]').click();
    await expect(page.locator('[data-testid="html-reader-toc-mobile"]')).toBeVisible();

    // Click a TOC item in mobile overlay — overlay closes
    await page.locator('[data-testid="html-reader-toc-mobile"] [data-testid="html-reader-toc-s0"]').click();
    await expect(page.locator('[data-testid="html-reader-toc-mobile"]')).not.toBeVisible({ timeout: 3000 });
  });

  test("shows regenerate button for failed book generation", async ({ page }) => {
    let readmeCalled = false;
    let generateCalled = false;

    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            repo_id: "test-failed-book",
            book_id: "book-gen-failed",
            title: "失败的生成",
            author: "test-author",
            description: "This book generation failed",
            language: "Python",
            html_url: "https://github.com/test-author/failed-book",
            status: "failed",
            chapter_count: 0,
            completed_chapters: 0,
            current_phase: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.route("**/api/repos/test-failed-book/fetch-readme", async (route) => {
      readmeCalled = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, length: 800 }) });
    });

    await page.route("**/api/agents/generate-book/test-failed-book", async (route) => {
      generateCalled = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/");

    const bookCard = page.locator('[data-testid^="book-card-grid-test-failed-book"]');
    await expect(bookCard).toBeVisible({ timeout: 10000 });
    await bookCard.click();

    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();
    const genBtn = page.locator('[data-testid="book-detail-generate"]');
    await expect(genBtn).toBeVisible();
    await expect(genBtn).toContainText("重新生成");

    await genBtn.click();
    await page.waitForTimeout(500);
    expect(readmeCalled).toBe(true);
    expect(generateCalled).toBe(true);
  });
});

test.describe("Bookshelf - Mobile Navigation", () => {
  test("renders mobile nav on small viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
    await expect(page.locator('[data-testid="mobile-nav-shelf"]')).toBeVisible();
    await expect(page.locator('[data-testid="mobile-nav-favorites"]')).toBeVisible();
  });
});

test.describe("Bookshelf - Sidebar Navigation", () => {
  test("navigates between sections", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="sidebar-nav-recent"]').click();
    await expect(page.locator('[data-testid="section-title"]')).toBeVisible();

    await page.locator('[data-testid="sidebar-nav-favorites"]').click();
    await expect(page.locator('[data-testid="section-title"]')).toBeVisible();

    await page.locator('[data-testid="sidebar-nav-shelf"]').click();
    await expect(page.locator('[data-testid="section-title"]')).toBeVisible();
  });
});

test.describe("Bookshelf - Reader", () => {
  test("opens reader from book detail", async ({ page }) => {
    await page.goto("/");

    // Open book detail
    const bookCard = page.locator('[data-testid^="book-card-grid-"]').first();
    await bookCard.click();

    // Click read button
    await page.locator('[data-testid="book-detail-read"]').click();

    // Reader should be visible
    await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="reader-topbar"]')).toBeVisible();
    await expect(page.locator('[data-testid="reader-title"]')).toBeVisible();
  });

  test("closes reader and returns to shelf", async ({ page }) => {
    await page.goto("/");

    const bookCard = page.locator('[data-testid^="book-card-grid-"]').first();
    await bookCard.click();
    await page.locator('[data-testid="book-detail-read"]').click();

    await page.locator('[data-testid="reader-back"]').click();

    // Should be back on shelf
    await expect(page.locator('[data-testid="reader-modal"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="header-bar"]')).toBeVisible();
  });
});

test.describe("Bookshelf - Delete Book", () => {
  test("deletes book from shelf via detail modal", async ({ page }) => {
    let deleteCalled = false;

    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([{
          repo_id: "test-delete-book", book_id: "gen-delete", title: "待删除书", author: "test-user",
          description: "This will be deleted", language: "JS", html_url: "https://github.com/test-user/delete",
          status: "done", chapter_count: 3, completed_chapters: 3, current_phase: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]),
      });
    });

    await page.route("**/api/books/test-delete-book", async (route) => {
      deleteCalled = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, deleted: "test-delete-book", repo: "test-user/delete" }) });
    });

    await page.goto("/");

    const bookCard = page.locator('[data-testid^="book-card-grid-test-delete-book"]');
    await expect(bookCard).toBeVisible({ timeout: 10000 });
    await bookCard.click();

    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();

    // Click delete to reveal confirmation
    await page.locator('[data-testid="book-detail-delete"]').click();
    await expect(page.locator('[data-testid="book-detail-delete-confirm"]')).toBeVisible();

    // Confirm deletion
    await page.locator('[data-testid="book-detail-delete-confirm"]').click();

    // Book should be gone from the shelf
    await expect(bookCard).not.toBeVisible({ timeout: 5000 });
    expect(deleteCalled).toBe(true);
  });
});

test.describe("Bookshelf - Edit Description", () => {
  test("edits book description inline in detail modal", async ({ page }) => {
    let patchData: Record<string, any> = {};

    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([{
          repo_id: "test-edit-book", book_id: "gen-edit", title: "可编辑书", author: "test-user",
          description: "原始描述", language: "Go", html_url: "https://github.com/test-user/edit",
          status: "done", chapter_count: 1, completed_chapters: 1, current_phase: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]),
      });
    });

    await page.route("**/api/books/test-edit-book", async (route) => {
      const req = route.request();
      if (req.method() === "PATCH") {
        patchData = JSON.parse(req.postData() || "{}");
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/");

    const bookCard = page.locator('[data-testid^="book-card-grid-test-edit-book"]');
    await expect(bookCard).toBeVisible({ timeout: 10000 });
    await bookCard.click();

    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();

    // Click edit button
    await page.locator('[data-testid="book-detail-edit"]').click();
    await expect(page.locator('[data-testid="book-detail-edit-textarea"]')).toBeVisible();

    // Clear and type new description
    const textarea = page.locator('[data-testid="book-detail-edit-textarea"]');
    await textarea.fill("新的描述内容");

    // Save
    await page.locator('[data-testid="book-detail-edit-save"]').click();

    // Verify PATCH was called with correct data
    await page.waitForTimeout(300);
    expect(patchData).toEqual({ description: "新的描述内容" });
  });
});

test.describe("Bookshelf - Favorites", () => {
  test("filters to favorites section", async ({ page }) => {
    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([
          { repo_id: "fav-book-1", book_id: "gen-f1", title: "收藏书1", author: "a1", description: "", language: "TS", html_url: "https://a.com/1", status: "done", chapter_count: 2, completed_chapters: 2, current_phase: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { repo_id: "fav-book-2", book_id: "gen-f2", title: "收藏书2", author: "a2", description: "", language: "TS", html_url: "https://a.com/2", status: "done", chapter_count: 1, completed_chapters: 1, current_phase: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ]),
      });
    });

    await page.goto("/");

    await expect(page.locator('[data-testid^="book-card-grid-fav-book-1"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid^="book-card-grid-fav-book-2"]')).toBeVisible({ timeout: 10000 });

    // Click favorites in sidebar
    await page.locator('[data-testid="sidebar-nav-favorites"]').click();

    // Section title should show "收藏夹"
    await expect(page.locator('[data-testid="section-title"]')).toContainText("收藏夹");
  });

  test("toggles favorite in book detail", async ({ page }) => {
    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([{
          repo_id: "fav-toggle-book", book_id: "gen-ft", title: "切换收藏", author: "test",
          description: "", language: "Rust", html_url: "https://github.com/test/ft",
          status: "done", chapter_count: 1, completed_chapters: 1, current_phase: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]),
      });
    });

    await page.goto("/");

    const bookCard = page.locator('[data-testid^="book-card-grid-fav-toggle-book"]');
    await expect(bookCard).toBeVisible({ timeout: 10000 });
    await bookCard.click();

    await page.locator('[data-testid="book-detail-favorite"]').click();
    // Modal stays open after toggle
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible();
  });
});

test.describe("Bookshelf - Category Filter", () => {
  test("switches category and filters books", async ({ page }) => {
    await page.goto("/");

    await page.locator('[data-testid="sidebar-category-fiction"]').click();
    await expect(page.locator('[data-testid="section-title"]')).toBeVisible();

    await page.locator('[data-testid="sidebar-category-all"]').click();
    await expect(page.locator('[data-testid="section-title"]')).toBeVisible();
  });

  test("category filter shows only matching books", async ({ page }) => {
    await page.goto("/");

    // Click fiction — should show 百年孤独 (fiction) but not 设计心理学 (nonfiction)
    await page.locator('[data-testid="sidebar-category-fiction"]').click();
    await expect(page.locator('[data-testid="book-card-grid-3"]')).toBeVisible({ timeout: 5000 });
    // 设计心理学 (id=2) is nonfiction, should be hidden
    await expect(page.locator('[data-testid="book-card-grid-2"]')).not.toBeVisible({ timeout: 3000 });

    // Click manga — should show only 鬼灭之刃 (id=8)
    await page.locator('[data-testid="sidebar-category-manga"]').click();
    await expect(page.locator('[data-testid="book-card-grid-8"]')).toBeVisible({ timeout: 5000 });
    // 百年孤独 (id=1) is fiction, should be hidden under manga
    await expect(page.locator('[data-testid="book-card-grid-1"]')).not.toBeVisible({ timeout: 3000 });

    // Back to all — both should be visible again
    await page.locator('[data-testid="sidebar-category-all"]').click();
    await expect(page.locator('[data-testid="book-card-grid-8"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="book-card-grid-1"]')).toBeVisible({ timeout: 5000 });
  });

  test("category badges show correct demo-only book counts", async ({ page }) => {
    await page.route("**/api/books", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.goto("/");

    const fictionBtn = page.locator('[data-testid="sidebar-category-fiction"]');
    await expect(fictionBtn).toContainText("3");

    const mangaBtn = page.locator('[data-testid="sidebar-category-manga"]');
    await expect(mangaBtn).toContainText("1");

    const academicBtn = page.locator('[data-testid="sidebar-category-academic"]');
    await expect(academicBtn).toContainText("3");

    const allBtn = page.locator('[data-testid="sidebar-category-all"]');
    await expect(allBtn).toContainText("13");

    const generatedBtn = page.locator('[data-testid="sidebar-category-generated"]');
    await expect(generatedBtn).toContainText("0");
  });

  test("AI Generated category shows dynamic count from API", async ({ page }) => {
    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([
          { repo_id: "gen-a", book_id: "ga", title: "Book A", author: "a", description: "", language: "TS", html_url: "https://a.com", status: "done", chapter_count: 1, completed_chapters: 1, current_phase: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { repo_id: "gen-b", book_id: "gb", title: "Book B", author: "b", description: "", language: "Go", html_url: "https://b.com", status: "done", chapter_count: 2, completed_chapters: 2, current_phase: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ]),
      });
    });

    await page.goto("/");

    const generatedBtn = page.locator('[data-testid="sidebar-category-generated"]');
    await expect(generatedBtn).toContainText("2");

    const allBtn = page.locator('[data-testid="sidebar-category-all"]');
    await expect(allBtn).toContainText("15");
  });

  test("AI Generated category shows API books not demos", async ({ page }) => {
    await page.route("**/api/books", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([
          { repo_id: "gen-cat-1", book_id: "g1", title: "AI生成书籍", author: "ai", description: "", language: "TS", html_url: "https://a.com", status: "done", chapter_count: 3, completed_chapters: 3, current_phase: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { repo_id: "gen-cat-2", book_id: "g2", title: "AI生成第二本", author: "ai2", description: "", language: "Go", html_url: "https://b.com", status: "writing", chapter_count: 5, completed_chapters: 2, current_phase: "writing", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ]),
      });
    });

    await page.goto("/");

    await page.locator('[data-testid="sidebar-category-generated"]').click();

    await expect(page.locator('[data-testid^="book-card-grid-gen-cat-1"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid^="book-card-grid-gen-cat-2"]')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('[data-testid="book-card-grid-1"]')).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe("Bookshelf - Search", () => {
  test("search filters books by title", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill("百年孤独");

    await expect(page.locator('[data-testid="book-card-grid-1"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="book-card-grid-2"]')).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="book-card-grid-3"]')).not.toBeVisible({ timeout: 3000 });

    await page.locator('[data-testid="search-clear"]').click();
    await expect(page.locator('[data-testid="book-card-grid-2"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="book-card-grid-3"]')).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Bookshelf - Multiple Books", () => {
  test("renders multiple books from API", async ({ page }) => {
    await page.route("**/api/books", async (route) => {
      const books = Array.from({ length: 5 }, (_, i) => ({
        repo_id: `multi-book-${i}`,
        book_id: `gen-multi-${i}`,
        title: `多书测试 ${i + 1}`,
        author: `author-${i}`,
        description: `Book ${i + 1} description`,
        language: "TypeScript",
        html_url: `https://github.com/a/book-${i}`,
        status: i < 3 ? "done" : "writing",
        chapter_count: i + 1,
        completed_chapters: i < 3 ? i + 1 : 0,
        current_phase: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(books) });
    });

    await page.goto("/");

    // All 5 books should appear
    for (let i = 0; i < 5; i++) {
      await expect(page.locator(`[data-testid^="book-card-grid-multi-book-${i}"]`)).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe("Bookshelf - Demo Books", () => {
  test("shows demo books when API returns empty", async ({ page }) => {
    await page.route("**/api/books", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.goto("/");

    // Demo books should still be visible
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
          chapter_count: 4, completed_chapters: 1, current_phase: "writing",
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
  test("shows progress bar on book card after scrolling through HTML content", async ({ page }) => {
    test.setTimeout(90000);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Find youtoarticle card (real data from backend)
    const card = page.locator('[data-testid^="book-card-"]', { has: page.locator('h3:text("youtoarticle")') });
    await expect(card).toBeVisible({ timeout: 15000 });

    // Verify no progress bar initially (progress may be 0 from fresh state)
    const initialPb = card.locator('[data-testid^="book-progress-"]');

    // Open detail modal
    await card.click();
    await expect(page.locator('[data-testid="book-detail-content"]')).toBeVisible({ timeout: 5000 });

    // Click "Read" to open reader
    await page.locator('[data-testid="book-detail-read"]').click();
    await expect(page.locator('[data-testid="reader-modal"]')).toBeVisible({ timeout: 15000 });

    // Wait for real content to load, then scroll
    const iframe = page.locator('[data-testid="reader-modal"] iframe');
    await expect(iframe).toBeVisible({ timeout: 10000 });

    // Scroll the iframe to ~60% to trigger progress save
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="reader-modal"] iframe') as HTMLIFrameElement;
      if (el?.contentDocument) {
        const docEl = el.contentDocument.documentElement;
        docEl.scrollTop = Math.round(docEl.scrollHeight * 0.6);
        el.contentDocument.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
    });

    // Wait for debounced save (2s debounce + 500ms flush)
    await page.waitForTimeout(4000);

    // Close reader
    await page.locator('[data-testid="reader-back"]').click();
    await page.waitForTimeout(2000);

    // Reload to pick up saved progress
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const cardAfter = page.locator('[data-testid^="book-card-"]', { has: page.locator('h3:text("youtoarticle")') });
    await expect(cardAfter).toBeVisible({ timeout: 15000 });

    const pb = cardAfter.locator('[data-testid^="book-progress-"]');
    await expect(pb).toBeVisible({ timeout: 5000 });
    await expect(pb).toContainText(/\d+%/);
  });
});
