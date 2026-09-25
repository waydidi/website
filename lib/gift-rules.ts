import type { TierId } from "./member-tier-rules";

// Badge gifts. Each badge above Bronze comes with one fixed gift, shown as an
// "almost there" teaser when the member is close and issued once they reach it.
export type GiftId = "child_seat" | "exchange_stop" | "airport_transfer";
export type Gift = { id: GiftId; name: string; description: string; emoji: string };

export const GIFTS: Record<GiftId, Gift> = {
  child_seat: { id: "child_seat", name: "Free child seat", description: "One child seat free on a booking of your choice.", emoji: "🧸" },
  exchange_stop: { id: "exchange_stop", name: "Free currency exchange stop", description: "One currency exchange stop free on a booking of your choice.", emoji: "💱" },
  airport_transfer: { id: "airport_transfer", name: "Free airport transfer", description: "A one-way private transfer to or from an airport, up to THB 1,500 off the fare.", emoji: "✈️" },
};

export const TIER_GIFTS: Partial<Record<TierId, GiftId>> = { gold: "child_seat", diamond: "exchange_stop", platinum: "airport_transfer" };
export const GIFT_VALID_DAYS = 90;
export const FREE_TRANSFER_CODE = "FREERIDE";
export const FREE_TRANSFER_CAP = 1500;

/** Close to the next badge: 1 ride away, or within 20% of its spend. */
export function nearNextTier(status: { next: { spend: number } | null; ridesToNext: number; spendToNext: number }) {
  return Boolean(status.next && (status.ridesToNext <= 1 || status.spendToNext <= status.next.spend * 0.2));
}

export function freeTransferDiscount(fare: number) {
  return Math.max(0, Math.min(fare, FREE_TRANSFER_CAP));
}

/**
 * Add-ons free on a booking: the tier's own extras first, then one child-seat and
 * one exchange-stop gift voucher if the member holds them and still needs them.
 */
export function freeAddonsWithGifts(tierFree: { childSeats: number; exchangeStop: boolean }, childSeats: number, exchangeStop: boolean, vouchers: { childSeat: boolean; exchangeStop: boolean }) {
  const seatGift = vouchers.childSeat && childSeats > tierFree.childSeats;
  const exchangeGift = vouchers.exchangeStop && exchangeStop && !tierFree.exchangeStop;
  return {
    childSeats: tierFree.childSeats + (seatGift ? 1 : 0),
    exchangeStop: tierFree.exchangeStop || exchangeGift,
    usedGifts: [...(seatGift ? ["child_seat" as const] : []), ...(exchangeGift ? ["exchange_stop" as const] : [])],
  };
}
