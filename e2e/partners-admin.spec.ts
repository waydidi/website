import { expect, test } from "@playwright/test";

test("partner join page shows the application form", async ({ page }) => {
  await page.goto("/partners");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Earn");
  await page.getByRole("link", { name: "Apply to join" }).first().click();
  await expect(page.getByRole("textbox", { name: "Your name or business name" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
});

test("admin sign-in form", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Admin ID" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Admin key" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Stay signed in for 30 days" })).toBeVisible();
});

test("customer sign-in asks for an email", async ({ page }) => {
  await page.goto("/account/sign-in");
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("maintenance page has WhatsApp help and a sign-in button", async ({ page }) => {
  await page.goto("/maintenance");
  await expect(page.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", /wa\.me/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
