import { createHash, randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, test as setup } from "@playwright/test";

// Test-only admin for the browser tests. It is written straight into the LOCAL dev database
// (.wrangler/state, the emulated D1 the dev server uses), never production, and gets a session
// whose cookie the admin tests reuse, so they skip the password + authenticator sign-in.
const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
export const ADMIN_STATE = "e2e/.auth/admin.json";

function localDatabases() {
  return readdirSync(D1_DIR).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite").map((f) => `${D1_DIR}/${f}`).filter((path) => {
    const db = new DatabaseSync(path, { readOnly: true });
    try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='staff_sessions'").get(); } finally { db.close(); }
  });
}

setup("sign in a test-only admin", async ({ page, baseURL }) => {
  // The first page load creates and migrates the local database.
  await expect(async () => {
    expect((await page.request.get("/admin")).status()).toBeLessThan(500);
    expect(localDatabases().length).toBeGreaterThan(0);
  }).toPass({ timeout: 90_000 });

  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 86400_000).toISOString();
  for (const path of localDatabases()) {
    const db = new DatabaseSync(path);
    try {
      db.prepare(`INSERT INTO staff_accounts(id,username,email,display_name,password_hash,role,mfa_secret,active,created_at)
        VALUES('e2e-owner','e2e-owner','e2e@example.com','E2E Owner','not-a-password','owner','e2e',1,?)
        ON CONFLICT(id) DO UPDATE SET active=1,role='owner',mfa_secret='e2e'`).run(now.toISOString());
      db.prepare("INSERT INTO staff_sessions(token_hash,staff_id,expires_at,last_used_at,created_at) VALUES(?,?,?,?,?)")
        .run(createHash("sha256").update(token).digest("hex"), "e2e-owner", expires, now.toISOString(), now.toISOString());
    } finally { db.close(); }
  }

  const { hostname } = new URL(baseURL!);
  await page.context().addCookies([{ name: "waydidi_admin_session", value: token, domain: hostname, path: "/", httpOnly: true, sameSite: "Strict" }]);
  // Warm up: the dev server bundles its dependencies on the first browser visit and a page loaded
  // during that can stay non-interactive. Reload until the public site and the admin are hydrated,
  // so no test starts in that window.
  for (const path of ["/", "/admin/profile"]) {
    await expect(async () => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const hydrated = await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => Object.keys(b).some((k) => k.startsWith("__react"))));
      expect(hydrated, `${path} is interactive`).toBe(true);
    }).toPass({ timeout: 120_000, intervals: [2_000, 5_000] });
  }
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await page.context().storageState({ path: ADMIN_STATE });
});
