import type { Metadata } from "next";
import { and, count, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { customerSessions } from "@/db/schema";
import { AccountShell, PageTitle } from "@/components/account/account-shell";
import { SettingsPanel } from "@/components/account/settings-panel";
import { requireCustomer } from "@/lib/customer-auth";

export const metadata: Metadata = { title: "Settings · Waydidi", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const customer = await requireCustomer("/account/settings");
  const [{ devices }] = await getDb().select({ devices: count() }).from(customerSessions)
    .where(and(eq(customerSessions.customerId, customer.id), gt(customerSessions.expiresAt, new Date().toISOString())));
  return <AccountShell name={customer.name} email={customer.email}>
    <PageTitle title="Settings" subtitle="Emails, devices and your data." />
    <SettingsPanel marketingOptIn={customer.marketingOptIn} deviceCount={devices} />
  </AccountShell>;
}
