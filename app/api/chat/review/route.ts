import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { readCookie } from "@/lib/staff-security";
import { isJsonRequest, sameOrigin, sha256 } from "@/lib/security";
import { googleReviewUrl, REVIEW_EVENTS, submitSupportReview, trackReviewEvent, type ReviewEvent } from "@/lib/support-reviews";
import { conversationByTokenHash } from "@/lib/website-chat";

// Customer's end-of-chat rating. The conversation comes only from the visitor's own chat cookie,
// never from an id in the request, so nobody can rate someone else's conversation.
const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return fail("Request blocked", 403);
  const token = readCookie(request, "waydidi_chat");
  const c = /^[a-f0-9]{48}$/.test(token) ? await conversationByTokenHash(await sha256(token)) : null;
  if (!c) return fail("Chat not found.", 404);
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;

  if (input.action === "event") {
    if (!(REVIEW_EVENTS as readonly unknown[]).includes(input.event)) return fail("Unknown event.", 400);
    await trackReviewEvent(c, input.event as ReviewEvent);
    return NextResponse.json({ ok: true }, { headers });
  }

  const window = Math.floor(Date.now() / 900000), fingerprint = await sha256(`review:${env.RATE_LIMIT_SALT ?? "waydidi"}:${request.headers.get("cf-connecting-ip") ?? "unknown"}`);
  const allowed = await env.DB.prepare("INSERT INTO security_rate_windows(fingerprint,window,attempts) VALUES(?,?,1) ON CONFLICT(fingerprint,window) DO UPDATE SET attempts=attempts+1 WHERE attempts<10 RETURNING attempts").bind(fingerprint, window).first();
  if (!allowed) return fail("Please wait a few minutes and try again.", 429);
  const rating = typeof input.rating === "number" ? input.rating : NaN;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail("Choose 1 to 5 stars.", 400);
  if (input.feedback !== undefined && input.feedback !== null && typeof input.feedback !== "string") return fail("Feedback must be text.", 400);
  const feedback = typeof input.feedback === "string" ? input.feedback.trim() : "";
  if (feedback.length > 1000) return fail("Feedback can be up to 1,000 characters.", 400);
  const result = await submitSupportReview(c, { rating, feedback: feedback || null, consent: input.consentToPublish === true });
  if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
  return NextResponse.json({ ok: true, duplicate: result.duplicate, rating: result.review?.rating ?? rating, googleUrl: googleReviewUrl() }, { headers });
}
