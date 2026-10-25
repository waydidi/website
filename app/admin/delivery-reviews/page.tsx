import type { Metadata } from "next";
import { getWaydidiAdmin, adminKeyConfigured } from "@/lib/admin";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { DeliveryReviewWorkspace } from "@/components/delivery-review-workspace";
import { deliveryKinds, type DeliveryKind } from "@/lib/delivery-review-rules";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Delivery reviews · Waydidi",robots:{index:false,follow:false}};
export default async function DeliveryReviewsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const staff=await getWaydidiAdmin();
  if(!staff)return <AdminKeyLogin configured={adminKeyConfigured()}/>;
  if(staff.role!=="owner")return <p className="p-6">Owner access required.</p>;
  const query=await searchParams;
  const initialSelected=typeof query.kind==="string"&&deliveryKinds.includes(query.kind as DeliveryKind)&&typeof query.jobId==="string"?{kind:query.kind as DeliveryKind,id:query.jobId}:null;
  return <DeliveryReviewWorkspace initialSelected={initialSelected}/>;
}
