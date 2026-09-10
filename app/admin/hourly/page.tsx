import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";
import HourlyWorkspace from "./workspace";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Hourly pricing · Waydidi operations",robots:{index:false,follow:false}};
export default async function Page(){const access=await requireWaydidiAdmin("/admin/hourly");if(!access.authorized)return <AdminKeyLogin configured={access.configured}/>;return <HourlyWorkspace/>;}
