// Waydidi travel guides. Written for Waydidi (not copied from other sites);
// covers are brand graphics, optionally over one of our own photos.

export type BlogCategory = "getting-there" | "airport-tips" | "day-trips" | "itineraries" | "travel-tips";

export const BLOG_CATEGORIES: Record<BlogCategory, string> = {
  "getting-there": "Getting there",
  "airport-tips": "Airport tips",
  "day-trips": "Day trips",
  itineraries: "Itineraries",
  "travel-tips": "Travel tips",
};

export type BlogSection = { heading: string; paragraphs: string[]; tip?: string; list?: string[] };

// Content blocks, WordPress-style. Posts written in Admin → Blog are stored as blocks.
export type BlogBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "tip"; text: string }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "faq"; items: { q: string; a: string }[] }
  | { type: "booking" };

export const COVER_TONES = ["orange", "navy", "green", "plum"] as const;
export type CoverTone = (typeof COVER_TONES)[number];

/** Category keys from the starter set map to labels; admin categories are stored as labels. */
export const categoryLabel = (c: string) => (BLOG_CATEGORIES as Record<string, string>)[c] ?? c;

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO date
  categories: string[];
  featured?: boolean;
  popular?: number; // rank in "Popular articles"
  cover: { headline: string; photo?: string; tone: CoverTone };
  // Pre-fills the booking form from the article's booking card.
  route?: { pickup: string; dropoff: string; label: string; service?: "transfer" | "hourly" };
  /** Last edit (YYYY-MM-DD); shown when later than the publish date. */
  updated?: string;
  sections?: BlogSection[];
  faq?: { q: string; a: string }[];
  blocks?: BlogBlock[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  author?: string;
};

/** A post's content as blocks (starter posts are written as sections). */
export function postBlocks(post: BlogPost): BlogBlock[] {
  if (post.blocks) return post.blocks;
  const blocks: BlogBlock[] = [];
  (post.sections ?? []).forEach((s, i) => {
    blocks.push({ type: "heading", text: s.heading });
    s.paragraphs.forEach((text) => blocks.push({ type: "paragraph", text }));
    if (s.list) blocks.push({ type: "list", items: s.list });
    if (s.tip) blocks.push({ type: "tip", text: s.tip });
    if (i === Math.min(1, (post.sections ?? []).length - 1) && post.route) blocks.push({ type: "booking" });
  });
  if (post.faq?.length) blocks.push({ type: "faq", items: post.faq });
  return blocks;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "suvarnabhumi-airport-to-pattaya",
    title: "Suvarnabhumi Airport to Pattaya: taxi, bus or private transfer?",
    excerpt: "The three main ways to get from Bangkok's main airport to Pattaya, how long each takes and which one suits families, groups and late arrivals.",
    date: "2026-09-20",
    categories: ["getting-there", "airport-tips"],
    featured: true,
    popular: 1,
    cover: { headline: "BKK → Pattaya\nthe easy way", photo: "/hero-driver-customer.webp", tone: "orange" },
    route: { pickup: "Suvarnabhumi Airport (BKK)", dropoff: "Pattaya", label: "Suvarnabhumi Airport → Pattaya" },
    faq: [
      { q: "How long is the drive from Suvarnabhumi to Pattaya?", a: "Usually about 1 hour 30 minutes. Allow more on Friday evenings and holiday weekends." },
      { q: "Is the price per car or per person?", a: "Per car. The fixed price covers everyone in the vehicle, up to its seat limit." },
      { q: "What if my flight is late?", a: "Add your flight number when you book. Your driver follows the arrival time, and the first 60 minutes of waiting at the airport are free." },
    ],
    sections: [
      { heading: "How far is it?", paragraphs: ["Pattaya is roughly 120 km south-east of Suvarnabhumi Airport. By road the drive usually takes about 1 hour 30 minutes, longer on Friday evenings and holiday weekends when traffic out of Bangkok builds up."] },
      { heading: "Option 1: airport bus", paragraphs: ["Buses to Pattaya leave from the airport's ground floor. They are the cheapest option, but you'll need to wait for the next departure, carry your own luggage and take another ride from the bus stop to your hotel."], tip: "Fine for light travellers on a budget, less so with children or big suitcases." },
      { heading: "Option 2: public taxi", paragraphs: ["Metered taxis queue outside arrivals. Agree on tolls and any airport surcharge before you set off, and expect the price to change with traffic."] },
      { heading: "Option 3: private transfer", paragraphs: ["A private transfer is booked before you fly: the price is fixed, your driver waits in the arrivals hall with a name sign, and the car is chosen for your group and luggage. With Waydidi, airport pickups include 60 minutes of free waiting after landing, and tolls are included on the Bangkok ⇄ Pattaya route."], list: ["Fixed price agreed before you book", "Meet & Greet in the arrivals hall", "Child seats available as an add-on", "Free cancellation up to 24 hours before pickup"] },
      { heading: "Which should you choose?", paragraphs: ["Travelling alone with a backpack in daytime? The bus works. Arriving late, with family, or with more than two suitcases? A private transfer removes the waiting and the second ride at the other end."] },
    ],
  },
  {
    slug: "arriving-at-suvarnabhumi-airport",
    title: "Arriving at Suvarnabhumi Airport: what to do after you land",
    excerpt: "Immigration, baggage, SIM cards, cash and finding your driver: a simple step-by-step for your first minutes in Bangkok.",
    date: "2026-09-16",
    categories: ["airport-tips", "travel-tips"],
    featured: true,
    popular: 2,
    cover: { headline: "Just landed\nat BKK?", tone: "navy" },
    route: { pickup: "Suvarnabhumi Airport (BKK)", dropoff: "Bangkok", label: "Suvarnabhumi Airport → Bangkok" },
    sections: [
      { heading: "1. Immigration", paragraphs: ["Follow the signs to passport control. Queues vary a lot with the time of day, so keep your phone on and share your flight number when you book a transfer — Waydidi's free waiting starts when your flight actually lands."] },
      { heading: "2. Baggage claim", paragraphs: ["Check the screens for your belt number. Trolleys are free to use."] },
      { heading: "3. SIM card and cash", paragraphs: ["Mobile network counters and exchange booths are in the arrivals area. Airport exchange rates can be less favourable than in the city, so change only what you need for the first day."], tip: "Want to change more money on the way? Add a currency exchange stop to your Waydidi ride." },
      { heading: "4. Meet your driver", paragraphs: ["Your confirmation shows the meeting point. Your driver holds a sign with the Meet & Greet name you entered at booking, and helps with your luggage to the car."] },
    ],
  },
  {
    slug: "ayutthaya-day-trip-private-driver",
    title: "Ayutthaya day trip from Bangkok with a private driver",
    excerpt: "Temples, river views and lunch stops at your own pace. How to plan a relaxed day in Thailand's old capital.",
    date: "2026-09-12",
    categories: ["day-trips", "itineraries"],
    featured: true,
    popular: 3,
    cover: { headline: "Ayutthaya\nin one day", photo: "/destinations/bangkok.webp", tone: "plum" },
    route: { pickup: "Bangkok", dropoff: "Ayutthaya", label: "Hourly private driver from Bangkok", service: "hourly" },
    sections: [
      { heading: "Why go with a driver?", paragraphs: ["Ayutthaya's temples are spread across a wide area. With a private driver you move between sites in air-conditioned comfort and skip waiting for tuk-tuks in the heat."] },
      { heading: "A relaxed plan", paragraphs: ["Leave Bangkok early to beat the heat, visit two or three of the main temple parks in the morning, stop for a riverside lunch, then choose one more site in the afternoon before heading back."], list: ["Morning: leave Bangkok, first temple visit", "Midday: riverside lunch", "Afternoon: one more site, then return"] },
      { heading: "How to book", paragraphs: ["Choose 'By the hour' in the search form and pick enough hours for the round trip plus your visits. Extra hours and distance are charged at the normal rate if plans change on the day."], tip: "Dress code: shoulders and knees covered at temples." },
    ],
  },
  {
    slug: "don-mueang-to-pattaya",
    title: "Don Mueang Airport (DMK) to Pattaya: how to get there",
    excerpt: "Flying a budget airline into Don Mueang? Here's how the journey to Pattaya compares with arriving at Suvarnabhumi.",
    date: "2026-09-08",
    categories: ["getting-there"],
    popular: 4,
    cover: { headline: "DMK → Pattaya", tone: "green" },
    route: { pickup: "Don Mueang Airport (DMK)", dropoff: "Pattaya", label: "Don Mueang Airport → Pattaya" },
    sections: [
      { heading: "The journey", paragraphs: ["Don Mueang is on the north side of Bangkok, so the drive to Pattaya is longer than from Suvarnabhumi and crosses the city. Allow extra time at rush hour."] },
      { heading: "Private transfer", paragraphs: ["A private transfer takes you straight from the arrivals hall to your hotel door, with a fixed price and 60 minutes of free waiting after landing."] },
    ],
  },
  {
    slug: "choosing-the-right-car",
    title: "Sedan, SUV or minivan? Choosing the right car for your group",
    excerpt: "How many suitcases really fit, when to upgrade, and why the minivan is the family favourite.",
    date: "2026-09-04",
    categories: ["travel-tips"],
    popular: 5,
    cover: { headline: "Which car\nfits your trip?", photo: "/vehicle-comfort-suv.webp", tone: "orange" },
    sections: [
      { heading: "Count bags, not just people", paragraphs: ["Each car on Waydidi shows how many passengers and bags it carries. Pick the car that fits both — a group of three with four large suitcases needs more than a sedan."], list: ["Economy sedan: up to 3 passengers, 2 bags", "Comfort BMW: up to 3 passengers, 2 bags", "Comfort SUV: up to 4 passengers, 4 bags", "Premium Minivan: up to 9 passengers, 9 bags"] },
      { heading: "Travelling with children", paragraphs: ["Add child seats with the + button next to Continue after choosing your car. Tell us the number you need and your driver will have them fitted."] },
    ],
  },
  {
    slug: "bangkok-to-hua-hin",
    title: "Bangkok to Hua Hin by private car: a stress-free beach escape",
    excerpt: "Door-to-door from your Bangkok hotel to the beach, with the option to stop on the way.",
    date: "2026-08-30",
    categories: ["getting-there", "itineraries"],
    popular: 6,
    cover: { headline: "Bangkok →\nHua Hin", photo: "/destinations/phuket.webp", tone: "navy" },
    route: { pickup: "Bangkok", dropoff: "Hua Hin", label: "Bangkok → Hua Hin" },
    sections: [
      { heading: "The drive", paragraphs: ["Hua Hin sits on the Gulf coast south-west of Bangkok. The road trip usually takes around three hours depending on traffic leaving the city."] },
      { heading: "Why private?", paragraphs: ["No transfers between buses and taxis with luggage — your driver collects you at your hotel and drops you at your resort."] },
    ],
  },
  {
    slug: "koh-chang-from-bangkok",
    title: "Getting to Koh Chang from Bangkok, ferry included",
    excerpt: "Road plus car ferry in one booking: how the Bangkok to Koh Chang transfer works.",
    date: "2026-08-24",
    categories: ["getting-there"],
    cover: { headline: "Koh Chang\nferry included", tone: "green" },
    route: { pickup: "Bangkok", dropoff: "Koh Chang", label: "Bangkok → Koh Chang" },
    sections: [
      { heading: "Road and ferry", paragraphs: ["Koh Chang is reached by driving to the Trat coast and crossing on a car ferry. On Waydidi's Bangkok ⇄ Trat and islands route, tolls and car ferry tickets are included in the price."] },
      { heading: "Plan your timing", paragraphs: ["It's a long day of travel, so an early start helps you reach the island in daylight."] },
    ],
  },
  {
    slug: "cash-or-card-in-thailand",
    title: "Cash or card? Paying for rides and more in Thailand",
    excerpt: "How to pay your transfer, what currency you're charged in, and when cash is still handy.",
    date: "2026-08-18",
    categories: ["travel-tips"],
    cover: { headline: "Cash or card?", tone: "plum" },
    sections: [
      { heading: "Paying for your Waydidi ride", paragraphs: ["Pay online by card, PromptPay, Apple Pay or Google Pay, or choose cash and pay your driver on the day. Prices can be shown in your own currency, but every booking is charged in Thai baht (THB)."] },
      { heading: "When cash helps", paragraphs: ["Street food, markets and small shops often prefer cash. Keep some small notes for tips and snacks."] },
    ],
  },
];

export const blogPost = (slug: string) => BLOG_POSTS.find((post) => post.slug === slug) ?? null;

export const readingMinutes = (post: BlogPost) =>
  Math.max(2, Math.round(postBlocks(post).map((b) => (b.type === "faq" ? b.items.map((f) => `${f.q} ${f.a}`).join(" ") : "text" in b ? b.text : "items" in b ? b.items.join(" ") : "")).join(" ").split(/\s+/).length / 200));

/** Link to the homepage search, pre-filled with an article's route. */
export function routeHref(route: NonNullable<BlogPost["route"]>) {
  const params = new URLSearchParams({ rebook: "again", service: route.service ?? "transfer", pickup: route.pickup, passengers: "2", luggage: "2", vehicle: "economy_sedan" });
  if ((route.service ?? "transfer") === "transfer") params.set("dropoff", route.dropoff);
  return `/?${params.toString()}#booking-search`;
}

// Places shown as numbered chips under "Explore more on Waydidi".
export const POPULAR_PLACES = [
  { label: "Pattaya", href: "/destinations/pattaya" },
  { label: "Suvarnabhumi Airport", href: "/airport-transfer" },
  { label: "Hua Hin", href: "/destinations/hua-hin" },
  { label: "Ayutthaya", href: "/destinations/ayutthaya" },
  { label: "Phuket", href: "/destinations/phuket" },
  { label: "Krabi", href: "/destinations/krabi" },
  { label: "Koh Chang", href: "/destinations/koh-chang" },
  { label: "Kanchanaburi", href: "/destinations/kanchanaburi" },
];
