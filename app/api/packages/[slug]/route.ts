import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { overRateLimit } from "@/lib/customer-auth";
import { bookingSchema, bookPackage, packageBySlug, quotePackage } from "@/lib/packages";
import { isJsonRequest, safeOrigin, sameOrigin } from "@/lib/security";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(254),
  phone: z.string().trim().min(5, "Enter a phone number we can reach on the day.").max(40),
  language: z.enum(["en", "th", "zh"]).default("en"),
  agree: z.literal(true, { errorMap: () => ({ message: "Please accept the terms and cancellation policy." }) }),
});

// Customer: check a date (price, timeline, closures) or book and pay for a published package.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (await overRateLimit(request, "package", 40, 15, env.RATE_LIMIT_SALT ?? "waydidi")) return NextResponse.json({ error: "Too many requests. Please wait a few minutes." }, { status: 429 });
  const pkg = await packageBySlug((await params).slug);
  if (!pkg) return NextResponse.json({ error: "This trip isn't available." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const b = bookingSchema.safeParse(body);
  if (!b.success) return NextResponse.json({ error: b.error.issues[0]?.message ?? "Check the trip details." }, { status: 400 });
  try {
    if (body?.action === "book") {
      const c = contactSchema.safeParse(body);
      if (!c.success) return NextResponse.json({ error: c.error.issues[0]?.message ?? "Check your details." }, { status: 400 });
      const r = await bookPackage(pkg, b.data, c.data, safeOrigin(request));
      return r.ok ? NextResponse.json({ checkoutUrl: r.checkoutUrl }) : NextResponse.json({ error: r.errors[0], errors: r.errors }, { status: 409 });
    }
    const q = await quotePackage(pkg, b.data);
    return NextResponse.json({ ok: q.ok, errors: q.errors, total: q.total, feesOnSite: q.fees.onSite, returnAt: q.returnAt, timeline: q.timeline }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("package request failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again or chat with us." }, { status: 503 });
  }
}
