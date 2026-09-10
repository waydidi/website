import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pricingAreas, pricingRules } from "@/db/schema";

export const VEHICLE_IDS = [
  "economy_sedan",
  "comfort_bmw",
  "comfort_suv",
  "premium_minivan",
] as const;
export type PricingVehicleId = (typeof VEHICLE_IDS)[number];
export type Point = { lat: number; lng: number };

export function validPolygon(points: Point[]) {
  return (
    points.length >= 3 &&
    points.length <= 500 &&
    points.every(
      (point) =>
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng) &&
        point.lat >= 5 &&
        point.lat <= 21 &&
        point.lng >= 96 &&
        point.lng <= 106,
    )
  );
}

export function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const a = polygon[current];
    const b = polygon[previous];
    const intersects =
      a.lng > point.lng !== b.lng > point.lng &&
      point.lat <
        ((b.lat - a.lat) * (point.lng - a.lng)) /
          (b.lng - a.lng || Number.EPSILON) +
          a.lat;
    if (intersects) inside = !inside;
  }
  return inside;
}

export async function matchPublishedArea(destination: Point) {
  const areas = await getDb()
    .select()
    .from(pricingAreas)
    .where(eq(pricingAreas.status, "published"))
    .orderBy(desc(pricingAreas.priority));
  for (const area of areas) {
    try {
      const polygons = JSON.parse(
        area.publishedGeometryJson ?? "[]",
      ) as Point[][];
      if (
        polygons.some(
          (polygon) =>
            validPolygon(polygon) && pointInPolygon(destination, polygon),
        )
      )
        return area;
    } catch {
      continue;
    }
  }
  return null;
}

export async function pricesForArea(areaId: string, distanceMeters: number) {
  const rules = await getDb()
    .select()
    .from(pricingRules)
    .where(eq(pricingRules.areaId, areaId));
  return Object.fromEntries(
    rules
      .filter(
        (rule) =>
          rule.active &&
          VEHICLE_IDS.includes(rule.vehicleId as PricingVehicleId),
      )
      .map((rule) => {
        const excessKm = Math.max(
          0,
          Math.ceil(distanceMeters / 1000 - rule.includedDistanceKm),
        );
        const raw =
          rule.fixedPrice ?? rule.basePrice + excessKm * rule.extraPricePerKm;
        const total = Math.ceil(raw / 50) * 50;
        return [
          rule.vehicleId,
          {
            total,
            basePrice: rule.fixedPrice ?? rule.basePrice,
            distanceSurcharge: rule.fixedPrice
              ? 0
              : Math.max(0, raw - rule.basePrice),
          },
        ];
      }),
  );
}
