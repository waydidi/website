import { env } from "cloudflare:workers";
import { maskAccount } from "@/lib/driver-bank-rules";
import { thaiBank } from "@/lib/thai-banks";
import { esc } from "./cards";
import { sendCard, telegramConfigured } from "./client";

// The driver's bank details, sent to the team (Admin) group when the driver submits them on the trip link
// after the Drop, so the owner can pay. The group is private to the owner; the number is never logged.
// A different account from the one saved before is flagged with the old one partly hidden.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

export type SavedAccount = { bankCode: string; accountNumber: string };

export async function postDriverBankDetails(input: { reference: string; driverName: string; bankCode: string; accountNumber: string; accountName: string; previous: SavedAccount | null }) {
  if (!telegramConfigured()) return;
  const card = await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(input.reference).first<{ telegram_message_id: number }>().catch(() => null);
  const bank = thaiBank(input.bankCode);
  const lines = [
    `💳 <b>ข้อมูลบัญชีคนขับ</b> · ${esc(input.reference)}`,
    `คนขับ: ${esc(input.driverName)}`,
    `ธนาคาร: ${esc(bank?.thai ?? input.bankCode)}`,
    `เลขบัญชี: <code>${esc(input.accountNumber)}</code>`,
    `ชื่อบัญชี: ${esc(input.accountName)}`,
    ...(input.previous ? ["", `⚠️ เปลี่ยนจากบัญชีเดิม: ${esc(thaiBank(input.previous.bankCode)?.thai ?? input.previous.bankCode)} ${esc(maskAccount(input.previous.accountNumber))} — ตรวจสอบก่อนโอนเงิน`] : []),
  ];
  await sendCard(lines.join("\n"), undefined, card?.telegram_message_id || undefined);
}
