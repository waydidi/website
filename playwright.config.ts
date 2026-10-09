import { defineConfig, devices } from "@playwright/test";

// Browser tests for the main customer and admin flows. They run against the local dev server
// (emulated D1, no real payments or emails). CI runs them on every push and pull request.
const PORT = 5199;
// In the Claude/cloud sandbox Chromium is pre-installed here; in GitHub Actions Playwright installs its own.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    // Signs in a test-only admin in the local database; the admin tests reuse its cookie.
    { name: "admin-setup", testMatch: /admin\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, dependencies: ["admin-setup"] },
    { name: "phone", use: { ...devices["Pixel 7"] }, dependencies: ["admin-setup"] },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
