import type { Metadata } from "next";
import { AccountShell, PageTitle } from "@/components/account/account-shell";
import { SavedBilling } from "@/components/account/saved-billing";
import { requireCustomer } from "@/lib/customer-auth";
import { billingProfilesFor } from "@/lib/billing-profiles";

export const metadata: Metadata = { title: "Billing details · Waydidi", robots: { index: false, follow: false } };

export default async function BillingPage() {
  const customer = await requireCustomer("/account/billing");
  const profiles = await billingProfilesFor(customer.id);
  return <AccountShell name={customer.name} email={customer.email}>
    <PageTitle title="Billing details" subtitle="Company and tax ID details for tax invoices, ready to reuse at checkout." />
    <SavedBilling initial={profiles} />
  </AccountShell>;
}
