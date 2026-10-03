import { env } from "cloudflare:workers";

const secrets = () => env as unknown as Record<string, string | undefined>;

/** Public site key for the browser widget, or null while Turnstile is not configured. */
export function turnstileSiteKey() {
  return secrets().TURNSTILE_SITE_KEY || null;
}

/**
 * Checks a Cloudflare Turnstile token. Until TURNSTILE_SECRET_KEY is set every
 * request passes, so forms keep working before the keys are added.
 */
export async function verifyTurnstile(request: Request, token: unknown) {
  const secret = secrets().TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.set("remoteip", ip);
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body })
    .then((response) => response.json() as Promise<{ success?: boolean }>)
    .catch(() => null);
  return result?.success === true;
}

export const TURNSTILE_FAILED = { error: "We couldn't confirm you're not a bot. Please refresh the page and try again." };
