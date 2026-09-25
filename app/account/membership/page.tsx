import type { Metadata } from "next";
import { AccountShell, PageTitle } from "@/components/account/account-shell";
import { TierCard, TierTable } from "@/components/account/tier-badge";
import { requireCustomer } from "@/lib/customer-auth";
import { memberTier } from "@/lib/member-tier-rules";
import { memberTierStatus } from "@/lib/member-tier";

export const metadata: Metadata = { title: "Membership · Waydidi", robots: { index: false, follow: false } };

export default async function MembershipPage() {
  const customer = await requireCustomer("/account/membership");
  const status = await memberTierStatus(customer.id).catch(() => memberTier(0, 0));
  return <AccountShell name={customer.name} email={customer.email}>
    <PageTitle title="Membership" subtitle="Ride more, save more. Your tier is based on the last 12 months." />
    <TierCard status={status} link={false} />
    <h2 className="mb-3 mt-7 text-lg font-black">All tiers</h2>
    <TierTable current={status.tier.id} />
    <div className="mt-6 rounded-[20px] bg-white p-5 text-sm leading-6 text-slate-600">
      <p className="font-bold text-slate-800">How it works</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Your tier goes up as soon as you reach the rides <em>or</em> the spend for it. Only completed rides count.</li>
        <li>Rides older than 12 months stop counting, so your tier can go down if you don't travel for a while.</li>
        <li>Your member discount is applied automatically at checkout when you're signed in. It covers the fare, not add-ons.</li>
        <li>It doesn't combine with promo codes or the 5th-ride reward. We apply whichever saves you more.</li>
      </ul>
    </div>
  </AccountShell>;
}
