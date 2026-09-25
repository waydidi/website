import { pointInPolygon, type Point } from "./geo";

// What a fare includes on a given route. Resolved from route_inclusions rules
// when a quote is made and saved with it, so the promise can't change later.
export type Inclusions = { tolls: boolean; ferry: boolean; route: string | null };
export const NO_INCLUSIONS: Inclusions = { tolls: false, ferry: false, route: null };

export type InclusionRule = {
  name: string;
  originZoneJson: string;
  destinationZoneJson: string;
  bidirectional: boolean;
  includesTolls: boolean;
  includesFerry: boolean;
  active: boolean;
  priority: number;
};

function inZone(point: Point, zoneJson: string) {
  try {
    const polygons = JSON.parse(zoneJson) as Point[][];
    return polygons.some((polygon) => polygon.length >= 3 && pointInPolygon(point, polygon));
  } catch {
    return false;
  }
}

export function resolveInclusions(pickup: Point, dropoff: Point, rules: InclusionRule[]): Inclusions {
  const match = rules
    .filter((rule) => rule.active)
    .sort((a, b) => b.priority - a.priority)
    .find((rule) =>
      (inZone(pickup, rule.originZoneJson) && inZone(dropoff, rule.destinationZoneJson)) ||
      (rule.bidirectional && inZone(pickup, rule.destinationZoneJson) && inZone(dropoff, rule.originZoneJson)));
  return match ? { tolls: match.includesTolls, ferry: match.includesFerry, route: match.name } : NO_INCLUSIONS;
}

const box = (south: number, north: number, west: number, east: number) =>
  JSON.stringify([[{ lat: south, lng: west }, { lat: south, lng: east }, { lat: north, lng: east }, { lat: north, lng: west }]]);
// Bangkok with Nonthaburi, Samut Prakan and both airports.
const BANGKOK = box(13.45, 14.05, 100.25, 100.97);
const rule = (name: string, zone: string, includesFerry = false): InclusionRule =>
  ({ name, originZoneJson: BANGKOK, destinationZoneJson: zone, bidirectional: true, includesTolls: true, includesFerry, active: true, priority: 50 });

// Built-in rules, matching the migration seed. Used while the route_inclusions
// table has no rows, so these routes are right before any admin setup.
export const DEFAULT_RULES: InclusionRule[] = [
  rule("Bangkok ⇄ Pattaya", box(12.62, 13.02, 100.82, 101.0)),
  rule("Bangkok ⇄ Rayong", box(12.5, 13.1, 101.0, 101.8)),
  rule("Bangkok ⇄ Chanthaburi", box(12.25, 13.3, 101.8, 102.45)),
  rule("Bangkok ⇄ Trat, Koh Chang, Koh Kood, Koh Mak", box(11.55, 12.7, 102.2, 102.95), true),
  rule("Bangkok ⇄ Chachoengsao", box(13.25, 14.05, 100.97, 101.95)),
];

export function parseInclusions(json: string | null | undefined): Inclusions {
  try {
    const value = JSON.parse(json ?? "") as Partial<Inclusions>;
    return { tolls: value.tolls === true, ferry: value.ferry === true, route: typeof value.route === "string" ? value.route : null };
  } catch {
    return NO_INCLUSIONS;
  }
}

type Lang = "en" | "th" | "zh";
const TEXT: Record<Lang, { tolls: string; ferry: string; tollsExcluded: string }> = {
  en: { tolls: "Expressway and motorway tolls included", ferry: "Car ferry tickets included", tollsExcluded: "Expressway and motorway tolls" },
  th: { tolls: "รวมค่าทางด่วนและมอเตอร์เวย์แล้ว", ferry: "รวมค่าตั๋วเรือเฟอร์รี่แล้ว", tollsExcluded: "ค่าทางด่วนและมอเตอร์เวย์" },
  zh: { tolls: "已含高速公路及收费道路费用", ferry: "已含汽车渡轮船票", tollsExcluded: "高速公路及收费道路费用" },
};

// Lines for the "Included" and "Excluded" lists shown to the customer.
export function inclusionLines(inclusions: Inclusions, locale: string) {
  const text = TEXT[(locale in TEXT ? locale : "en") as Lang];
  const included = [inclusions.tolls && text.tolls, inclusions.ferry && text.ferry].filter(Boolean) as string[];
  const excluded = inclusions.tolls ? [] : [text.tollsExcluded];
  return { included, excluded };
}

// Zones are edited as simple latitude/longitude boxes (south, north, west, east).
export type Box = { south: number; north: number; west: number; east: number };

export function boxFromZone(zoneJson: string): Box | null {
  try {
    const points = (JSON.parse(zoneJson) as { lat: number; lng: number }[][]).flat();
    if (!points.length) return null;
    const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
    return { south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lngs), east: Math.max(...lngs) };
  } catch { return null; }
}

export const zoneFromBox = (b: Box) => JSON.stringify([[{ lat: b.south, lng: b.west }, { lat: b.south, lng: b.east }, { lat: b.north, lng: b.east }, { lat: b.north, lng: b.west }]]);
