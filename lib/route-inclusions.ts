import { pointInPolygon, type Point } from "./geo";

// What a fare includes on a given route. Resolved from ROUTES below when a
// quote is made and saved with it, so the promise can't change later.
export type Inclusions = { tolls: boolean; ferry: boolean; hotelTransfer?: boolean; route: string | null };
export const NO_INCLUSIONS: Inclusions = { tolls: false, ferry: false, hotelTransfer: false, route: null };

export type InclusionRule = {
  name: string;
  originZoneJson: string;
  destinationZoneJson: string;
  bidirectional: boolean;
  includesTolls: boolean;
  includesFerry: boolean;
  includesHotelTransfer?: boolean;
  active: boolean;
  priority: number;
};

// Matches any pickup or drop-off point.
const ANYWHERE = "*";

function inZone(point: Point, zoneJson: string) {
  if (zoneJson === ANYWHERE) return true;
  try {
    const polygons = JSON.parse(zoneJson) as Point[][];
    return polygons.some((polygon) => polygon.length >= 3 && pointInPolygon(point, polygon));
  } catch {
    return false;
  }
}

// Every matching rule adds what it includes (e.g. Bangkok→Koh Chang gets tolls
// from the Bangkok route and the ferry from the Koh Chang rule).
export function resolveInclusions(pickup: Point, dropoff: Point, rules: InclusionRule[]): Inclusions {
  const matches = rules
    .filter((rule) => rule.active)
    .sort((a, b) => b.priority - a.priority)
    // "Any pickup" rules need one end outside the area (a ride within Pattaya uses no motorway).
    .filter((rule) => !(rule.originZoneJson === ANYWHERE && inZone(pickup, rule.destinationZoneJson) && inZone(dropoff, rule.destinationZoneJson)))
    .filter((rule) =>
      (inZone(pickup, rule.originZoneJson) && inZone(dropoff, rule.destinationZoneJson)) ||
      (rule.bidirectional && inZone(pickup, rule.destinationZoneJson) && inZone(dropoff, rule.originZoneJson)));
  if (!matches.length) return NO_INCLUSIONS;
  return {
    tolls: matches.some((m) => m.includesTolls),
    ferry: matches.some((m) => m.includesFerry),
    hotelTransfer: matches.some((m) => m.includesHotelTransfer === true),
    route: matches[0].name,
  };
}

const box = (south: number, north: number, west: number, east: number) =>
  JSON.stringify([[{ lat: south, lng: west }, { lat: south, lng: east }, { lat: north, lng: east }, { lat: north, lng: west }]]);
// Bangkok with Nonthaburi, Samut Prakan and both airports.
const BANGKOK = box(13.45, 14.05, 100.25, 100.97);

// What each route's fare includes. Edit these lists to change it. Every rule works
// both ways, rules add up, and routes not listed show tolls as excluded.
//   Any pickup to or from Pattaya: motorway toll included
//   Any pickup to or from Koh Chang: ferry ticket included
//   Any pickup to or from Koh Kood or Koh Mak: ferry and hotel transfer included
//   Bangkok to Rayong, Chanthaburi, Chachoengsao, Trat: motorway toll included
const PATTAYA = box(12.62, 13.02, 100.82, 101.0);
const KOH_CHANG = box(11.95, 12.22, 102.25, 102.45);
const KOH_KOOD = box(11.55, 11.76, 102.48, 102.62);
const KOH_MAK = box(11.77, 11.87, 102.43, 102.53);

type Route = { name: string; from: string; to: string; tolls?: boolean; ferry?: boolean; hotelTransfer?: boolean; priority?: number };
const ROUTES: Route[] = [
  { name: "Any pickup to Pattaya", from: ANYWHERE, to: PATTAYA, tolls: true, priority: 60 },
  { name: "Any pickup to Koh Chang", from: ANYWHERE, to: KOH_CHANG, ferry: true, priority: 60 },
  { name: "Any pickup to Koh Kood", from: ANYWHERE, to: KOH_KOOD, ferry: true, hotelTransfer: true, priority: 60 },
  { name: "Any pickup to Koh Mak", from: ANYWHERE, to: KOH_MAK, ferry: true, hotelTransfer: true, priority: 60 },
  { name: "Bangkok to Rayong", from: BANGKOK, to: box(12.5, 13.1, 101.0, 101.8), tolls: true },
  { name: "Bangkok to Chanthaburi", from: BANGKOK, to: box(12.25, 13.3, 101.8, 102.45), tolls: true },
  { name: "Bangkok to Chachoengsao", from: BANGKOK, to: box(13.25, 14.05, 100.97, 101.95), tolls: true },
  { name: "Bangkok to Trat and the islands", from: BANGKOK, to: box(11.55, 12.7, 102.2, 102.95), tolls: true },
];

export const ROUTE_RULES: InclusionRule[] = ROUTES.map((r) => ({
  name: r.name, originZoneJson: r.from, destinationZoneJson: r.to, bidirectional: true,
  includesTolls: r.tolls === true, includesFerry: r.ferry === true, includesHotelTransfer: r.hotelTransfer === true,
  active: true, priority: r.priority ?? 50,
}));

export function parseInclusions(json: string | null | undefined): Inclusions {
  try {
    const value = JSON.parse(json ?? "") as Partial<Inclusions>;
    return { tolls: value.tolls === true, ferry: value.ferry === true, hotelTransfer: value.hotelTransfer === true, route: typeof value.route === "string" ? value.route : null };
  } catch {
    return NO_INCLUSIONS;
  }
}

type Lang = "en" | "th" | "zh";
const TEXT: Record<Lang, { tolls: string; ferry: string; hotel: string; tollsExcluded: string }> = {
  en: { tolls: "Expressway and motorway tolls included", ferry: "Car ferry tickets included", hotel: "Ferry and hotel transfer on the island included", tollsExcluded: "Expressway and motorway tolls" },
  th: { tolls: "รวมค่าทางด่วนและมอเตอร์เวย์แล้ว", ferry: "รวมค่าตั๋วเรือเฟอร์รี่แล้ว", hotel: "รวมเรือเฟอร์รี่และรถรับส่งถึงโรงแรมบนเกาะแล้ว", tollsExcluded: "ค่าทางด่วนและมอเตอร์เวย์" },
  zh: { tolls: "已含高速公路及收费道路费用", ferry: "已含汽车渡轮船票", hotel: "已含渡轮及岛上酒店接送", tollsExcluded: "高速公路及收费道路费用" },
};

// Lines for the "Included" and "Excluded" lists shown to the customer.
export function inclusionLines(inclusions: Inclusions, locale: string) {
  const text = TEXT[(locale in TEXT ? locale : "en") as Lang];
  const included = [inclusions.tolls && text.tolls, inclusions.hotelTransfer ? text.hotel : inclusions.ferry && text.ferry].filter(Boolean) as string[];
  const excluded = inclusions.tolls ? [] : [text.tollsExcluded];
  return { included, excluded };
}
