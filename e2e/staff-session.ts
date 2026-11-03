import { createHash, randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { BrowserContext } from "@playwright/test";

// A test-only staff account with the given role in the LOCAL dev database (see admin.setup.ts),
// signed in on this browser context.
const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
export async function signInStaff(context: BrowserContext, baseURL: string, role: "operations" | "support" | "finance" | "editor") {
  const id = `e2e-${role}`, token = randomBytes(32).toString("hex");
  const now = new Date().toISOString(), expires = new Date(Date.now() + 86400_000).toISOString();
  for (const file of readdirSync(D1_DIR).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite")) {
    const db = new DatabaseSync(`${D1_DIR}/${file}`);
    try {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='staff_sessions'").get()) continue;
      db.prepare(`INSERT INTO staff_accounts(id,username,email,display_name,password_hash,role,mfa_secret,active,created_at)
        VALUES(?,?,?,?,'not-a-password',?,'e2e',1,?)
        ON CONFLICT(id) DO UPDATE SET active=1,role=excluded.role,mfa_secret='e2e'`).run(id, id, `${id}@example.com`, `E2E ${role}`, role, now);
      db.prepare("INSERT INTO staff_sessions(token_hash,staff_id,expires_at,last_used_at,created_at) VALUES(?,?,?,?,?)")
        .run(createHash("sha256").update(token).digest("hex"), id, expires, now, now);
    } finally { db.close(); }
  }
  await context.addCookies([{ name: "waydidi_admin_session", value: token, domain: new URL(baseURL).hostname, path: "/", httpOnly: true, sameSite: "Strict" }]);
}
