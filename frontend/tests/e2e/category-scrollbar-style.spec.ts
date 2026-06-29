import { test, expect } from "@playwright/test";

// Verifies the category picker's scrollable list hides its scrollbar to match
// the app-wide convention (App.tsx uses `scrollbarWidth: "none"` on its scroll
// containers). A bare `overflow-y-auto` would show a default browser scrollbar
// that visually clashes with the rest of the UI.
test.describe("Category scrollbar style alignment", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("category picker scroll list hides scrollbar like the rest of the app", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.locator('[data-testid="category-pill"]').click();
    const picker = page.locator('[data-testid="category-picker"]');
    await expect(picker).toBeVisible({ timeout: 5000 });

    // The scrollable category-rows container is the direct scroll region inside
    // the picker. Assert its computed scrollbar treatment matches the app style.
    const scrollContainer = picker.locator("div.overflow-y-auto").first();
    await expect(scrollContainer).toBeVisible();

    const scrollbarWidth = await scrollContainer.evaluate(
      (el) => getComputedStyle(el).scrollbarWidth,
    );
    console.log("[category-picker] scrollbarWidth =", scrollbarWidth);
    expect(scrollbarWidth).toBe("none");
  });
});
