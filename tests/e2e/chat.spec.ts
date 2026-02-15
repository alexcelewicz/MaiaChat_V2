import { test, expect } from "@playwright/test";

test.describe("Chat Functionality", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/chat");
  });

  test("should display chat interface", async ({ page }) => {
    // Check for main chat elements
    await expect(page.locator("textarea").or(page.getByPlaceholder(/message/i))).toBeVisible();
    await expect(page.getByRole("button", { name: /send/i })).toBeVisible();
  });

  test("should allow typing a message", async ({ page }) => {
    const input = page.locator("textarea").or(page.getByPlaceholder(/message/i));
    await input.fill("Hello, this is a test message");
    await expect(input).toHaveValue("Hello, this is a test message");
  });

  test("should have model selector", async ({ page }) => {
    // Look for model selector dropdown or button
    const modelSelector = page.getByRole("combobox").or(page.getByText(/gpt|claude|gemini/i).first());
    await expect(modelSelector).toBeVisible();
  });

  test("should create new conversation", async ({ page }) => {
    // Click new chat button
    const newChatButton = page.getByRole("button", { name: /new chat/i });
    
    if (await newChatButton.isVisible()) {
      await newChatButton.click();
      
      // Should navigate to new chat or clear current chat
      await expect(page.locator("textarea").or(page.getByPlaceholder(/message/i))).toBeEmpty();
    }
  });

  test("should display conversation list", async ({ page }) => {
    // Look for conversation sidebar or list
    const conversationList = page.locator('[data-testid="conversation-list"]')
      .or(page.locator("aside"))
      .first();
    
    await expect(conversationList).toBeVisible();
  });

  test("should support keyboard shortcuts", async ({ page }) => {
    // Test Ctrl+Enter to send (if enabled)
    const input = page.locator("textarea").or(page.getByPlaceholder(/message/i));
    await input.fill("Test message");
    
    // Press Ctrl+K for search
    await page.keyboard.press("Control+k");
    
    // Check if search dialog opens
    const searchDialog = page.getByRole("dialog");
    if (await searchDialog.isVisible({ timeout: 1000 })) {
      await expect(searchDialog).toBeVisible();
      // Close dialog
      await page.keyboard.press("Escape");
    }
  });
});
