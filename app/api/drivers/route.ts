import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { driverApplications } from "@/db/schema";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const schema = z.object({
  applicantType: z.enum(["individual", "fleet"]),
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  phone: z.string().trim().regex(/^[+0-9() .-]{7,30}$/, "Enter a valid phone number."),
  city: z.string().trim().min(2, "Enter the city where you drive.").max(80),
  vehicle: z.enum(["sedan", "suv", "van", "none"]),
  vehicleYear: z.string().trim().max(4).optional().or(z.literal("")),
  fleetSize: z.string().trim().max(20).optional().or(z.literal("")),
  languages: z.string().trim().max(120).optional().or(z.literal("")),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  company: z.string().max(0).optional(), // honeypot
});

// Driver application from /drivers, stored for the operations team to review.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Check the form.", field: issue?.path.join(".") }, { status: 400 });
  }
  const { company: _honeypot, ...input } = parsed.data;
  await getDb().insert(driverApplications).values({ id: crypto.randomUUID(), ...input, vehicleYear: input.vehicleYear || null, fleetSize: input.fleetSize || null, languages: input.languages || null, message: input.message || null, createdAt: new Date().toISOString() });
  console.info("Driver application received", { type: input.applicantType, city: input.city });
  return NextResponse.json({ ok: true });
}
