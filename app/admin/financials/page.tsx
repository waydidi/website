import { AdminKeyLogin } from "@/components/admin-key-login";
import { Commissions } from "@/components/trip-planner/commissions";
import { requireWaydidiAdmin } from "@/lib/admin";
import { allowedStaffRoute } from "@/lib/staff-security";
import PaymentsWorkspace from "../payments/payments-workspace";
import { ReportsSection } from "../reports/page";

export const dynamic = "force-dynamic";

// Financials on one page, top to bottom: payments, commissions, reports. Each section only shows
// for staff roles allowed to see it (operations sees commissions only).
export default async function FinancialsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; by?: string; tab?: string }> }) {
  const access = await requireWaydidiAdmin("/admin/financials");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const role = access.user.role as Parameters<typeof allowedStaffRoute>[0];
  const can = (path: string) => allowedStaffRoute(role, path, "GET");
  return <div className="grid gap-10">
    {can("/admin/payments") && <section id="payments" className="scroll-mt-20"><PaymentsWorkspace /></section>}
    {can("/admin/trips/commissions") && <section id="commissions" className="scroll-mt-20 border-t border-slate-200 pt-6"><Commissions /></section>}
    {can("/admin/reports") && <section id="reports" className="scroll-mt-20 border-t border-slate-200 pt-6"><ReportsSection searchParams={searchParams} /></section>}
  </div>;
}
