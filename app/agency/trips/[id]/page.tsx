import type { Metadata } from "next";
import { TripWorkspace } from "@/components/trip-planner/trip-workspace";
import { requireAgencyPage } from "@/lib/agency-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trip · Agency portal", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { blocked } = await requireAgencyPage(`/agency/trips/${id}`);
  if (blocked) return blocked;
  return <div className="min-h-screen bg-[#F5F6F8]"><TripWorkspace key={id} mode="agency" tripId={id} /></div>;
}
