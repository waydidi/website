import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin, Settings, Users } from "lucide-react";
import { AccountShell, PageTitle } from "@/components/account/account-shell";
import { ProfileForm } from "@/components/account/profile-form";
import { requireCustomer } from "@/lib/customer-auth";

export const metadata: Metadata = { title: "Profile · Waydidi", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const customer = await requireCustomer("/account/profile");
  return <AccountShell name={customer.name} email={customer.email}>
    <PageTitle title="Profile" subtitle="Your details for faster booking." />
    <nav aria-label="More account options" className="mb-5 grid gap-2 sm:grid-cols-3 lg:hidden">
      {[{ href: "/account/places", label: "Saved places", icon: MapPin }, { href: "/account/passengers", label: "Travellers", icon: Users }, { href: "/account/settings", label: "Settings", icon: Settings }].map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="flex items-center gap-3 rounded-[18px] bg-white px-4 py-3.5 font-bold"><Icon size={19} className="text-[#D96F00]" />{label}<ChevronRight size={18} className="ml-auto text-slate-400" /></Link>)}
    </nav>
    <ProfileForm email={customer.email} initial={{ name: customer.name ?? "", surname: customer.surname ?? "", phone: customer.phone ?? "", contactPreference: customer.contactPreference }} />
  </AccountShell>;
}
