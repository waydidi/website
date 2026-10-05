import assert from "node:assert/strict";
import test from "node:test";

const { conversationCard, conversationKeyboard, esc } = await import("../lib/telegram/cards.ts");

const base = { id: "c0ffee00-0000-4000-8000-000000000001", public_id: "WD-12345", status: "open", customer_name: "<b>Bob</b>", customer_email: null, customer_phone: null,
  source_title: "Bangkok → Pattaya", source_url: "/destinations/pattaya", topic: null, assigned_name: null, created_at: "2026-10-04T03:00:00Z" };

test("telegram: customer text is HTML-escaped", () => {
  assert.equal(esc("<a href=x>&"), "&lt;a href=x&gt;&amp;");
  const card = conversationCard(base, { body: "<script>alert(1)</script>", created_at: base.created_at, from: "visitor" }, true);
  assert.ok(!card.includes("<script>") && card.includes("&lt;script&gt;"));
  assert.ok(card.includes("&lt;b&gt;Bob&lt;/b&gt;") && card.includes("Website chat") && card.includes("============================"));
});

test("telegram: buttons carry the conversation id and fit Telegram's 64-byte limit", () => {
  const rows = conversationKeyboard(base, "https://example.com/admin/chat");
  const data = rows.flat().map((b) => b.callback_data).filter(Boolean);
  assert.ok(data.includes(`chat_assign:${base.id}`));
  for (const d of data) assert.ok(Buffer.byteLength(d) <= 64);
  assert.ok(!conversationKeyboard({ ...base, assigned_name: "Alex" }, "u").flat().some((b) => b.callback_data?.startsWith("chat_assign")));
  assert.deepEqual(conversationKeyboard({ ...base, status: "closed" }, "u")[0][0].callback_data, `chat_reopen:${base.id}`);
  assert.ok(data.includes(`chat_pick:${base.id}`));
});

test("telegram: card layout and the team picker", async () => {
  const card = conversationCard({ ...base, customer_email: "a@b.co", customer_country: "TH" }, { body: "How much to Pattaya?", created_at: base.created_at, from: "visitor" }, true);
  const at = (t) => card.indexOf(t);
  assert.ok(at("Website chat") < at("Conversation <b>WD-12345</b>") && at("Conversation") < at("Message:") && at("Message:") < at("How much to Pattaya?") && at("How much") < at("Email: a@b.co") && at("Email") < at("Origin country:") && at("Origin country") < at("Date/Time:"));
  const { pickKeyboard } = await import("../lib/telegram/cards.ts");
  const rows = pickKeyboard(base.id, [{ telegram_user_id: "12345678901234567890", display_name: "Anna" }]);
  for (const d of rows.flat().map((b) => b.callback_data)) assert.ok(Buffer.byteLength(d) <= 64);
});
