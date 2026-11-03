import { createHash, randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";

// Phone: tapping Bookings in the bottom menu opens the bookings page for staff who are not the owner.
// The tap loads the page's data from /admin/bookings.rsc; the Worker's role check used to refuse that
// address (403), so the menu looked stuck on Overview until a full reload.
test.skip(({ isMobile }) => !isMobile, "The bottom menu is the phone layout");

const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";

test("operations staff: the Bookings tab opens the bookings page in-app", async ({ page, baseURL }) => {
  // A test-only operations account in the LOCAL dev database (see admin.setup.ts).
  const token = randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 86400_000).toISOString();
  for (const file of readdirSync(D1_DIR).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite")) {
    const db = new DatabaseSync(`${D1_DIR}/${file}`);
    try {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='staff_sessions'").get()) continue;
      db.prepare(`INSERT INTO staff_accounts(id,username,email,display_name,password_hash,role,mfa_secret,active,created_at)
        VALUES('e2e-operations','e2e-operations','e2e-ops@example.com','E2E Operations','not-a-password','operations','e2e',1,?)
        ON CONFLICT(id) DO UPDATE SET active=1,role='operations',mfa_secret='e2e'`).run(now);
      db.prepare("INSERT INTO staff_sessions(token_hash,staff_id,expires_at,last_used_at,created_at) VALUES(?,?,?,?,?)")
        .run(createHash("sha256").update(token).digest("hex"), "e2e-operations", expires, now, now);
    } finally { db.close(); }
  }
  await page.context().addCookies([{ name: "waydidi_admin_session", value: token, domain: new URL(baseURL!).hostname, path: "/", httpOnly: true, sameSite: "Strict" }]);

  const refused: string[] = [];
  page.on("response", (r) => { if (r.url().includes(".rsc") && r.status() >= 400) refused.push(`${r.status()} ${r.url()}`); });
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");
  const nav = page.getByRole("navigation", { name: "Mobile admin sections" });
  await nav.getByRole("link", { name: "Bookings" }).click();
  await expect(page).toHaveURL(/\/admin\/bookings$/);
  await expect(nav.getByRole("link", { name: "Bookings" })).toHaveAttribute("aria-current", "page");
  await page.waitForLoadState("networkidle");
  expect(refused).toEqual([]);
});
