import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { agencyApplications } from "@/db/schema";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const schema = z.object({
  agencyName: z.string().trim().min(2, "Enter your agency's name.").max(120),
  contactName: z.string().trim().min(2, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  phone: z.string().trim().regex(/^[+0-9() .-]{7,30}$/, "Enter a valid phone number."),
  country: z.string().trim().min(2, "Enter your country.").max(80),
  website: z.string().trim().max(200).optional().or(z.literal("")),
  monthlyTransfers: z.enum(["1-10", "11-50", "51-200", "200+"]),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  company: z.string().max(0).optional(), // honeypot: real people leave it empty
});

// Travel agency partner application. Stored for the team to review in admin.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Check the form.", field: issue?.path.join(".") }, { status: 400 });
  }
  const { company: _honeypot, ...input } = parsed.data;
  await getDb().insert(agencyApplications).values({ id: crypto.randomUUID(), ...input, website: input.website || null, message: input.message || null, createdAt: new Date().toISOString() });
  console.info("Agency application received", { agency: input.agencyName, country: input.country });
  return NextResponse.json({ ok: true });
}
