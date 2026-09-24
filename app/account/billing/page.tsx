import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customerBillingProfiles } from "@/db/schema";
import { AccountShell, PageTitle } from "@/components/account/account-shell";
import { SavedBilling } from "@/components/account/saved-billing";
import { requireCustomer } from "@/lib/customer-auth";

export const metadata: Metadata = { title: "Billing details · Waydidi", robots: { index: false, follow: false } };

export default async function BillingPage() {
  const customer = await requireCustomer("/account/billing");
  const profiles = await getDb().select({ id: customerBillingProfiles.id, name: customerBillingProfiles.name, taxId: customerBillingProfiles.taxId, branch: customerBillingProfiles.branch, address: customerBillingProfiles.address })
    .from(customerBillingProfiles).where(eq(customerBillingProfiles.customerId, customer.id)).orderBy(asc(customerBillingProfiles.createdAt))
    .catch(() => []);
  return <AccountShell name={customer.name} email={customer.email}>
    <PageTitle title="Billing details" subtitle="Company and tax ID details for tax invoices, ready to reuse at checkout." />
    <SavedBilling initial={profiles} />
  </AccountShell>;
}
