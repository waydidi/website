import type { Metadata } from "next";
import { AccountShell, PageTitle } from "@/components/account/account-shell";
import { ProfileForm } from "@/components/account/profile-form";
import { requireCustomer } from "@/lib/customer-auth";

export const metadata: Metadata = { title: "Profile · Waydidi", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const customer = await requireCustomer("/account/profile");
  return <AccountShell name={customer.name} email={customer.email}>
    <PageTitle title="Profile" subtitle="Your details for faster booking." />
    <ProfileForm email={customer.email} initial={{ name: customer.name ?? "", surname: customer.surname ?? "", phone: customer.phone ?? "", contactPreference: customer.contactPreference }} />
  </AccountShell>;
}
