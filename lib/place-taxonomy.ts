// Place library vocabulary, shared by the admin editor (browser) and the server.
/** Most gallery photos one place keeps (besides its cover); the admin editor, Telegram /add_attraction and the saved place all use it. */
export const MAX_GALLERY_PHOTOS = 40;
/** One main category per place (owner, 2026-11-16); best time and vibes carry everything else. */
export const PLACE_TYPES = ["sight", "temple", "cafe", "restaurant", "hidden-gem", "viewpoint", "market", "rooftop", "museum", "activity", "shopping", "nature", "beach", "island", "animal", "show", "spa", "nightlife", "theme-park"] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];
export const MEAL_SLOTS = ["breakfast", "brunch", "lunch", "afternoon", "dinner", "night"] as const;
export const BEST_TIMES = ["morning", "midday", "afternoon", "sunset", "night", "any"] as const;
export const VIBES = ["family", "instagram", "local-favourite", "romantic", "rainy-day", "wheelchair", "halal", "vegetarian", "budget", "luxury"] as const;
export type PlaceI18n = Partial<Record<"th" | "zh", { name?: string; shortLine?: string; description?: string }>>;


export const PLACE_TYPE_LABEL: Record<(typeof PLACE_TYPES)[number], string> = {
  sight: "Sight", temple: "Temple", cafe: "Café", restaurant: "Restaurant", "hidden-gem": "Hidden gem", viewpoint: "Viewpoint", market: "Market", rooftop: "Rooftop bar",
  museum: "Museum", activity: "Activity", shopping: "Shopping", nature: "Nature / park", beach: "Beach", island: "Island", animal: "Animals", show: "Show",
  spa: "Spa / massage", nightlife: "Nightlife", "theme-park": "Theme / water park",
};

/**
 * The areas a place can be in (owner, 2026-11-16): a fixed list, not free text, because the area also decides which
 * hourly rate a trip uses. The hourly cities (lib/hourly-areas-data.ts, lib/hourly-area-match.ts) plus Koh Samui.
 * A beach or district (Patong, Ao Nang) is the place's neighbourhood, not its area.
 */
export const PLACE_AREAS = ["Bangkok", "Pattaya", "Phuket", "Krabi", "Phang Nga", "Koh Samui", "Hua Hin", "Chiang Mai", "Kanchanaburi", "Ayutthaya", "Khao Yai", "Koh Chang", "Rayong", "Ratchaburi"] as const;
export type PlaceArea = (typeof PLACE_AREAS)[number];
export const PRICE_LEVEL = ["", "฿", "฿฿", "฿฿฿", "฿฿฿฿"];
