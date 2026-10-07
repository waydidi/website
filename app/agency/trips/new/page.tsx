import type { Metadata } from "next";
import { TripWorkspace } from "@/components/trip-planner/trip-workspace";
import { requireAgencyPage } from "@/lib/agency-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New trip · Agency portal", robots: { index: false, follow: false } };

export default async function Page() {
  const { blocked } = await requireAgencyPage("/agency/trips/new");
  if (blocked) return blocked;
  return <div className="min-h-screen bg-canvas"><TripWorkspace mode="agency" /></div>;
}
