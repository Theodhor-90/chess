import { test, expect } from "@playwright/test";

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("h1")).toHaveText("Login");
  await expect(page.locator('input[id="email"]')).toBeVisible();
  await expect(page.locator('input[id="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toHaveText("Login");
});

test("register page loads", async ({ page }) => {
  await page.goto("/register");
  await expect(page.locator("h1")).toHaveText("Register");
  await expect(page.locator('input[id="email"]')).toBeVisible();
  await expect(page.locator('input[id="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toHaveText("Register");
});

test("unauthenticated user is redirected to login", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/login**");
  await expect(page.locator("h1")).toHaveText("Login");
});

test("health endpoint responds", async ({ request }) => {
  const apiPort = 3100;
  const response = await request.get(`http://localhost:${apiPort}/health`);
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body).toEqual({ status: "ok" });
});
