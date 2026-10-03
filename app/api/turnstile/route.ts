import { NextResponse } from "next/server";
import { turnstileSiteKey } from "@/lib/turnstile";

// Site key for the invisible bot check on sign-up forms (null when not configured).
export async function GET() {
  return NextResponse.json({ siteKey: turnstileSiteKey() }, { headers: { "Cache-Control": "public, max-age=300" } });
}
