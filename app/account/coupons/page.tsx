import type { Metadata } from "next";
import { AccountShell, PageTitle } from "@/components/account/account-shell";
import { CouponWallet } from "@/components/account/coupon-wallet";
import { requireCustomer } from "@/lib/customer-auth";
import { listMemberCoupons } from "@/lib/promo-db";

export const metadata: Metadata = { title: "My coupons · Waydidi", robots: { index: false, follow: false } };

export default async function CouponsPage() {
  const customer = await requireCustomer("/account/coupons");
  const coupons = await listMemberCoupons({ email: customer.email, phone: customer.phone ?? "", customerId: customer.id }).catch(() => []);
  return <AccountShell name={customer.name} email={customer.email}>
    <PageTitle title="My coupons" subtitle="Offers you can use on your next ride." />
    <CouponWallet coupons={coupons} />
  </AccountShell>;
}
