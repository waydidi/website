// Which Waydidi hourly city a typed address mentions, used to spot city-to-city
// trips when Google Maps can't place the address. Null when no city is named.
const CITY_WORDS: [string, RegExp][] = [
  ["bangkok", /bangkok|suvarnabhumi|\bbkk\b|don\s*mueang|\bdmk\b|sukhumvit|silom|sathorn|siam|khao\s*san|กรุงเทพ|สุวรรณภูมิ|ดอนเมือง/i],
  ["pattaya", /pattaya|jomtien|naklua|bang\s*lamung|พัทยา|จอมเทียน|นาเกลือ|บางละมุง/i],
  ["koh-chang", /ko(h)?\s*chang|เกาะช้าง/i],
  ["kanchanaburi", /kanchanaburi|erawan|sai\s*yok|river\s*kwai|กาญจนบุรี/i],
  ["hua-hin", /hua\s*hin|cha[\s-]*am|pran\s*buri|หัวหิน|ชะอำ|ปราณบุรี/i],
  ["chiang-mai", /chiang\s*mai|เชียงใหม่/i],
  ["phuket", /phuket|patong|kata|karon|ภูเก็ต|ป่าตอง/i],
  ["krabi", /krabi|ao\s*nang|กระบี่|อ่าวนาง/i],
  ["ayutthaya", /ayutthaya|อยุธยา/i],
  ["rayong", /rayong|ระยอง/i],
  ["phang-nga", /phang[\s-]*nga|khao\s*lak|nam\s*khem|takua\s*pa|พังงา|เขาหลัก|น้ำเค็ม/i],
];

export function cityOfText(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  return CITY_WORDS.find(([, re]) => re.test(text))?.[0] ?? null;
}

/** True when the typed pickup or drop-off clearly names a different city than the chosen area. */
export function typedCityToCity(area: string, pickup: string, dropoff?: string | null) {
  const a = cityOfText(pickup), b = cityOfText(dropoff);
  return Boolean((a && a !== area) || (b && b !== area));
}
