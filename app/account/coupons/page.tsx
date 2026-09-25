import type { Metadata } from "next";
import { AccountShell, PageTitle } from "@/components/account/account-shell";
import { CouponWallet } from "@/components/account/coupon-wallet";
import { LoyaltyCard } from "@/components/account/loyalty-card";
import { loyaltyStatus } from "@/lib/loyalty";
import { memberTierStatus } from "@/lib/member-tier";
import { spinStatus } from "@/lib/spin";
import { listMemberGifts } from "@/lib/gifts";
import { GiftWallet } from "@/components/account/gift-wallet";
import { MysteryBoxes } from "@/components/account/mystery-boxes";
import { listMemberBoxes } from "@/lib/boxes";
import { TierCard } from "@/components/account/tier-badge";
import { requireCustomer } from "@/lib/customer-auth";
import { listMemberCoupons } from "@/lib/promo-db";

export const metadata: Metadata = { title: "My coupons · Waydidi", robots: { index: false, follow: false } };

export default async function CouponsPage() {
  const customer = await requireCustomer("/account/coupons");
  // Independent lookups run together; boxes are listed after gifts, which issues new ones.
  const [loyalty, tier, spin, gifts, coupons] = await Promise.all([
    loyaltyStatus(customer.id).catch(() => null),
    memberTierStatus(customer.id).catch(() => null),
    spinStatus(customer.id).catch(() => null),
    listMemberGifts(customer.id).catch(() => []),
    listMemberCoupons({ email: customer.email, phone: customer.phone ?? "", customerId: customer.id }).catch(() => []),
  ]);
  const boxes = await listMemberBoxes(customer.id).catch(() => []);
  return <AccountShell name={customer.name} email={customer.email}>
    <PageTitle title="My coupons" subtitle="Offers you can use on your next ride." />
    {tier && <div className="mb-4"><TierCard status={tier} /></div>}
    {loyalty && <div className="mb-4"><LoyaltyCard status={loyalty} /></div>}
    {spin?.spun && spin.prize && <section className="mb-4 flex items-center gap-4 rounded-[20px] bg-white p-5" aria-label="Wheel prize">
      <span className="grid size-11 shrink-0 place-items-center rounded-full text-lg font-black text-white" style={{ background: spin.prize.color }}>🎡</span>
      <div className="min-w-0 flex-1"><p className="font-bold">Wheel prize: {spin.prize.label}</p><p className="mt-0.5 text-sm text-slate-600">{spin.used ? "Used — thanks for riding with us." : spin.expired ? "Expired." : `Applied automatically at checkout · valid until ${new Date(spin.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}</p></div>
    </section>}
    <MysteryBoxes boxes={boxes} />
    <GiftWallet gifts={gifts} />
    <CouponWallet coupons={coupons} />
  </AccountShell>;
}
