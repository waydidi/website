import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customerSavedPlaces } from "@/db/schema";
import { AccountShell, PageTitle } from "@/components/account/account-shell";
import { SavedPlaces } from "@/components/account/saved-places";
import { requireCustomer } from "@/lib/customer-auth";

export const metadata: Metadata = { title: "Saved places · Waydidi", robots: { index: false, follow: false } };

export default async function PlacesPage() {
  const customer = await requireCustomer("/account/places");
  const places = await getDb().select({ id: customerSavedPlaces.id, label: customerSavedPlaces.label, address: customerSavedPlaces.address })
    .from(customerSavedPlaces).where(eq(customerSavedPlaces.customerId, customer.id)).orderBy(asc(customerSavedPlaces.createdAt));
  return <AccountShell name={customer.name} email={customer.email}>
    <PageTitle title="Saved places" subtitle="Addresses you use often, ready to pick in one tap." />
    <SavedPlaces initial={places} />
  </AccountShell>;
}
