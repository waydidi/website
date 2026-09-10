import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { getChatGPTUser, requireChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";
import { constantTimeEqual, sha256 } from "@/lib/security";

export const ADMIN_COOKIE = "waydidi_admin_session";
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

type AdminSession = { email: string; expiresAt: number };

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function textToBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToText(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function sign(value: string) {
  const secret = env.WAYDIDI_ADMIN_SESSION_SECRET ?? "";
  if (secret.length < 32) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export function adminKeyConfigured() {
  return /^[a-f0-9]{64}$/u.test(env.WAYDIDI_ADMIN_KEY_HASH ?? "") &&
    (env.WAYDIDI_ADMIN_SESSION_SECRET ?? "").length >= 32;
}

export async function verifyAdminKey(candidate: string) {
  const expected = env.WAYDIDI_ADMIN_KEY_HASH ?? "";
  if (!adminKeyConfigured() || candidate.length < 16 || candidate.length > 200) return false;
  return constantTimeEqual(await sha256(candidate), expected);
}

export async function createAdminSession(email: string) {
  const payload: AdminSession = {
    email: email.toLowerCase(),
    expiresAt: Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS,
  };
  const encoded = textToBase64Url(JSON.stringify(payload));
  const signature = await sign(encoded);
  if (!signature) throw new Error("Admin session is not configured");
  return `${encoded}.${signature}`;
}

async function hasValidAdminSession(user: ChatGPTUser) {
  if (!adminKeyConfigured()) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value ?? "";
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return false;
  const expectedSignature = await sign(encoded);
  if (!expectedSignature || !constantTimeEqual(suppliedSignature, expectedSignature)) return false;
  try {
    const payload = JSON.parse(base64UrlToText(encoded)) as Partial<AdminSession>;
    return payload.email === user.email.toLowerCase() &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function requireWaydidiAdmin(returnTo: string) {
  const user = await requireChatGPTUser(returnTo);
  return { user, authorized: await hasValidAdminSession(user), configured: adminKeyConfigured() };
}

export async function getWaydidiAdmin() {
  const user = await getChatGPTUser();
  if (!user || !(await hasValidAdminSession(user))) return null;
  return user;
}
