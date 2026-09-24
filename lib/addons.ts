// Additional services chosen from the "+" (Add-ons) sheet, priced in THB per booking.
export const CHILD_SEAT_THB = 300;
export const EXCHANGE_STOP_THB = 200;

export function addonsTotal(childSeats: number, exchangeStop: boolean) {
  return Math.max(0, Math.floor(childSeats)) * CHILD_SEAT_THB + (exchangeStop ? EXCHANGE_STOP_THB : 0);
}
