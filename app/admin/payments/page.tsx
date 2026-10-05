import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
/** Payments now live on the Financials page. */
export default function PaymentsPage() { redirect("/admin/financials#payments"); }
