// Reading a place's area, category and tags from what staff type (Telegram /add_attraction, /add_trip) or what Google Maps says.
// Pure (no runtime imports beyond other pure modules), so it is unit tested directly (tests/place-words.test.mjs).

import { cityOfText } from "@/lib/hourly-area-match";
import { BEST_TIMES, PLACE_AREAS, VIBES, type PlaceArea, type PlaceType } from "@/lib/place-taxonomy";

const AREA_OF_CITY: Record<string, PlaceArea> = {
  bangkok: "Bangkok", pattaya: "Pattaya", phuket: "Phuket", krabi: "Krabi", "phang-nga": "Phang Nga", "hua-hin": "Hua Hin", "chiang-mai": "Chiang Mai",
  kanchanaburi: "Kanchanaburi", ayutthaya: "Ayutthaya", "khao-yai": "Khao Yai", "koh-chang": "Koh Chang", rayong: "Rayong", ratchaburi: "Ratchaburi",
};
const SAMUI = /ko(h)?\s*samui|chaweng|lamai|bophut|เกาะสมุย|สมุย/i;
const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The fixed area a text names: the area itself in any case ("phuket"), or a place inside it ("Patong" → Phuket,
 * "Ao Nang" → Krabi, "Chaweng" → Koh Samui), the same words the hourly rates use. Null when none is named.
 */
export function areaOf(text: string | null | undefined): PlaceArea | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const exact = PLACE_AREAS.find((a) => key(a) === key(t));
  if (exact) return exact;
  if (SAMUI.test(t)) return "Koh Samui";
  const city = cityOfText(t);
  return city ? AREA_OF_CITY[city] ?? null : null;
}

// Category words staff may type, English and Thai (lower case), longest match wins.
const CATEGORY_WORDS: [PlaceType, string[]][] = [
  ["theme-park", ["theme park", "water park", "waterpark", "amusement park", "สวนน้ำ", "สวนสนุก"]],
  ["spa", ["spa", "massage", "wellness", "สปา", "นวด"]],
  ["nightlife", ["nightlife", "night life", "bar", "bars", "club", "night club", "nightclub", "ไนท์ไลฟ์", "บาร์", "ผับ"]],
  ["temple", ["temple", "wat", "shrine", "church", "mosque", "วัด", "ศาลเจ้า", "โบสถ์", "มัสยิด"]],
  ["museum", ["museum", "gallery", "พิพิธภัณฑ์", "หอศิลป์"]],
  ["viewpoint", ["viewpoint", "view point", "lookout", "จุดชมวิว"]],
  ["market", ["market", "night market", "floating market", "ตลาด", "ตลาดน้ำ", "ตลาดนัด"]],
  ["rooftop", ["rooftop", "rooftop bar", "รูฟท็อป"]],
  ["cafe", ["cafe", "café", "coffee", "คาเฟ่", "ร้านกาแฟ"]],
  ["restaurant", ["restaurant", "food", "ร้านอาหาร"]],
  ["shopping", ["shopping", "mall", "shop", "ช้อปปิ้ง", "ห้าง"]],
  ["nature", ["nature", "park", "waterfall", "national park", "garden", "ธรรมชาติ", "น้ำตก", "อุทยาน", "สวน"]],
  ["beach", ["beach", "ชายหาด", "หาด"]],
  ["island", ["island", "เกาะ"]],
  ["animal", ["animal", "animals", "zoo", "aquarium", "elephant", "สัตว์", "สวนสัตว์", "ช้าง"]],
  ["show", ["show", "cabaret", "โชว์", "การแสดง"]],
  ["activity", ["activity", "adventure", "tour", "กิจกรรม"]],
  ["hidden-gem", ["hidden gem", "hidden-gem"]],
  ["sight", ["sight", "attraction", "landmark", "สถานที่ท่องเที่ยว"]],
];
const CATEGORY_OF = new Map(CATEGORY_WORDS.flatMap(([type, words]) => words.map((w) => [w, type] as const)));

/** A category word staff typed as a whole part ("temple", "วัด", "water park", "theme-park"), or null. */
export function categoryOfWord(text: string): PlaceType | null {
  const k = text.trim().toLowerCase().replace(/\s+/g, " ");
  return CATEGORY_OF.get(k) ?? CATEGORY_OF.get(k.replace(/-/g, " ")) ?? null;
}

// Google Places types (https://developers.google.com/maps/documentation/places/web-service/place-types) → our
// category, most specific first. The primary type is tried before the others.
const GOOGLE_TYPES: [PlaceType, string[]][] = [
  ["theme-park", ["amusement_park", "water_park", "theme_park", "amusement_center"]],
  ["spa", ["spa", "massage", "wellness_center", "sauna", "public_bath"]],
  ["nightlife", ["night_club", "bar", "pub", "karaoke", "wine_bar", "cocktail_bar"]],
  ["temple", ["buddhist_temple", "hindu_temple", "place_of_worship", "church", "mosque", "synagogue", "shinto_shrine"]],
  ["museum", ["museum", "art_gallery", "history_museum", "art_museum"]],
  ["animal", ["zoo", "aquarium", "wildlife_park", "wildlife_refuge"]],
  ["viewpoint", ["observation_deck", "scenic_spot"]],
  ["market", ["market", "farmers_market", "flea_market"]],
  ["beach", ["beach"]],
  ["island", ["island"]],
  ["nature", ["national_park", "state_park", "park", "hiking_area", "garden", "botanical_garden", "waterfall", "nature_preserve"]],
  ["cafe", ["cafe", "coffee_shop", "tea_house", "bakery"]],
  ["restaurant", ["restaurant", "food_court", "fine_dining_restaurant", "thai_restaurant", "seafood_restaurant"]],
  ["shopping", ["shopping_mall", "department_store", "store", "clothing_store"]],
  ["show", ["performing_arts_theater", "event_venue", "concert_hall"]],
  ["activity", ["tour_agency", "adventure_sports_center", "go_karting_venue", "golf_course"]],
  ["sight", ["tourist_attraction", "historical_landmark", "historical_place", "monument", "cultural_landmark", "plaza"]],
];

/**
 * The category a Google Maps place's types point to, or null when none fits. The primary type wins unless it is only a
 * general "tourist attraction"; then the most specific of the other types (a spa that is also a tourist attraction is a spa).
 */
export function categoryFromGoogle(primaryType: string | null | undefined, types: string[] | null | undefined): PlaceType | null {
  const of = (t: string) => GOOGLE_TYPES.find(([, list]) => list.includes(t))?.[0] ?? null;
  const primary = primaryType ? of(primaryType) : null;
  if (primary && primary !== "sight") return primary;
  const all = new Set([primaryType, ...(types ?? [])].filter((x): x is string => Boolean(x)));
  return GOOGLE_TYPES.find(([, list]) => list.some((t) => all.has(t)))?.[0] ?? null;
}

export type PlaceTags = { bestTime: (typeof BEST_TIMES)[number] | null; vibes: (typeof VIBES)[number][]; unknown: string[] };
const TAG_ALIASES: Record<string, string> = { sunrise: "morning", evening: "sunset", "local favourite": "local-favourite", local: "local-favourite", "local-favorite": "local-favourite",
  ig: "instagram", photo: "instagram", kids: "family", families: "family", rain: "rainy-day", "rainy day": "rainy-day", accessible: "wheelchair", vegan: "vegetarian", cheap: "budget" };

/** "#sunset #instagram #family" → best time and vibes; words that are neither are returned so staff are told. */
export function readTags(text: string): PlaceTags {
  const out: PlaceTags = { bestTime: null, vibes: [], unknown: [] };
  for (const raw of text.split(/[#,]/).map((w) => w.trim().toLowerCase()).filter(Boolean)) {
    const w = TAG_ALIASES[raw] ?? raw.replace(/\s+/g, "-");
    if ((BEST_TIMES as readonly string[]).includes(w)) out.bestTime = w as PlaceTags["bestTime"];
    else if ((VIBES as readonly string[]).includes(w)) { if (!out.vibes.includes(w as PlaceTags["vibes"][number])) out.vibes.push(w as PlaceTags["vibes"][number]); }
    else out.unknown.push(raw);
  }
  return out;
}
