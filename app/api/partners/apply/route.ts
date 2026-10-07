import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { applyAsAffiliate } from "@/lib/affiliates";
import { overRateLimit } from "@/lib/customer-auth";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { sendCard, telegramConfigured } from "@/lib/telegram/client";

const input = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional().default(""),
  kind: z.enum(["creator", "hotel", "guide", "business", "other"]),
  website: z.string().trim().max(300).optional().default(""),
  audience: z.string().trim().max(120).optional().default(""),
  pitch: z.string().trim().max(1000).optional().default(""),
  wanted: z.string().trim().max(40).optional().default(""),
  agree: z.literal(true),
  company: z.string().max(0).optional(), // honeypot: people never fill it
});
const KIND: Record<string, string> = { creator: "Blogger / creator", hotel: "Hotel / stay", guide: "Guide / tours", business: "Local business", other: "Other" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Join page (waydidi.com/partners): a new partner application, waiting for approval in Admin → Partners → Affiliates. */
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const salt = (env as unknown as Record<string, string | undefined>).RATE_LIMIT_SALT ?? "waydidi";
  if (await overRateLimit(request, "partner-apply", 5, 60, salt)) return NextResponse.json({ error: "Too many tries. Please wait a while and try again." }, { status: 429 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json({ error: field === "agree" ? "Please accept the partner terms." : field === "email" ? "Enter a valid email." : field === "name" ? "Enter your name or business name." : "Please check the form." }, { status: 400 });
  }
  const a = parsed.data;
  const result = await applyAsAffiliate({ name: a.name, email: a.email, phone: a.phone, kind: a.kind, website: a.website, audience: a.audience, pitch: a.pitch, wanted: a.wanted });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  if (telegramConfigured()) await sendCard([
    "New partner application", "",
    `Name: ${esc(a.name)}`, `Type: ${KIND[a.kind]}`, `Email: ${esc(a.email)}`, ...(a.phone ? [`Phone: ${esc(a.phone)}`] : []),
    ...(a.website ? [`Website / social: ${esc(a.website)}`] : []), ...(a.audience ? [`Audience: ${esc(a.audience)}`] : []),
    ...(a.pitch ? ["", esc(a.pitch.slice(0, 400))] : []), "", "Approve or decline in Admin → Partners → Affiliates.",
  ].join("\n")).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
