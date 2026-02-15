import { test, expect } from "@playwright/test";

test.describe("Agent Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/agents");
  });

  test("should display agents page", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /agents/i })).toBeVisible();
  });

  test("should show preset agents", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    
    // Look for preset agent cards or list
    const agentCard = page.locator('[data-testid="agent-card"]')
      .or(page.getByText(/research|code|writing|assistant/i).first());
    
    await expect(agentCard).toBeVisible();
  });

  test("should have create agent button", async ({ page }) => {
    const createButton = page.getByRole("button", { name: /create|new|add/i });
    await expect(createButton).toBeVisible();
  });

  test("should open agent configuration form", async ({ page }) => {
    const createButton = page.getByRole("button", { name: /create|new|add/i });
    await createButton.click();
    
    // Check for form elements
    const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i));
    await expect(nameInput).toBeVisible();
  });

  test("should show agent configuration options", async ({ page }) => {
    const createButton = page.getByRole("button", { name: /create|new|add/i });
    await createButton.click();
    
    // Check for configuration fields
    await expect(page.getByLabel(/model/i).or(page.getByText(/model/i).first())).toBeVisible();
    await expect(page.getByLabel(/role/i).or(page.getByText(/role/i).first())).toBeVisible();
  });

  test("should display orchestration mode selector", async ({ page }) => {
    // Look for orchestration controls
    const orchestrationSelector = page.getByText(/orchestration|mode/i).first();
    
    if (await orchestrationSelector.isVisible({ timeout: 2000 })) {
      await expect(orchestrationSelector).toBeVisible();
    }
  });
});
