import { env } from "cloudflare:workers";

function secret() {
  const value = env.WAYDIDI_TRIP_PIN_SECRET;
  if (!value || value.length < 32) throw new Error("WAYDIDI_TRIP_PIN_SECRET is not configured.");
  return value;
}

async function hmac(value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return new Uint8Array(signature);
}

export async function tripPinForReference(reference: string) {
  const bytes = await hmac(`pin:${reference}`);
  const number = new DataView(bytes.buffer).getUint32(0) % 10_000;
  return String(number).padStart(4, "0");
}

export async function tripPinHash(reference: string, pin: string) {
  const bytes = await hmac(`hash:${reference}:${pin}`);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
