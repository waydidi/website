import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// Facts that must live in one file. Pages, emails and checks read them from there; these tests
// fail if a copy is typed in again somewhere else, so a change in one place cannot drift.
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const refund = await vite.ssrLoadModule("/lib/refund-policy.ts");
const content = await vite.ssrLoadModule("/lib/public-content.ts");
const contact = await vite.ssrLoadModule("/lib/contact.ts");

const sources = globSync(`${root}/{app,components,lib,worker}/**/*.{ts,tsx}`).map((file) => ({ file: file.slice(root.length + 1), text: readFileSync(file, "utf8") }));
const copies = (pattern, allowed) => sources.filter(({ file, text }) => !allowed.includes(file) && pattern.test(text)).map(({ file }) => file);

test("the refund policy's wording is unchanged and generated from its numbers", () => {
  assert.deepEqual(refund.GENERAL_REFUND_TIERS.map((t) => [t.label, t.percent]), [["More than 48 hours before pickup", 100], ["24–48 hours before pickup", 50], ["Less than 24 hours before pickup", 0]]);
  const answers = content.publicPages.flatMap((p) => (p.faq ?? []).map((f) => f.a)).join("\n");
  assert.match(answers, /More than 48 hours before pickup: full refund\. 24–48 hours: 50% refund\. Less than 24 hours or a no-show: non-refundable\./);
});

test("refund hours are not typed into page text anywhere else", () => {
  // Blog articles are editorial content and are allowed to mention the policy in their own words.
  assert.deepEqual(copies(/\b48 hours\b|24–48|\b48H\b|"48h"/, ["lib/refund-policy.ts", "lib/blog-posts.ts", "lib/unfinished-bookings.ts"]), []);
});

test("support email and WhatsApp number live only in lib/contact.ts", () => {
  assert.equal(contact.SUPPORT_EMAIL, "support@waydidi.com");
  assert.equal(contact.WHATSAPP_URL, "https://wa.me/66632064884");
  assert.deepEqual(copies(/support@waydidi\.com|63 206 4884|66632064884/, ["lib/contact.ts"]), []);
});
