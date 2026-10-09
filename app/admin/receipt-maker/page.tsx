import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";
import ReceiptMaker from "./receipt-maker";
export const dynamic = "force-dynamic";
export default async function Page() {
 const access = await requireWaydidiAdmin("/admin/financials");
 if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
 if (access.user.role !== "owner" && access.user.role !== "finance") return <p>Finance permission required.</p>;
 return <ReceiptMaker />;
}
