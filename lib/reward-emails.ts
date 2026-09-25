import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, customerBookingLinks, customers, memberRewardEmails } from "@/db/schema";
import { listMemberBoxes } from "@/lib/boxes";
import { sendRewardEmail } from "@/lib/email";
import { GIFTS, listMemberGifts, nearNextTier, TIER_GIFTS } from "@/lib/gifts";
import { memberTierStatus } from "@/lib/member-tier";

const DAY = 864e5;
const PER_RUN = 60;

// Sends each reward email once (keyed), for members with completed rides in the last year:
// "almost at the next badge" (marketing opt-in only), "new badge: open your mystery box", "gift expires in 14 days".
export async function sendRewardEmails(at = new Date()) {
  const db = getDb();
  const since = new Date(at.getTime() - 365 * DAY).toISOString().slice(0, 10);
  const members = await db.selectDistinct({ id: customers.id, email: customers.email, name: customers.name, marketing: customers.marketingOptIn }).from(customers)
    .innerJoin(customerBookingLinks, eq(customerBookingLinks.customerId, customers.id))
    .innerJoin(bookings, eq(bookings.reference, customerBookingLinks.bookingReference))
    .where(and(eq(bookings.status, "completed"), gte(bookings.pickupDate, since)))
    .orderBy(sql`random()`).limit(PER_RUN);
  let sent = 0;
  const year = at.getUTCFullYear();

  async function once(customerId: string, key: string, kind: string, send: () => Promise<{ status: string }>) {
    const stamp = at.toISOString();
    const claimed = await db.insert(memberRewardEmails).values({ dedupeKey: key, customerId, kind, status: "processing", createdAt: stamp }).onConflictDoNothing().returning({ key: memberRewardEmails.dedupeKey });
    if (!claimed.length) return;
    const result = await send().catch(() => ({ status: "failed" }));
    await db.update(memberRewardEmails).set({ status: result.status === "sent" ? "sent" : "failed" }).where(eq(memberRewardEmails.dedupeKey, key));
    if (result.status === "sent") sent += 1;
  }

  for (const m of members) {
    const hi = `Hi ${m.name || "there"},`;
    const status = await memberTierStatus(m.id).catch(() => null);
    if (!status) continue;
    const gifts = await listMemberGifts(m.id).catch(() => []); // also issues new gifts and boxes
    const boxes = await listMemberBoxes(m.id).catch(() => []);

    for (const box of boxes.filter((b) => !b.openedAt)) {
      const name = box.tier[0].toUpperCase() + box.tier.slice(1);
      await once(m.id, `box:${box.id}`, "badge", () => sendRewardEmail({ to: m.email, kicker: "New badge", title: `You're now a ${name} member 🎉`, intro: `${hi} thanks for riding with Waydidi. Your ${name} badge comes with a gift and a mystery box. Open it to see what you won.`, cta: "Open my mystery box", path: "/account/coupons", tag: `reward-box-${box.id}` }));
    }
    // The nudge is promotional, so only for members who opted in to offers.
    if (m.marketing && status.next && nearNextTier(status)) {
      const gift = TIER_GIFTS[status.next.id];
      const left = status.ridesToNext <= 1 ? "1 more ride" : `THB ${status.spendToNext.toLocaleString("en-US")} more`;
      await once(m.id, `near:${status.next.id}:${year}`, "near", () => sendRewardEmail({ to: m.email, kicker: "Almost there", title: `${left} to ${status.next!.name}`, intro: `${hi} you're close to your ${status.next!.name} badge: ${status.next!.percent}% off every ride${gift ? `, plus a ${GIFTS[gift].name.toLowerCase()} and a mystery box` : ""}.`, cta: "Book a ride", path: "/#booking-search", tag: `reward-near-${m.id}-${status.next!.id}` }));
    }
    for (const g of gifts.filter((x) => x.status === "available" && new Date(x.expiresAt).getTime() - at.getTime() < 14 * DAY)) {
      await once(m.id, `expiry:${g.id}`, "expiry", () => sendRewardEmail({ to: m.email, kicker: "Gift expiring", title: `Your ${g.name.toLowerCase()} expires soon`, intro: `${hi} your ${g.name.toLowerCase()} expires on ${new Date(g.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. It's applied automatically when you book signed in.`, cta: "Use it now", path: "/#booking-search", tag: `reward-expiry-${g.id}` }));
    }
  }
  return sent;
}
