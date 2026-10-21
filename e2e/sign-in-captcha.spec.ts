import { expect, test } from "@playwright/test";

// The sign-in box shows the bot check ("Success!") and sends its result with the email; each send uses a fresh check.
const FAKE_TURNSTILE = `
  let n = 0;
  window.turnstile = {
    render(el, opts) {
      window.__tsOpts = opts;
      const run = () => { el.textContent = "Success!"; el.setAttribute("data-testid", "captcha"); opts.callback("token-" + (++n)); };
      setTimeout(run, 100);
      window.__tsRun = run; window.__tsEl = el;
      return "w1";
    },
    reset() { window.__tsEl.textContent = "Checking…"; setTimeout(window.__tsRun, 100); },
    execute() {}, remove() {},
  };`;

test("sign-in shows the bot check and sends a fresh token with every code request", async ({ page }) => {
  await page.route("**/api/turnstile", (route) => route.fulfill({ json: { siteKey: "test-key" } }));
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_TURNSTILE }));
  const tokens: string[] = [];
  await page.route("**/api/account/code", async (route) => { tokens.push(route.request().postDataJSON().turnstileToken); await route.fulfill({ json: { ok: true } }); });
  await page.goto("/account/sign-in");
  const box = page.getByTestId("captcha");
  await expect(box).toHaveText("Success!");
  // It sits between the email field and the Continue button.
  const email = await page.getByRole("textbox", { name: "Email address" }).boundingBox(), bot = await box.boundingBox(), go = await page.getByRole("button", { name: "Continue" }).boundingBox();
  expect(bot!.y).toBeGreaterThan(email!.y); expect(go!.y).toBeGreaterThan(bot!.y);
  await expect(async () => { await page.getByRole("textbox", { name: "Email address" }).fill("guest@example.com"); await page.getByRole("button", { name: "Continue" }).click(); await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 15_000 });
  expect(tokens[0]).toBe("token-1");
  // Send a new code: a new check result is used (tokens work once).
  await page.getByRole("button", { name: "Send a new code" }).click();
  await expect.poll(() => tokens.length).toBe(2);
  expect(tokens[1]).toBe("token-2");
});

test("without Turnstile set up the page has no check box and still works", async ({ page }) => {
  await page.route("**/api/turnstile", (route) => route.fulfill({ json: { siteKey: null } }));
  await page.goto("/account/sign-in");
  await expect(page.getByRole("heading", { name: "Welcome!" })).toBeVisible();
  await expect(page.getByTestId("captcha")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});
