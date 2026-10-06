// Thailand-only flight data shared by the flight status page and its API (steps 2–6).

export const THAI_AIRPORTS = [
  { code: "BKK", name: "Suvarnabhumi Airport", city: "Bangkok" },
  { code: "DMK", name: "Don Mueang International Airport", city: "Bangkok" },
  { code: "HKT", name: "Phuket International Airport", city: "Phuket" },
  { code: "CNX", name: "Chiang Mai International Airport", city: "Chiang Mai" },
  { code: "USM", name: "Samui International Airport", city: "Koh Samui" },
  { code: "KBV", name: "Krabi International Airport", city: "Krabi" },
  { code: "HDY", name: "Hat Yai International Airport", city: "Hat Yai" },
  { code: "CEI", name: "Mae Fah Luang–Chiang Rai International Airport", city: "Chiang Rai" },
  { code: "UTP", name: "U-Tapao Rayong–Pattaya International Airport", city: "Pattaya" },
  { code: "TDX", name: "Trat Airport", city: "Trat (Koh Chang)" },
  { code: "UTH", name: "Udon Thani International Airport", city: "Udon Thani" },
  { code: "KKC", name: "Khon Kaen Airport", city: "Khon Kaen" },
  { code: "URT", name: "Surat Thani International Airport", city: "Surat Thani" },
  { code: "NST", name: "Nakhon Si Thammarat Airport", city: "Nakhon Si Thammarat" },
  { code: "UBP", name: "Ubon Ratchathani Airport", city: "Ubon Ratchathani" },
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
