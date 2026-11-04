import { env } from "cloudflare:workers";
import { ENCRYPTED_PREFIX } from "@/lib/field-crypto";
import { PII_COLUMNS, piiEncryptionOn, sealPii, type PiiColumn } from "@/lib/pii";

// Once PII_ENCRYPTION_KEY is set, the scheduled job encrypts older plain-text values a few at a time.
// Each update is guarded on the old value, so a row changed in the meantime is left for the next run.
// Issued receipt snapshots are financial documents and are never rewritten (new ones are sealed).
const TARGETS: { table: string; column: string; pii: PiiColumn }[] = [
  { table: "drivers", column: "bank_account_number", pii: PII_COLUMNS.driverAccount },
  { table: "driver_payout_details", column: "account_number", pii: PII_COLUMNS.payoutAccount },
  { table: "booking_tax_invoices", column: "tax_id", pii: PII_COLUMNS.taxInvoiceTaxId },
  { table: "customer_billing_profiles", column: "tax_id", pii: PII_COLUMNS.billingTaxId },
];
type Stmt = { bind: (...v: unknown[]) => Stmt; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<unknown> };
type Db = { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<{ meta: { changes: number } }[]> };

/** Encrypts up to `limit` plain values per table. Returns how many were encrypted. */
export async function encryptPlainPii(limit = 25, db: Db = env.DB as unknown as Db): Promise<number> {
  if (!piiEncryptionOn()) return 0;
  let done = 0;
  for (const t of TARGETS) {
    const rows = (await db.prepare(`SELECT id, ${t.column} AS value FROM ${t.table} WHERE ${t.column} <> '' AND substr(${t.column}, 1, ${ENCRYPTED_PREFIX.length}) <> ? LIMIT ?`)
      .bind(ENCRYPTED_PREFIX, limit).all<{ id: string; value: string }>().catch(() => ({ results: [] }))).results;
    if (!rows.length) continue;
    const updates = await Promise.all(rows.map(async (r) => db.prepare(`UPDATE ${t.table} SET ${t.column} = ? WHERE id = ? AND ${t.column} = ?`).bind(await sealPii(r.value, t.pii), r.id, r.value)));
    done += (await db.batch(updates)).reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
  }
  return done;
}
