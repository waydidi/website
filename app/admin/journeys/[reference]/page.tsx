import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";
import JourneyDetails from "./journey-details";
import { RefundPanel } from "./refund-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Journey details · Waydidi", robots: { index:false, follow:false } };

export default async function JourneyPage({params}:{params:Promise<{reference:string}>}) {
  const {reference}=await params;
  const access=await requireWaydidiAdmin(`/admin/journeys/${encodeURIComponent(reference)}`);
  if(!access.authorized)return <AdminKeyLogin configured={access.configured}/>;
  return <><JourneyDetails reference={reference}/><div className="mx-auto max-w-[1180px] px-4 pb-10 sm:px-8"><RefundPanel reference={reference}/></div></>;
}
