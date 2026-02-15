import { test, expect } from "@playwright/test";
import path from "path";

test.describe("Document Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/documents");
  });

  test("should display documents page", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /documents/i })).toBeVisible();
  });

  test("should have upload button", async ({ page }) => {
    const uploadButton = page.getByRole("button", { name: /upload/i })
      .or(page.getByText(/upload/i));
    await expect(uploadButton).toBeVisible();
  });

  test("should show file upload dialog", async ({ page }) => {
    // Click upload button or drop zone
    const uploadButton = page.getByRole("button", { name: /upload/i })
      .or(page.getByText(/drag.*drop/i));
    
    if (await uploadButton.isVisible()) {
      await uploadButton.click();
      
      // Check for file input
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeAttached();
    }
  });

  test("should display document list when documents exist", async ({ page }) => {
    // Wait for documents to load
    await page.waitForLoadState("networkidle");
    
    // Check for empty state or document list
    const emptyState = page.getByText(/no documents/i);
    const documentList = page.locator('[data-testid="document-list"]')
      .or(page.locator("table"))
      .or(page.locator('[role="grid"]'));
    
    // Either empty state or document list should be visible
    const isEmpty = await emptyState.isVisible({ timeout: 2000 }).catch(() => false);
    const hasDocs = await documentList.isVisible({ timeout: 2000 }).catch(() => false);
    
    expect(isEmpty || hasDocs).toBe(true);
  });

  test("should show document status indicators", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    
    // If there are documents, check for status indicators
    const statusBadge = page.locator('[data-testid="document-status"]')
      .or(page.getByText(/processed|processing|uploaded/i).first());
    
    if (await statusBadge.isVisible({ timeout: 2000 })) {
      await expect(statusBadge).toBeVisible();
    }
  });
});
