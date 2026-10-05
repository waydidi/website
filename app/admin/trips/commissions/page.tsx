import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
/** Commissions now live on the Financials page. */
export default function Page() { redirect("/admin/financials#commissions"); }
