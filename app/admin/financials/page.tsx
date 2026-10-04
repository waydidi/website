import { redirect } from "next/navigation";
import { getWaydidiAdmin } from "@/lib/admin";
export const dynamic = "force-dynamic";
export default async function FinancialsPage() {
  const staff = await getWaydidiAdmin();
  redirect(staff?.role === "operations" ? "/admin/trips/commissions" : "/admin/payments");
}
