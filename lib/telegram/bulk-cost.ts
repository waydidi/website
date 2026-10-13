import { env } from "cloudflare:workers";
import { esc } from "./cards";
import { sendCard } from "./client";
import { notifyBookingTelegram, refreshBookingCard } from "./bookings";
import { postAssignmentWhenReady, saveDriverCost } from "./booking-tasks";
import { driverGroup } from "./driver-group";
import type { BulkCost } from "./bulk-cost-rules";

// "ราคา" + one "REF cost" per line in the team group: every cost is saved as if set with the card's
// Set cost button, and each booking that still needs a driver goes to the driver group straight away.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

export async function setCostsFromMessage(bulk: BulkCost, adminName: string, replyTo: number) {
  type Row = { reference: string; status: string; pickup_date: string; pickup_time: string };
  const found: (Row & { cost: number })[] = [], missing: string[] = [];
  for (const item of bulk.items) {
    const b = await db().prepare("SELECT reference,status,pickup_date,pickup_time FROM bookings WHERE reference=?").bind(item.reference).first<Row>();
    if (b?.status === "confirmed") found.push({ ...b, cost: item.cost }); else missing.push(item.reference);
  }
  // Earliest pickup first, so the driver group sees the jobs in date order.
  found.sort((a, b) => `${a.pickup_date} ${a.pickup_time}`.localeCompare(`${b.pickup_date} ${b.pickup_time}`));
  const lines: string[] = [];
  for (const b of found) {
    // A booking whose team card was never posted gets one first (the cost lives on that card).
    await notifyBookingTelegram(b.reference).catch(() => undefined);
    const card = await db().prepare("SELECT 1 x FROM telegram_booking_cards WHERE booking_reference=?").bind(b.reference).first();
    if (!card) { missing.push(b.reference); continue; }
    await saveDriverCost(b.reference, b.cost, adminName);
    // Setting the cost is taking the booking, as with Assign to me.
    await db().prepare("UPDATE telegram_booking_cards SET acknowledged_by=? WHERE booking_reference=? AND acknowledged_by IS NULL").bind(adminName, b.reference).first().catch(() => undefined);
    await postAssignmentWhenReady(b.reference, adminName).catch(() => false);
    await refreshBookingCard(b.reference); // also posts the driver group offer
    const offer = driverGroup() ? await db().prepare("SELECT status FROM telegram_driver_jobs WHERE booking_reference=?").bind(b.reference).first<{ status: string }>().catch(() => null) : null;
    const note = !driverGroup() ? "" : offer?.status === "open" ? " · ส่งเข้ากลุ่มคนขับแล้ว" : offer?.status === "taken" ? " · มีคนขับรับแล้ว" : " · ไม่ได้ส่งกลุ่มคนขับ (มีคนขับแล้วหรือเลยเวลา)";
    lines.push(`✓ <b>${esc(b.reference)}</b> ${b.cost.toLocaleString("en-US")} บาท${note}`);
  }
  for (const ref of missing) lines.push(`✗ <b>${esc(ref)}</b> ไม่พบการจองที่ยืนยันแล้ว`);
  for (const bad of bulk.invalid) lines.push(`✗ อ่านไม่ได้: ${esc(bad)}`);
  if (!lines.length) lines.push("พิมพ์ «ราคา» แล้วตามด้วย รหัสการจอง และราคา บรรทัดละงาน เช่น\nราคา\nFMBNUW 1800\n52LLDS 2200");
  await sendCard([`<b>ตั้งราคาค่างาน</b> · ${esc(adminName)}`, ...lines].join("\n"), undefined, replyTo);
}
