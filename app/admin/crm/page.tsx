import { getWaydidiAdmin } from "@/lib/admin";
import { CrmWorkspace } from "@/components/crm/workspace";
import { AdminKeyLogin } from "@/components/admin-key-login";
export const dynamic = "force-dynamic";
export default async function Page() {
    const staff = await getWaydidiAdmin();
    if (!staff)
        return <AdminKeyLogin configured/>;
    if (!['owner', 'operations', 'support'].includes(staff.role))
        return <p>CRM access required.</p>;
    return <CrmWorkspace me={{ id: staff.id, role: staff.role }}/>;
}
