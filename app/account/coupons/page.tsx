import type { Metadata } from "next";
import { AccountShell, PageTitle } from "@/components/account/account-shell";
import { CouponWallet } from "@/components/account/coupon-wallet";
import { LoyaltyCard } from "@/components/account/loyalty-card";
import { loyaltyStatus } from "@/lib/loyalty";
import { memberTierStatus } from "@/lib/member-tier";
import { spinCoupon, spinStatus } from "@/lib/spin";
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
    <MysteryBoxes boxes={boxes} />
    <GiftWallet gifts={gifts} />
    <CouponWallet coupons={spinCoupon(spin) ? [spinCoupon(spin)!, ...coupons] : coupons} />
  </AccountShell>;
}
