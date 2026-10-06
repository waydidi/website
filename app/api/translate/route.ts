import { approvedTranslationText } from "@/lib/site-translation-policy";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { isJsonRequest, sameOrigin, sha256 } from "@/lib/security";
import { isSiteLang, untranslatedPath } from "@/lib/site-languages";
import { cachedTranslations, translateMissing } from "@/lib/site-translate";

// Page text → visitor's language. Cached lines come straight from D1; new lines are translated
// once by AI (limited per visitor so the endpoint can't be used as a free translation service).
const headers = { "Cache-Control": "no-store" };
const NEW_PER_WINDOW = 600; // new strings per IP per 15 minutes

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403, headers });
  const input = await request.json().catch(() => ({})) as { lang?: unknown; texts?: unknown; path?: unknown };
  if (!isSiteLang(input.lang) || input.lang === "en") return NextResponse.json({ error: "Unsupported language." }, { status: 400, headers });
  const path = typeof input.path === "string" && input.path.startsWith("/") ? input.path.slice(0, 200) : null;
  if (!path || untranslatedPath(path)) return NextResponse.json({ translations: {} }, { headers });
  const texts = Array.isArray(input.texts) ? [...new Set(input.texts.filter((t): t is string => typeof t === "string" && approvedTranslationText(t) && t.trim().length > 0 && t.length <= 2000))].slice(0, 120) : [];
  if (!texts.length) return NextResponse.json({ translations: {} }, { headers });

  const found = await cachedTranslations(input.lang, texts);
  let missing = texts.filter((t) => !found.has(t));
  if (missing.length) {
    const window = Math.floor(Date.now() / 900000);
    const fingerprint = await sha256(`translate:${(env as unknown as Record<string, string>).RATE_LIMIT_SALT ?? "waydidi"}:${request.headers.get("cf-connecting-ip") ?? "unknown"}`);
    const row = await env.DB.prepare("INSERT INTO security_rate_windows(fingerprint,window,attempts) VALUES(?,?,?) ON CONFLICT(fingerprint,window) DO UPDATE SET attempts=attempts+excluded.attempts WHERE attempts+excluded.attempts<=? RETURNING attempts")
      .bind(fingerprint, window, missing.length, NEW_PER_WINDOW).first();
    if (!row) missing = [];
    for (const [k, v] of await translateMissing(input.lang, missing, path)) found.set(k, v);
  }
  return NextResponse.json({ translations: Object.fromEntries(found) }, { headers });
}
