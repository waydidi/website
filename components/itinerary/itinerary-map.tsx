"use client";

import { RouteMap, type MapPoint } from "@/components/trip-planner/route-map";

/** The customer's route map (client-side wrapper so the page itself stays server-rendered). */
export function ItineraryMap({ points }: { points: MapPoint[] }) {
  if (!points.length) return null;
  return <RouteMap points={points} className="h-[300px] sm:h-[380px] rounded-none" />;
}
