import { requireWaydidiAdmin } from "@/lib/admin";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { MembersWorkspace } from "@/components/users-admin/members-workspace";
import { memberPage } from "@/lib/customer-admin";
export const dynamic = "force-dynamic";
export default async function Page() {
    const a = await requireWaydidiAdmin();
    if (!a.authorized)
        return <AdminKeyLogin configured={a.configured}/>;
    return <MembersWorkspace initial={await memberPage("", 1)} canDelete={a.user.role === 'owner'} canExport={a.user.role !== 'support'}/>;
}
