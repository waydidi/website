// "Today" and "tomorrow" job lists for the Telegram Admin group (lib/telegram/daily-jobs.ts sends them).
// Pure: no database, network or runtime imports, so the timing and the wording are unit tested directly.
// Staff-facing text is Thai.

export type DailySlot = "today" | "tomorrow";
export type DailyJob = {
  time: string; reference: string; leg: "outbound" | "return"; from: string; to: string;
  vehicleName: string; passengers: number; driver: string | null; payment: "paid" | "cash" | "unpaid";
};

/** Thailand time (UTC+7, no daylight saving). */
const bangkok = (at: Date) => new Date(at.getTime() + 7 * 3600_000);

/**
 * Which lists are due at this moment: today's from 07:00 until noon (Bangkok time), tomorrow's from 18:00 until
 * midnight. A list is sent once (the sender keeps a mark per date and slot); the window lets a missed minute catch up.
 */
export function dailyJobsDue(at: Date): { slot: DailySlot; date: string }[] {
  const b = bangkok(at), hour = b.getUTCHours(), today = b.toISOString().slice(0, 10);
  if (hour >= 7 && hour < 12) return [{ slot: "today", date: today }];
  if (hour >= 18) return [{ slot: "tomorrow", date: new Date(b.getTime() + 86_400_000).toISOString().slice(0, 10) }];
  return [];
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const place = (t: string) => esc((t.split(",")[0] ?? t).trim().slice(0, 60));
const thaiDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const PAYMENT = { paid: "✅ จ่ายแล้ว", cash: "💵 เก็บเงินสด", unpaid: "⏳ ยังไม่ชำระ" } as const;
const MAX_CHARS = 3800; // Telegram allows 4,096 characters a message

/** One line per job, earliest first: time · reference · from → to, then car · people · driver · payment. */
export function jobLine(j: DailyJob): string {
  return `<b>${esc(j.time)}</b> · ${esc(j.reference)}${j.leg === "return" ? " (ขากลับ)" : ""} · ${place(j.from)} → ${place(j.to)}\n`
    + `    🚗 ${esc(j.vehicleName)} · ${j.passengers} คน · ${j.driver ? `👤 ${esc(j.driver)}` : "⚠️ ยังไม่มีคนขับ"} · ${PAYMENT[j.payment]}`;
}

/** The message(s) for one list: a header with the count and missing drivers, the jobs, and the Admin link. Split to fit Telegram. */
export function dailyJobsMessages(slot: DailySlot, date: string, jobs: DailyJob[], adminUrl: string): string[] {
  const title = `📋 <b>${slot === "today" ? "งานวันนี้" : "งานพรุ่งนี้"}</b> · ${thaiDate(date)}`;
  if (!jobs.length) return [`${title}\nไม่มีงาน`];
  const sorted = [...jobs].sort((a, b) => a.time.localeCompare(b.time) || a.reference.localeCompare(b.reference));
  const noDriver = sorted.filter((j) => !j.driver).length;
  const header = `${title} · ${sorted.length} งาน${noDriver ? `\n⚠️ ยังไม่มีคนขับ ${noDriver} งาน` : ""}`;
  const footer = `🔗 ${esc(adminUrl)}`;
  const messages: string[] = [];
  let current = header;
  for (const line of sorted.map(jobLine)) {
    if (current.length + line.length + 2 > MAX_CHARS) { messages.push(current); current = `${title} (ต่อ)`; }
    current += `\n\n${line}`;
  }
  messages.push(`${current}\n\n${footer}`);
  return messages;
}
