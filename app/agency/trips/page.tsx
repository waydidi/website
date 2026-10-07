import type { Metadata } from "next";
import { TripsList } from "@/components/trip-planner/trips-list";
import { requireAgencyPage } from "@/lib/agency-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trip planner · Agency portal", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { blocked } = await requireAgencyPage("/agency/trips");
  if (blocked) return blocked;
  const { view } = await searchParams;
  return <div className="min-h-screen bg-canvas"><TripsList mode="agency" view={view === "templates" ? "templates" : "trips"} /></div>;
}
