// Place library vocabulary, shared by the admin editor (browser) and the server.
export const PLACE_TYPES = ["sight", "temple", "cafe", "restaurant", "hidden-gem", "viewpoint", "market", "rooftop", "museum", "activity", "shopping", "nature", "beach", "island", "animal", "show"] as const;
export const MEAL_SLOTS = ["breakfast", "brunch", "lunch", "afternoon", "dinner", "night"] as const;
export const BEST_TIMES = ["morning", "midday", "afternoon", "sunset", "night", "any"] as const;
export const VIBES = ["family", "instagram", "local-favourite", "romantic", "rainy-day", "wheelchair", "halal", "vegetarian", "budget", "luxury"] as const;
export type PlaceI18n = Partial<Record<"th" | "zh", { name?: string; shortLine?: string; description?: string }>>;


export const PLACE_TYPE_LABEL: Record<(typeof PLACE_TYPES)[number], string> = {
  sight: "Sight", temple: "Temple", cafe: "Café", restaurant: "Restaurant", "hidden-gem": "Hidden gem", viewpoint: "Viewpoint", market: "Market", rooftop: "Rooftop bar",
  museum: "Museum", activity: "Activity", shopping: "Shopping", nature: "Nature / park", beach: "Beach", island: "Island", animal: "Animals", show: "Show",
};
export const PRICE_LEVEL = ["", "฿", "฿฿", "฿฿฿", "฿฿฿฿"];
