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
  assert.deepEqual(copies(/\b48 hours\b|24–48|\b48H\b|"48h"|[Ff]ree cancellation up to \d+ hours/, ["lib/refund-policy.ts", "lib/unfinished-bookings.ts"]), []);
  assert.deepEqual(copies(/ยกเลิกฟรีถึง \d|\d+ 小时可免费取消/, []), [], "the itinerary's Thai and Chinese text too");
});

test("support email and WhatsApp number live only in lib/contact.ts", () => {
  assert.equal(contact.SUPPORT_EMAIL, "support@waydidi.com");
  assert.equal(contact.WHATSAPP_URL, "https://wa.me/66632064884");
  assert.deepEqual(copies(/support@waydidi\.com|63 206 4884|66632064884/, ["lib/contact.ts"]), []);
});

test("member tier perks and the loyalty reward are written from their own numbers", async () => {
  const { TIERS } = await vite.ssrLoadModule("/lib/member-tier-rules.ts");
  assert.deepEqual(TIERS.map((t) => t.perks), [
    ["3% off every booking (up to THB 300)"],
    ["5% off every booking (up to THB 500)"],
    ["7% off every booking (up to THB 800)", "1 free child seat on every booking"],
    ["10% off every booking (up to THB 1,200)", "1 free child seat on every booking", "Free currency exchange stop on every booking"],
  ]);
  assert.deepEqual(copies(/5th (completed )?ride|THB 500\)/, ["lib/loyalty-rules.ts"]), []);
});

test("booking status groups are named once, not written out in queries and checks", async () => {
  const status = await vite.ssrLoadModule("/lib/booking-status.ts");
  assert.equal(status.COMMITTED_SQL, "'confirmed','completed'");
  assert.equal(status.CHARGEABLE_SQL, "'confirmed','completed','no_show'");
  assert.equal(status.isChargeableStatus("no_show"), true);
  assert.equal(status.isCommittedStatus("no_show"), false);
  assert.deepEqual(copies(/\[("|')confirmed("|'), ?("|')completed("|')(, ?("|')no_show("|'))?\]|IN ?\('confirmed', ?'completed'/, ["lib/booking-status.ts"]), []);
});
