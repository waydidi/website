// Additional services chosen from the "+" (Add-ons) sheet, priced in THB per booking.
export const CHILD_SEAT_THB = 300;
export const EXCHANGE_STOP_THB = 200;
/** Ferry & hotel transfer (Koh Kood, Koh Mak): per passenger. */
export const FERRY_HOTEL_THB = 600;

/** `free` holds add-ons given free by the member's tier (Diamond / Platinum). */
export function addonsTotal(childSeats: number, exchangeStop: boolean, free?: { childSeats: number; exchangeStop: boolean }, ferryHotelPeople = 0) {
  const seats = Math.max(0, Math.floor(childSeats) - (free?.childSeats ?? 0));
  return seats * CHILD_SEAT_THB + (exchangeStop && !free?.exchangeStop ? EXCHANGE_STOP_THB : 0) + Math.max(0, Math.floor(ferryHotelPeople)) * FERRY_HOTEL_THB;
}
