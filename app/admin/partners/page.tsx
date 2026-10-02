import { requireWaydidiAdmin } from "@/lib/admin";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { PartnerContracts } from "@/components/agencies-admin/partner-contracts";
export const dynamic="force-dynamic";
export const metadata={title:"Partner contracts · Waydidi",robots:{index:false,follow:false}};
export default async function Page(){const access=await requireWaydidiAdmin("/admin/partners");if(!access.authorized)return <AdminKeyLogin configured={access.configured}/>;return <PartnerContracts/>;}
