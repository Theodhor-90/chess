import { test, expect } from "@playwright/test";
import { registerUser, loginUser, uniqueEmail } from "./helpers.js";

const TEST_PASSWORD = "TestPass123!";

test.describe("Auth Flow", () => {
  test("register new user and redirect to dashboard", async ({ page }) => {
    const email = uniqueEmail();
    await registerUser(page, email, TEST_PASSWORD);

    // Should be on the dashboard
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("h1")).toHaveText("Chess Platform");
    // NavHeader should display the user's email
    await expect(page.locator('[data-testid="user-email"]')).toHaveText(email);
  });

  test("login with existing credentials", async ({ page, context }) => {
    const email = uniqueEmail();

    // First register a user
    await registerUser(page, email, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/$/);

    // Clear cookies to simulate a logged-out state (new session)
    await context.clearCookies();

    // Now login with the same credentials
    await loginUser(page, email, TEST_PASSWORD);

    // Should be on the dashboard
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("h1")).toHaveText("Chess Platform");
    await expect(page.locator('[data-testid="user-email"]')).toHaveText(email);
  });

  test("protected route redirects unauthenticated user to login", async ({ page }) => {
    // Navigate directly to the dashboard without being logged in
    await page.goto("/");
    // ProtectedRoute should redirect to /login?redirect=%2F
    await page.waitForURL("**/login**");
    await expect(page.locator("h1")).toHaveText("Login");
    // The URL should contain the redirect query parameter
    expect(page.url()).toContain("redirect=%2F");
  });

  test("invalid credentials shows error message", async ({ page }) => {
    // Navigate to login page
    await page.goto("/login");
    // Fill in a non-existent email with a valid-length password
    await page.locator('input[id="email"]').fill("nonexistent@example.com");
    await page.locator('input[id="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Should show error message in the alert element
    await expect(page.locator('p[role="alert"]')).toHaveText("Invalid email or password");

    // Should still be on the login page (not redirected)
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("h1")).toHaveText("Login");
  });
});
