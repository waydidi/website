import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customerSavedPassengers } from "@/db/schema";
import { AccountShell, PageTitle } from "@/components/account/account-shell";
import { SavedPassengers } from "@/components/account/saved-passengers";
import { requireCustomer } from "@/lib/customer-auth";

export const metadata: Metadata = { title: "Travellers · Waydidi", robots: { index: false, follow: false } };

export default async function PassengersPage() {
  const customer = await requireCustomer("/account/passengers");
  const passengers = await getDb().select({ id: customerSavedPassengers.id, name: customerSavedPassengers.name, surname: customerSavedPassengers.surname, email: customerSavedPassengers.email, phone: customerSavedPassengers.phone, notes: customerSavedPassengers.notes })
    .from(customerSavedPassengers).where(eq(customerSavedPassengers.customerId, customer.id)).orderBy(asc(customerSavedPassengers.createdAt));
  return <AccountShell name={customer.name} email={customer.email}>
    <PageTitle title="Travellers" subtitle="People you often book for, including family and colleagues." />
    <SavedPassengers initial={passengers} />
  </AccountShell>;
}
