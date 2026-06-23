import { test, expect, type Page } from "@playwright/test";

async function openImportDialog(page: Page) {
  await page.locator('[data-testid="sidebar-import"]').click();
  await page.locator('[data-testid="import-dialog-content"]').waitFor({ state: "visible", timeout: 5000 });
}

async function switchToYouTubeTab(page: Page) {
  await page.locator('button:has-text("YouTube")').click();
  await expect(page.locator('button:has-text("YouTube")')).toHaveCSS(
    "border-bottom-color",
    /var\(--accent\)|rgb\(193, 127, 58\)/,
  );
}

async function fillYouTubeUrl(page: Page, url: string) {
  await page.locator('[data-testid="import-dialog-input"]').fill(url);
}

async function submitImport(page: Page) {
  await page.locator('[data-testid="import-dialog-submit"]').click();
}

test.describe("YouTube Import - Dialog UI", () => {
  test("import dialog shows YouTube tab", async ({ page }) => {
    await page.goto("/");
    await openImportDialog(page);

    await expect(page.locator('button:has-text("YouTube")')).toBeVisible();
  });

  test("switching to YouTube tab shows URL input with hint", async ({ page }) => {
    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);

    await expect(page.locator('[data-testid="import-dialog-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-input"]')).toHaveAttribute(
      "placeholder",
      /youtube\.com\/watch/,
    );
    await expect(page.locator("text=支持 youtube.com 和 youtu.be 链接")).toBeVisible();
  });

  test("invalid URL shows validation error and disables submit", async ({ page }) => {
    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);

    await fillYouTubeUrl(page, "not-a-youtube-link");
    await expect(page.locator('[data-testid="import-dialog-error-format"]')).toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-error-format"]')).toContainText("有效的 YouTube");
    await expect(page.locator('[data-testid="import-dialog-submit"]')).toBeDisabled();
  });

  test("valid youtube.com/watch URL enables submit", async ({ page }) => {
    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);

    await fillYouTubeUrl(page, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(page.locator('[data-testid="import-dialog-error-format"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-submit"]')).not.toBeDisabled();
  });

  test("valid youtu.be shortlink enables submit", async ({ page }) => {
    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);

    await fillYouTubeUrl(page, "https://youtu.be/dQw4w9WgXcQ");
    await expect(page.locator('[data-testid="import-dialog-error-format"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-submit"]')).not.toBeDisabled();
  });

  test("valid youtube.com/embed URL enables submit", async ({ page }) => {
    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);

    await fillYouTubeUrl(page, "https://www.youtube.com/embed/dQw4w9WgXcQ");
    await expect(page.locator('[data-testid="import-dialog-error-format"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-submit"]')).not.toBeDisabled();
  });

  test("valid youtube.com/shorts URL enables submit", async ({ page }) => {
    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);

    await fillYouTubeUrl(page, "https://www.youtube.com/shorts/dQw4w9WgXcQ");
    await expect(page.locator('[data-testid="import-dialog-error-format"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-submit"]')).not.toBeDisabled();
  });
});

test.describe("YouTube Import - API Integration", () => {
  test("shows success state when API returns started with video_title", async ({ page }) => {
    await page.route("**/api/youtube/generate-book", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.url).toContain("youtube.com/watch?v=dQw4w9WgXcQ");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "started",
          repo_id: "test-repo-123",
          video_id: "dQw4w9WgXcQ",
          video_title: "Rick Astley - Never Gonna Give You Up",
        }),
      });
    });

    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);
    await fillYouTubeUrl(page, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await submitImport(page);

    await expect(page.locator("text=字幕已提取")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=AI 书籍生成已启动")).toBeVisible();
    // Title should show the real video title, not the video ID
    await expect(page.locator("text=Rick Astley - Never Gonna Give You Up").first()).toBeVisible();
    await expect(page.locator("text=YouTube:dQw4w9WgXcQ")).not.toBeVisible();

    const doneBtn = page.locator('button:has-text("完成")');
    await expect(doneBtn).toBeVisible();
    await doneBtn.click();
    await expect(page.locator('[data-testid="import-dialog-content"]')).not.toBeVisible();
  });

  test("shows error when API returns 409 (already in progress)", async ({ page }) => {
    await page.route("**/api/youtube/generate-book", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Book generation already in progress" }),
      });
    });

    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);
    await fillYouTubeUrl(page, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await submitImport(page);

    await expect(page.locator('[data-testid="import-dialog-error"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="import-dialog-error-message"]')).toContainText(
      "Book generation already in progress",
    );
  });

  test("shows error when API returns 500", async ({ page }) => {
    await page.route("**/api/youtube/generate-book", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Internal server error" }),
      });
    });

    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);
    await fillYouTubeUrl(page, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await submitImport(page);

    await expect(page.locator('[data-testid="import-dialog-error"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="import-dialog-error-message"]')).toContainText(
      "Internal server error",
    );
  });

  test("shows error when API returns server validation error", async ({ page }) => {
    await page.route("**/api/youtube/generate-book", async (route) => {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Could not extract video ID from URL" }),
      });
    });

    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);
    await fillYouTubeUrl(page, "https://www.youtube.com/watch?v=aaaaa111111");
    await submitImport(page);

    await expect(page.locator('[data-testid="import-dialog-error"]')).toBeVisible({ timeout: 10000 });
  });

  test("sends correct POST body with URL", async ({ page }) => {
    const apiPromise = page.waitForRequest(
      (req) => req.url().includes("/api/youtube/generate-book") && req.method() === "POST",
    );

    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);
    await fillYouTubeUrl(page, "https://youtu.be/abcdefghijk");
    await submitImport(page);

    const request = await apiPromise;
    const body = request.postDataJSON();
    expect(body).toEqual({ url: "https://youtu.be/abcdefghijk" });
    expect(request.headers()["content-type"]).toBe("application/json");
  });

  test("shows loading state while API is pending", async ({ page }) => {
    let resolvePromise: () => void;
    const delayed = new Promise<void>((r) => { resolvePromise = r; });

    await page.route("**/api/youtube/generate-book", async (route) => {
      await delayed;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "started", repo_id: "x", video_id: "x" }),
      });
    });

    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);
    await fillYouTubeUrl(page, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await submitImport(page);

    await expect(page.locator("text=正在提取视频字幕")).toBeVisible();
    resolvePromise!();
  });
});

test.describe("YouTube Import - Edge Cases", () => {
  test("Enter key submits when URL is valid", async ({ page }) => {
    await page.route("**/api/youtube/generate-book", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "started", repo_id: "r", video_id: "v" }),
      });
    });

    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);
    await fillYouTubeUrl(page, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.locator('[data-testid="import-dialog-input"]').press("Enter");

    await expect(page.locator("text=字幕已提取")).toBeVisible({ timeout: 10000 });
  });

  test("Enter key does nothing when URL is invalid", async ({ page }) => {
    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);
    await fillYouTubeUrl(page, "not-a-url");
    await page.locator('[data-testid="import-dialog-input"]').press("Enter");

    await expect(page.locator('[data-testid="import-dialog-content"]')).toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-error"]')).not.toBeVisible();
  });

  test("retry button appears after error and works", async ({ page }) => {
    let callCount = 0;
    await page.route("**/api/youtube/generate-book", async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "started", repo_id: "r", video_id: "v" }),
        });
      }
    });

    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);
    await fillYouTubeUrl(page, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await submitImport(page);

    await expect(page.locator('[data-testid="import-dialog-error"]')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("重试")').click();

    await expect(page.locator('[data-testid="import-dialog-input"]')).toBeVisible();
    await submitImport(page);
    await expect(page.locator("text=字幕已提取")).toBeVisible({ timeout: 10000 });
  });

  test("shows already_done message when book already exists", async ({ page }) => {
    await page.route("**/api/youtube/generate-book", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "already_done",
          repo_id: "test-repo-456",
          video_id: "dQw4w9WgXcQ",
          video_title: "Rick Astley - Never Gonna Give You Up",
        }),
      });
    });

    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);
    await fillYouTubeUrl(page, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await submitImport(page);

    await expect(page.locator("text=书籍已存在")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=可直接阅读")).toBeVisible();
    await expect(page.locator("text=AI 书籍生成已启动")).not.toBeVisible();
  });

  test("uses video_id as title when oEmbed lookup fails", async ({ page }) => {
    await page.route("**/api/youtube/generate-book", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "started",
          repo_id: "test-repo-789",
          video_id: "dQw4w9WgXcQ",
          video_title: "dQw4w9WgXcQ",
        }),
      });
    });

    await page.goto("/");
    await openImportDialog(page);
    await switchToYouTubeTab(page);
    await fillYouTubeUrl(page, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await submitImport(page);

    await expect(page.locator("text=字幕已提取")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=AI 书籍生成已启动")).toBeVisible();
    await expect(page.locator('p:has-text("dQw4w9WgXcQ")').first()).toBeVisible();
  });
});
