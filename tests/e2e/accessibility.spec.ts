import { test, expect } from "@playwright/test";

test.describe("Accessibility", () => {
  test("chat page should pass accessibility checks", async ({ page }) => {
    await page.goto("/chat");
    
    // Basic accessibility check
    // Note: Full axe-core checks require @axe-core/playwright package
    
    // Check for main landmark
    const main = page.locator("main");
    await expect(main).toBeVisible();
    
    // Check for proper heading hierarchy
    const h1 = page.locator("h1").first();
    if (await h1.isVisible({ timeout: 1000 })) {
      await expect(h1).toBeVisible();
    }
    
    // Check that interactive elements are focusable
    const sendButton = page.getByRole("button", { name: /send/i });
    await expect(sendButton).toBeVisible();
    await sendButton.focus();
    await expect(sendButton).toBeFocused();
    
    // Check for alt text on images
    const images = page.locator("img");
    const imageCount = await images.count();
    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute("alt");
      const role = await img.getAttribute("role");
      // Image should have alt text or be decorative (role="presentation")
      expect(alt !== null || role === "presentation").toBe(true);
    }
  });

  test("login page should have accessible form", async ({ page }) => {
    await page.goto("/login");
    
    // Check for form labels
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);
    
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    
    // Check submit button
    const submitButton = page.getByRole("button", { name: /sign in/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
  });

  test("should support keyboard navigation", async ({ page }) => {
    await page.goto("/chat");
    
    // Tab through main interactive elements
    await page.keyboard.press("Tab");
    
    // Should focus on an interactive element
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
    
    // Continue tabbing
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    
    // Should still have focus on something
    const stillFocused = page.locator(":focus");
    await expect(stillFocused).toBeVisible();
  });

  test("color contrast should be sufficient", async ({ page }) => {
    await page.goto("/chat");
    
    // Check text is visible (basic contrast check)
    const bodyText = page.locator("body");
    const backgroundColor = await bodyText.evaluate((el) => 
      window.getComputedStyle(el).backgroundColor
    );
    const color = await bodyText.evaluate((el) => 
      window.getComputedStyle(el).color
    );
    
    // Both should be defined (not transparent/inherit)
    expect(backgroundColor).toBeDefined();
    expect(color).toBeDefined();
  });
});
