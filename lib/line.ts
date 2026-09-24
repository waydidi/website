import { env } from "cloudflare:workers";
import { thaiBank } from "@/lib/thai-banks";

type TripLineInput = {
  eventId: string;
  reference: string;
  driverName: string;
  customerName: string;
  pickup: string;
  dropoff: string;
  pickupDate: string;
  pickupTime: string;
  vehicle: string;
};

const siteUrl = () => (env.WAYDIDI_PUBLIC_URL || "https://waydidi-private-transfer.dankbangkok.chatgpt.site").replace(/\/$/u, "");

async function pushLine(messages: unknown[]) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !env.LINE_ADMIN_TARGET_ID) return { status: "pending_configuration" as const };
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: env.LINE_ADMIN_TARGET_ID, messages }),
  });
  if (!response.ok) throw new Error(`LINE push failed (${response.status})`);
  return { status: "sent" as const };
}

type LineTripStatus = "going_to_standby" | "standby" | "passenger_verified" | "trip_started" | "completed" | "no_show";

const TRIP_STATUS_HEADLINE: Record<Exclude<LineTripStatus, "completed">, string> = {
  going_to_standby: "🚗 คนขับกำลังไปจุดรับ",
  standby: "🚘 คนขับรอที่จุดรับแล้ว",
  passenger_verified: "🔑 ยืนยัน Trip PIN แล้ว",
  trip_started: "🛣️ เริ่มการเดินทางแล้ว",
  no_show: "🚨 คนขับแจ้งไม่พบผู้โดยสาร (No-show) — ต้องตรวจสอบ",
};

export async function notifyLineTripStatus(input: TripLineInput & { detail?: string }, status: LineTripStatus) {
  const journeyUrl = `${siteUrl()}/admin/journeys/${encodeURIComponent(input.reference)}`;
  if (status !== "completed") {
    const lines = [TRIP_STATUS_HEADLINE[status], input.reference, `คนขับ: ${input.driverName}`, `ลูกค้า: ${input.customerName}`, `จุดรับ: ${input.pickup}`, `เวลา: ${input.pickupDate} ${input.pickupTime}`];
    if (input.detail) lines.push(input.detail);
    lines.push(journeyUrl);
    return pushLine([{ type: "text", text: lines.join("\n") }]);
  }
  return pushLine([{
    type: "flex",
    altText: `รอตรวจสอบการส่งลูกค้า ${input.reference}`,
    contents: {
      type: "bubble",
      header: { type: "box", layout: "vertical", backgroundColor: "#FF8A05", paddingAll: "20px", contents: [
        { type: "text", text: "WAYDIDI · DROP-OFF", color: "#FFFFFFCC", size: "xs", weight: "bold" },
        { type: "text", text: input.reference, color: "#FFFFFF", size: "xl", weight: "bold", margin: "sm" },
      ] },
      body: { type: "box", layout: "vertical", spacing: "md", contents: [
        row("คนขับ", input.driverName), row("ลูกค้า", input.customerName), row("รถ", input.vehicle),
        row("รับ", input.pickup), row("ส่ง", input.dropoff), row("วันและเวลา", `${input.pickupDate} ${input.pickupTime}`),
      ] },
      footer: { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "button", style: "primary", color: "#FF8A05", action: { type: "postback", label: "ปิดงาน", data: `action=complete_trip&event=${input.eventId}`, displayText: `ปิดงาน ${input.reference}` } },
        { type: "button", style: "link", action: { type: "uri", label: "ดูรายละเอียด", uri: journeyUrl } },
      ] },
    },
  }]);
}

/** A problem on a live trip, pushed to operations once when first detected. */
export async function notifyLineOperationsAlert(input: { reference: string; title: string; details: string; severity: "warning" | "critical" }) {
  const journeyUrl = `${siteUrl()}/admin/journeys/${encodeURIComponent(input.reference)}`;
  const icon = input.severity === "critical" ? "🚨" : "⚠️";
  return pushLine([{ type: "text", text: `${icon} ${input.title}\n${input.reference}\n${input.details}\n${journeyUrl}` }]);
}

function row(label: string, value: string) {
  return { type: "box", layout: "vertical", spacing: "xs", contents: [
    { type: "text", text: label, size: "xs", color: "#8A94A6", weight: "bold" },
    { type: "text", text: value, size: "sm", color: "#211726", wrap: true, weight: "bold" },
  ] };
}

export async function notifyLineDriverPayment(input: { reference: string; driverName: string; bankCode: string; bankAccountNumber: string }) {
  const bank = thaiBank(input.bankCode);
  return pushLine([{ type: "text", text: `✅ ปิดงานเรียบร้อย\n${input.reference}\n\n💳 ข้อมูลชำระเงินคนขับ\nชื่อ: ${input.driverName}\nธนาคาร: ${bank?.thai || input.bankCode}\nเลขบัญชี: ${input.bankAccountNumber}` }]);
}

export async function verifyLineSignature(raw: string, signature: string) {
  if (!env.LINE_CHANNEL_SECRET || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.LINE_CHANNEL_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  let binary = ""; for (const byte of signed) binary += String.fromCharCode(byte);
  const expected = btoa(binary);
  if (expected.length !== signature.length) return false;
  let difference = 0; for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  return difference === 0;
}
