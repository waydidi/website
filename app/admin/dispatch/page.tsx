import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";
import DispatchWorkspace from "./dispatch-workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Driver dispatch & costs · Waydidi", robots: { index:false, follow:false } };

export default async function DispatchPage(){
  const access=await requireWaydidiAdmin("/admin/dispatch");
  if(!access.authorized)return <AdminKeyLogin configured={access.configured}/>;
  return <DispatchWorkspace email={access.user.email}/>;
}
