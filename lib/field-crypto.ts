// Field-level encryption for sensitive personal and payout data (bank account numbers, tax IDs).
// Pure: the secret is passed in, so this is unit tested directly; lib/pii.ts reads the Worker secret.
//
// Format: "enc:v1:<iv>.<ciphertext>" (base64url, AES-256-GCM, random 12-byte IV). The column name is
// bound in as additional data, so a value copied into another column does not decrypt there.
// Values without the prefix are older plain-text rows: they are returned as they are.

export const ENCRYPTED_PREFIX = "enc:v1:";
export const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const isEncrypted = (value: unknown): value is string => typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(text: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error("FIELD_CIPHERTEXT_INVALID");
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const keys = new Map<string, Promise<CryptoKey>>();
function keyFor(secret: string) {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error("FIELD_KEY_INVALID");
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.digest("SHA-256", encoder.encode(`waydidi-field:v1:${secret}`))
      .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
    keys.set(secret, key);
  }
  return key;
}

/** Encrypts a value for the given column (e.g. "drivers.bank_account_number"). Empty stays empty. */
export async function sealField(plain: string, secret: string, column: string): Promise<string> {
  if (plain === "") return "";
  if (isEncrypted(plain)) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(column) }, await keyFor(secret), encoder.encode(plain)));
  return `${ENCRYPTED_PREFIX}${b64url(iv)}.${b64url(sealed)}`;
}

/** Decrypts a stored value for the given column. Plain-text (older) values come back unchanged. */
export async function openField(stored: string, secret: string, column: string): Promise<string> {
  if (!isEncrypted(stored)) return stored;
  const [iv, body, extra] = stored.slice(ENCRYPTED_PREFIX.length).split(".");
  if (!iv || !body || extra !== undefined) throw new Error("FIELD_CIPHERTEXT_INVALID");
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv), additionalData: encoder.encode(column) }, await keyFor(secret), fromB64url(body));
    return decoder.decode(plain);
  } catch (error) {
    if (error instanceof Error && error.message === "FIELD_KEY_INVALID") throw error;
    throw new Error("FIELD_DECRYPT_FAILED");
  }
}

/** "•••• 4521": only the last digits, for staff screens. */
export function maskTail(value: string, visible = 4) {
  const clean = value.replace(/\s+/g, "");
  if (!clean) return "";
  if (clean.length <= visible) return "•".repeat(clean.length);
  return `•••• ${clean.slice(-visible)}`;
}
