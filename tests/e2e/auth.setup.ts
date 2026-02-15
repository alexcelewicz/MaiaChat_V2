import { test as setup, expect } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  // Navigate to login page
  await page.goto("/login");

  // Wait for the login form to be visible
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

  // Fill in login credentials
  // Using test account credentials from environment variables
  const email = process.env.TEST_USER_EMAIL || "test@example.com";
  const password = process.env.TEST_USER_PASSWORD || "testpassword123";

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);

  // Click login button
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait for navigation to dashboard
  await page.waitForURL("/chat**", { timeout: 15000 });

  // Verify we're logged in
  await expect(page).toHaveURL(/.*chat/);

  // Save storage state
  await page.context().storageState({ path: authFile });
});
