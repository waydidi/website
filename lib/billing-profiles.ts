import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customerBillingProfiles } from "@/db/schema";
import { openPii, PII_COLUMNS, sealPii } from "@/lib/pii";

// A signed-in customer's saved billing profiles (their own data: the full tax ID is shown to them).
// Tax IDs are encrypted at rest once PII_ENCRYPTION_KEY is set (lib/pii.ts).
export type BillingProfileValue = { name: string; taxId: string; branch: string; address: string };

export async function billingProfilesFor(customerId: string) {
  const rows = await getDb().select({ id: customerBillingProfiles.id, name: customerBillingProfiles.name, taxId: customerBillingProfiles.taxId, branch: customerBillingProfiles.branch, address: customerBillingProfiles.address })
    .from(customerBillingProfiles).where(eq(customerBillingProfiles.customerId, customerId)).orderBy(asc(customerBillingProfiles.createdAt))
    .catch(() => []);
  return Promise.all(rows.map(async (row) => ({ ...row, taxId: await openPii(row.taxId, PII_COLUMNS.billingTaxId) })));
}

/** The profile as stored: tax ID sealed. */
export async function storedBillingProfile(value: BillingProfileValue): Promise<BillingProfileValue> {
  return { ...value, taxId: await sealPii(value.taxId, PII_COLUMNS.billingTaxId) };
}
