import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";
import PaymentsWorkspace from "./payments-workspace";
export const dynamic = "force-dynamic";
export default async function PaymentsPage() { const access = await requireWaydidiAdmin("/admin/payments"); if (!access.authorized)
    return <AdminKeyLogin configured={access.configured}/>; return <PaymentsWorkspace />; }
