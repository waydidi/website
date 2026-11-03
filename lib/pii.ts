import { env } from "cloudflare:workers";
import { MIN_SECRET_LENGTH, isEncrypted, openField, sealField } from "@/lib/field-crypto";

// Sensitive fields encrypted with the Worker secret PII_ENCRYPTION_KEY (32+ characters).
// Off until the owner sets it: values are then stored as before. Once it is set, new values are
// encrypted and older rows are encrypted in place by the scheduled job (lib/pii-backfill.ts).
// Losing the key makes encrypted values unreadable, so keep a copy somewhere safe.
export const PII_COLUMNS = {
  driverAccount: "drivers.bank_account_number",
  payoutAccount: "driver_payout_details.account_number",
  taxInvoiceTaxId: "booking_tax_invoices.tax_id",
  billingTaxId: "customer_billing_profiles.tax_id",
  receiptTaxId: "booking_receipt_documents.customer.tax_id",
} as const;
export type PiiColumn = (typeof PII_COLUMNS)[keyof typeof PII_COLUMNS];

const secret = () => String((env as unknown as Record<string, unknown>).PII_ENCRYPTION_KEY ?? "");
/** True once a usable key is set. */
export const piiEncryptionOn = () => secret().length >= MIN_SECRET_LENGTH;

/** For saving: encrypted when the key is set, as typed otherwise. A key that is set but too short refuses (never silently plain). */
export async function sealPii(value: string, column: PiiColumn): Promise<string> {
  const key = secret();
  if (!value) return value;
  if (!key) return value;
  if (key.length < MIN_SECRET_LENGTH) throw new Error("PII_ENCRYPTION_KEY must be at least 32 characters.");
  return sealField(value, key, column);
}

/** For reading: older plain values come back unchanged; encrypted ones need the key. */
export async function openPii(stored: string | null | undefined, column: PiiColumn): Promise<string> {
  if (!stored) return "";
  if (!isEncrypted(stored)) return stored;
  if (!piiEncryptionOn()) throw new Error("PII_KEY_MISSING");
  return openField(stored, secret(), column);
}

/**
 * A stable fingerprint for idempotency ids. Account numbers are short enough to guess from a plain hash,
 * so with the key set it is an HMAC (keyed hash); without it, SHA-256 as before.
 */
export async function piiFingerprint(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  if (!piiEncryptionOn()) return hex(await crypto.subtle.digest("SHA-256", data));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`waydidi-fingerprint:v1:${secret()}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `h1:${hex(await crypto.subtle.sign("HMAC", key, data))}`;
}
