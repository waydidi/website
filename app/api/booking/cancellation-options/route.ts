import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { cancellationConfig } from "@/lib/cancellation-options";

// Public, non-personal configuration; never cache across Worker setting changes.
export function GET() {
  return NextResponse.json(cancellationConfig(env as unknown as Record<string, unknown>), { headers: { "Cache-Control": "no-store" } });
}
