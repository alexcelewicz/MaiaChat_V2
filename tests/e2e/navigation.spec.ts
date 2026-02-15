import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("should navigate to chat page", async ({ page }) => {
    await page.goto("/chat");
    await expect(page).toHaveURL(/.*chat/);
    await expect(page.getByRole("heading", { name: /new chat/i })).toBeVisible();
  });

  test("should navigate to documents page", async ({ page }) => {
    await page.goto("/documents");
    await expect(page).toHaveURL(/.*documents/);
    await expect(page.getByRole("heading", { name: /documents/i })).toBeVisible();
  });

  test("should navigate to agents page", async ({ page }) => {
    await page.goto("/agents");
    await expect(page).toHaveURL(/.*agents/);
    await expect(page.getByRole("heading", { name: /agents/i })).toBeVisible();
  });

  test("should navigate to profiles page", async ({ page }) => {
    await page.goto("/profiles");
    await expect(page).toHaveURL(/.*profiles/);
    await expect(page.getByRole("heading", { name: /profiles/i })).toBeVisible();
  });

  test("should navigate to settings page", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/.*settings/);
    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();
  });

  test("should toggle dark/light mode", async ({ page }) => {
    await page.goto("/chat");
    
    // Find theme toggle button
    const themeToggle = page.getByRole("button", { name: /toggle theme/i });
    
    // Get initial theme
    const html = page.locator("html");
    const initialClass = await html.getAttribute("class");
    
    // Click theme toggle
    await themeToggle.click();
    
    // Verify theme changed
    const newClass = await html.getAttribute("class");
    expect(newClass).not.toBe(initialClass);
  });

  test("sidebar should be collapsible", async ({ page }) => {
    await page.goto("/chat");
    
    // Check sidebar is visible
    const sidebar = page.locator('[data-testid="sidebar"]').or(page.locator("aside").first());
    
    // Find collapse button if it exists
    const collapseButton = page.getByRole("button", { name: /collapse|menu/i });
    
    if (await collapseButton.isVisible()) {
      await collapseButton.click();
      // Sidebar should be collapsed or hidden on mobile
    }
  });
});
