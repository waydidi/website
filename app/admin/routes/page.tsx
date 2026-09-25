import { FareTabs } from "@/components/admin-fares/fare-tabs";
import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { RouteInclusionsAdmin } from "@/components/route-inclusions-admin";
import { requireWaydidiAdmin } from "@/lib/admin";
import { listRules } from "@/lib/route-inclusions-admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Route inclusions · Waydidi operations", robots: { index: false, follow: false } };

export default async function RouteInclusionsPage() {
  const access = await requireWaydidiAdmin("/admin/routes");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const rules = await listRules().catch(() => null);
  return <><FareTabs current="/admin/routes" /><main className="min-h-screen bg-slate-50 px-4 py-8 text-[#1f1726] sm:px-8">
    <div className="mx-auto max-w-[1200px]">
      {rules ? <RouteInclusionsAdmin rules={rules} /> : <p className="mt-6 rounded-2xl bg-amber-50 p-5 text-amber-900">The route_inclusions table isn&apos;t in the database yet. Apply its migration, then reload.</p>}
    </div>
  </main></>;
}
