import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { agencyApplications, bookingForms } from "@/db/schema";
import { formAnswersSchema, type FormPrefill, type FormService } from "@/lib/booking-form";
import { sendFormAlert } from "@/lib/email";
import { pushLine } from "@/lib/line";
import { formCard } from "@/lib/line-forms";
import { isJsonRequest, safeOrigin, sameOrigin } from "@/lib/security";

// Customer: submit the step-by-step booking form. Each link takes one submission.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const { token } = await params;
  const [form] = await getDb().select().from(bookingForms).where(eq(bookingForms.token, token)).limit(1);
  if (!form) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  if (form.status !== "waiting") return NextResponse.json({ error: "This form has already been sent." }, { status: 409 });
  if (form.expiresAt < new Date().toISOString()) return NextResponse.json({ error: "This link has expired. Please ask us for a new one." }, { status: 410 });
  const parsed = formAnswersSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `Please check ${String(issue?.path?.[0] ?? "your answers")}.` }, { status: 400 });
  }
  // Anything the admin fixed in advance wins over what the browser sent.
  const locked = (form.prefill ? JSON.parse(form.prefill) : {}) as FormPrefill;
  const a = { ...parsed.data, ...Object.fromEntries(Object.entries(locked).filter(([k]) => k !== "price")) };
  if (form.serviceType !== "hourly" && a.dropoff.length < 2) return NextResponse.json({ error: "Please tell us where you're going." }, { status: 400 });
  await getDb().update(bookingForms).set({ status: "submitted", answers: JSON.stringify(a), submittedAt: new Date().toISOString() })
    .where(and(eq(bookingForms.token, token), eq(bookingForms.status, "waiting")));
  const [agency] = form.agencyId ? await getDb().select({ name: agencyApplications.agencyName }).from(agencyApplications).where(eq(agencyApplications.id, form.agencyId)).limit(1) : [];
  await sendFormAlert({ token, answers: a, service: form.serviceType, agency: agency?.name ?? null, note: form.note, price: locked.price ?? null, origin: safeOrigin(request) }).catch(() => undefined);
  // LINE card to the admin: tap "Set price", type the price, and the booking is made.
  await pushLine([formCard({ token, service: form.serviceType as FormService, answers: a, note: form.note, agency: agency?.name ?? null, presetPrice: locked.price ?? null,
    adminUrl: `${safeOrigin(request)}/admin/bookings?type=${form.serviceType}&form=${token}` })]).catch((error) => console.error("LINE form card failed", error));
  return NextResponse.json({ ok: true });
}
