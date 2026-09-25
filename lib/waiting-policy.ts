// Free waiting time included with every ride. Airport pickups wait from the
// flight's actual landing time, so delays never cost the customer.
export const AIRPORT_FREE_WAIT_MINUTES = 60;
export const STANDARD_FREE_WAIT_MINUTES = 15;

export function isAirportPickup(pickup: string) {
  return /airport|\b(BKK|DMK|HKT|CNX|USM|KBV|CEI|UTP)\b|สนามบิน|机场/i.test(pickup);
}

type Lang = "en" | "th" | "zh";
const TEXT: Record<Lang, { airport: string; standard: string }> = {
  en: { airport: `${AIRPORT_FREE_WAIT_MINUTES} minutes free waiting after landing`, standard: `${STANDARD_FREE_WAIT_MINUTES} minutes free waiting at pickup` },
  th: { airport: `รอฟรี ${AIRPORT_FREE_WAIT_MINUTES} นาทีหลังเครื่องลงจอด`, standard: `รอฟรี ${STANDARD_FREE_WAIT_MINUTES} นาทีที่จุดรับ` },
  zh: { airport: `航班落地后免费等候 ${AIRPORT_FREE_WAIT_MINUTES} 分钟`, standard: `上车点免费等候 ${STANDARD_FREE_WAIT_MINUTES} 分钟` },
};

export function waitingLine(pickup: string, locale = "en") {
  const text = TEXT[(locale in TEXT ? locale : "en") as Lang];
  return isAirportPickup(pickup) ? text.airport : text.standard;
}
