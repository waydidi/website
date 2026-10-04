import { env } from "cloudflare:workers";
import { SITE_URL } from "@/lib/site";
import { sendCard, telegramConfigured } from "@/lib/telegram/client";
import { esc } from "@/lib/telegram/cards";
import type { Conversation } from "@/lib/website-chat";

// Internal support rating after a chat is closed. It is Waydidi's own feedback, stored in D1,
// and is never presented as (or turned into) a Google review. The Google link is offered to everyone.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as { prepare: (sql: string) => Stmt };

/** Official Google Business Profile review link, from configuration (not a secret). */
export const googleReviewUrl = (): string | null => {
  const url = String(env.GOOGLE_BUSINESS_REVIEW_URL || env.WAYDIDI_REVIEW_URL || "").trim();
  return /^https:\/\//.test(url) ? url : null;
};

export type SupportReview = { id: string; rating: number; feedback: string | null; consent_to_publish: number; submitted_at: string };
export const reviewForConversation = (conversationId: string) =>
  db().prepare("SELECT id,rating,feedback,consent_to_publish,submitted_at FROM support_reviews WHERE conversation_id=?").bind(conversationId).first<SupportReview>();

export const REVIEW_EVENTS = ["prompt_viewed", "rating_selected", "google_cta_viewed", "google_cta_clicked"] as const;
export type ReviewEvent = (typeof REVIEW_EVENTS)[number];

/** Records only what we can observe. A Google CTA click is just a click, never "review submitted". */
export async function trackReviewEvent(c: Conversation, event: ReviewEvent) {
  const now = new Date().toISOString();
  if (event === "prompt_viewed") await db().prepare("UPDATE website_conversations SET review_prompt_viewed_at=COALESCE(review_prompt_viewed_at,?) WHERE id=?").bind(now, c.id).run();
  if (event === "rating_selected") await db().prepare("UPDATE website_conversations SET review_rating_selected_at=COALESCE(review_rating_selected_at,?) WHERE id=?").bind(now, c.id).run();
  if (event === "google_cta_viewed") await db().prepare("UPDATE support_reviews SET google_cta_shown_at=COALESCE(google_cta_shown_at,?) WHERE conversation_id=?").bind(now, c.id).run();
  if (event === "google_cta_clicked") await db().prepare("UPDATE support_reviews SET google_cta_clicked_at=COALESCE(google_cta_clicked_at,?) WHERE conversation_id=?").bind(now, c.id).run();
}

/** One review per closed conversation; repeats return the first one unchanged. */
export async function submitSupportReview(c: Conversation, input: { rating: number; feedback: string | null; consent: boolean }) {
  if (c.status !== "closed") return { error: "You can rate the chat once it's finished.", status: 409 as const };
  const now = new Date().toISOString(), id = crypto.randomUUID();
  const inserted = await db().prepare(`INSERT INTO support_reviews(id,conversation_id,customer_id,admin_staff_id,admin_name,rating,feedback,consent_to_publish,publication_status,needs_attention,submitted_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(conversation_id) DO NOTHING`).bind(id, c.id, c.customer_id, c.assigned_staff_id, c.assigned_name, input.rating, input.feedback,
    input.consent ? 1 : 0, input.consent ? "pending" : "private", input.rating <= 2 ? 1 : 0, now, now).run();
  const review = (await reviewForConversation(c.id))!;
  if (inserted.meta.changes) await notifyReview(c, review).catch(() => undefined);
  return { review, duplicate: !inserted.meta.changes };
}

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
async function notifyReview(c: Conversation, r: SupportReview) {
  if (!telegramConfigured()) return;
  const text = [
    "🟠 <b>WAYDIDI</b>",
    `${r.rating <= 2 ? "🔴" : "⭐"} <b>CUSTOMER SUPPORT REVIEW</b>${r.rating <= 2 ? " · needs attention" : ""}`,
    "",
    `👤 ${esc(c.customer_name || "Website visitor")}`,
    `👨‍💼 ${esc(c.assigned_name || "Unassigned")}`,
    `${stars(r.rating)} ${r.rating}/5`,
    ...(r.feedback ? ["", `<blockquote>${esc(r.feedback.slice(0, 800))}</blockquote>`] : []),
    "",
    `💬 ${esc(c.public_id)}`,
  ].join("\n");
  await sendCard(text, [[{ text: "Open conversation", url: `${SITE_URL}/admin/chat?id=${encodeURIComponent(c.id)}` }, { text: "Open reviews", url: `${SITE_URL}/admin/chat?tab=reviews` }]], c.telegram_message_id ?? undefined);
}
