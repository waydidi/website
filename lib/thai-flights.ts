// Thailand-only flight data shared by the flight status page and its API (steps 2–6).

export const THAI_AIRPORTS = [
  { code: "BKK", name: "Suvarnabhumi Airport", city: "Bangkok", lat: 13.69, lon: 100.75 },
  { code: "DMK", name: "Don Mueang International Airport", city: "Bangkok", lat: 13.913, lon: 100.607 },
  { code: "HKT", name: "Phuket International Airport", city: "Phuket", lat: 8.113, lon: 98.317 },
  { code: "CNX", name: "Chiang Mai International Airport", city: "Chiang Mai", lat: 18.767, lon: 98.963 },
  { code: "USM", name: "Samui International Airport", city: "Koh Samui", lat: 9.548, lon: 100.062 },
  { code: "KBV", name: "Krabi International Airport", city: "Krabi", lat: 8.099, lon: 98.986 },
  { code: "HDY", name: "Hat Yai International Airport", city: "Hat Yai", lat: 6.933, lon: 100.393 },
  { code: "CEI", name: "Mae Fah Luang–Chiang Rai International Airport", city: "Chiang Rai", lat: 19.952, lon: 99.883 },
  { code: "UTP", name: "U-Tapao Rayong–Pattaya International Airport", city: "Pattaya", lat: 12.68, lon: 101.005 },
  { code: "TDX", name: "Trat Airport", city: "Trat (Koh Chang)", lat: 12.274, lon: 102.319 },
  { code: "UTH", name: "Udon Thani International Airport", city: "Udon Thani", lat: 17.386, lon: 102.788 },
  { code: "KKC", name: "Khon Kaen Airport", city: "Khon Kaen", lat: 16.466, lon: 102.784 },
  { code: "URT", name: "Surat Thani International Airport", city: "Surat Thani", lat: 9.135, lon: 99.136 },
  { code: "NST", name: "Nakhon Si Thammarat Airport", city: "Nakhon Si Thammarat", lat: 8.54, lon: 99.945 },
  { code: "UBP", name: "Ubon Ratchathani Airport", city: "Ubon Ratchathani", lat: 15.251, lon: 104.87 },
] as const;

export const THAI_AIRLINES = [
  { code: "TG", name: "Thai Airways" },
  { code: "FD", name: "Thai AirAsia" },
  { code: "SL", name: "Thai Lion Air" },
  { code: "DD", name: "Nok Air" },
  { code: "PG", name: "Bangkok Airways" },
  { code: "VZ", name: "Thai Vietjet" },
  { code: "XJ", name: "Thai AirAsia X" },
] as const;

export const POPULAR_ROUTES = [
  ["BKK", "HKT"], ["DMK", "CNX"], ["BKK", "USM"], ["DMK", "KBV"], ["DMK", "HDY"], ["BKK", "CEI"], ["DMK", "UTH"], ["BKK", "TDX"],
] as const;

export const airportByCode = (code: string) => THAI_AIRPORTS.find((a) => a.code === code);
/** True when a flight starts or ends in Thailand (the only flights this site checks). */
export const touchesThailand = (from?: string | null, to?: string | null) => Boolean((from && airportByCode(from)) || (to && airportByCode(to)));
/** "tg 103" → "TG103"; null when it doesn't look like a flight number. */
export function cleanFlightNumber(v: string) {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(s) ? s : null;
}

/** Common airports with flights to and from Thailand (route search suggestions; any 3-letter code works). */
export const WORLD_AIRPORTS = [
  ["SIN", "Singapore"], ["KUL", "Kuala Lumpur"], ["HKG", "Hong Kong"], ["TPE", "Taipei"], ["ICN", "Seoul Incheon"], ["NRT", "Tokyo Narita"], ["HND", "Tokyo Haneda"], ["KIX", "Osaka Kansai"],
  ["PVG", "Shanghai Pudong"], ["PEK", "Beijing Capital"], ["PKX", "Beijing Daxing"], ["CAN", "Guangzhou"], ["SZX", "Shenzhen"], ["CTU", "Chengdu"], ["KMG", "Kunming"],
  ["SGN", "Ho Chi Minh City"], ["HAN", "Hanoi"], ["DAD", "Da Nang"], ["MNL", "Manila"], ["CGK", "Jakarta"], ["DPS", "Bali Denpasar"], ["RGN", "Yangon"], ["PNH", "Phnom Penh"], ["KTI", "Siem Reap"], ["VTE", "Vientiane"], ["LPQ", "Luang Prabang"],
  ["DEL", "Delhi"], ["BOM", "Mumbai"], ["BLR", "Bengaluru"], ["CCU", "Kolkata"], ["CMB", "Colombo"], ["KTM", "Kathmandu"], ["DAC", "Dhaka"],
  ["DXB", "Dubai"], ["DOH", "Doha"], ["AUH", "Abu Dhabi"], ["IST", "Istanbul"], ["LHR", "London Heathrow"], ["CDG", "Paris"], ["FRA", "Frankfurt"], ["MUC", "Munich"], ["ZRH", "Zurich"], ["AMS", "Amsterdam"], ["CPH", "Copenhagen"], ["ARN", "Stockholm"], ["HEL", "Helsinki"],
  ["SYD", "Sydney"], ["MEL", "Melbourne"], ["PER", "Perth"], ["BNE", "Brisbane"], ["AKL", "Auckland"], ["LAX", "Los Angeles"], ["SFO", "San Francisco"],
] as const;
export const airportLabel = (code: string) => airportByCode(code)?.city ?? WORLD_AIRPORTS.find(([c]) => c === code)?.[1] ?? code;
/** "phuket", "hkt", "Singapore" → airport code; null when nothing matches. */
export function findAirport(text: string) {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const all: [string, string, string][] = [...THAI_AIRPORTS.map((a) => [a.code, a.city, a.name] as [string, string, string]), ...WORLD_AIRPORTS.map(([c, n]) => [c, n, n] as [string, string, string])];
  return (all.find(([c]) => c.toLowerCase() === t) ?? all.find(([, city, name]) => city.toLowerCase().startsWith(t) || name.toLowerCase().startsWith(t))
    ?? all.find(([, city, name]) => city.toLowerCase().includes(t) || name.toLowerCase().includes(t)))?.[0] ?? (/^[a-z]{3}$/.test(t) ? t.toUpperCase() : null);
}
