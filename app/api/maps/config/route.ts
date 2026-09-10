import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { apiKey: env.GOOGLE_MAPS_BROWSER_KEY ?? "" },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
