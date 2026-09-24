import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { PromotionsAdmin } from "@/components/promotions-admin";
import { requireWaydidiAdmin } from "@/lib/admin";
import { listPromotions } from "@/lib/promo-admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Promotions · Waydidi operations", robots: { index: false, follow: false } };

export default async function PromotionsAdminPage() {
  const access = await requireWaydidiAdmin("/admin/promotions");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const promotions = await listPromotions().catch(() => null);
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-[#1f1726] sm:px-8">
    <div className="mx-auto max-w-[1200px]">
      {promotions ? <PromotionsAdmin promotions={promotions} /> : <p className="mt-6 rounded-2xl bg-amber-50 p-5 text-amber-900">Promotions aren&apos;t set up in the database yet. Apply migration 0032 (promo_codes and promo_redemptions tables), then reload.</p>}
    </div>
  </main>;
}
