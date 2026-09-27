import { env } from "cloudflare:workers";

// Signs the customer's private trip links. Uses WAYDIDI_TRIP_PIN_SECRET when set (so
// links already sent keep working), otherwise the admin session secret.
function secret() {
  const value = env.WAYDIDI_TRIP_PIN_SECRET && env.WAYDIDI_TRIP_PIN_SECRET.length >= 32 ? env.WAYDIDI_TRIP_PIN_SECRET : env.WAYDIDI_ADMIN_SESSION_SECRET;
  if (!value || value.length < 16) throw new Error("No secret is configured for trip links (set WAYDIDI_ADMIN_SESSION_SECRET).");
  return value;
}

/** Hex HMAC under the trip secret, for signed customer trip links. */
export async function tripSecretHmacHex(value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
