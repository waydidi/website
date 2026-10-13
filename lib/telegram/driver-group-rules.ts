// Pure rules for the Telegram driver group: the Thai job offer, the sign-up link, and the
// one-time sign-up questions a driver answers in their private chat with the bot.
// No runtime imports, so every rule is unit tested directly (tests/telegram-driver-group.test.mjs).

export type DriverGroupConfig = { chatId: string };

/** On only when the owner turns it on and gives the driver group's ID (never the team group). */
export function driverGroupConfig(env: Record<string, unknown>): DriverGroupConfig | null {
  const chatId = String(env.TELEGRAM_DRIVER_CHAT_ID ?? "").trim();
  if (env.TELEGRAM_DRIVER_JOBS !== "1" || !/^-?\d{5,20}$/.test(chatId)) return null;
  if (chatId === String(env.TELEGRAM_CHAT_ID ?? "").trim()) return null;
  return { chatId };
}

/** A first-time driver who tapped Assign has this long to send their details, then the job is offered again. */
export const SIGNUP_MINUTES = 30;
const REFERENCE = /^[A-Z0-9-]{4,24}$/;

/** "/start reg_FMBNUW" (the link that opens the sign-up after tapping Assign) → "FMBNUW". */
export function parseSignupStart(text: string) {
  const m = text.trim().match(/^\/start\s+reg_([A-Za-z0-9-]{4,24})$/);
  const reference = m?.[1].toUpperCase();
  return reference && REFERENCE.test(reference) ? reference : null;
}

export const signupLink = (botUsername: string, reference: string) => `https://t.me/${botUsername}?start=reg_${encodeURIComponent(reference)}`;

export const isMyJobsCommand = (text: string) => /^(งานของฉัน|\/myjobs(@\w+)?|\/jobs(@\w+)?)$/i.test(text.trim());

const escHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const thaiDate = (date: string | null, time: string | null) => {
  if (!date) return "-";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}${time ? ` ${time}` : ""}`;
};

export type OfferJob = {
  reference: string; vehicleName: string; pickupDate: string; pickupTime: string; pickup: string; dropoff: string;
  serviceType: string | null; bookedHours: number | null; passengers: number; luggage: number;
  returnDate: string | null; returnTime: string | null;
  driverCost: number | null; paymentMethod: string; paymentStatus: string; cashDue: number;
};
export type OfferState = { kind: "open" } | { kind: "taken"; driverName: string; plate: string | null } | { kind: "signing_up"; name: string } | { kind: "closed"; reason: "cancelled" | "past" | "assigned" };

/** The job as the driver group sees it: no customer name, phone or flight. Thai only. */
export function offerText(job: OfferJob, state: OfferState) {
  const hourly = job.serviceType === "hourly";
  const payment = job.paymentMethod === "cash"
    ? (job.cashDue > 0 ? `เก็บเงินสด ${job.cashDue.toLocaleString("en-US")} บาท` : "เก็บเงินสดแล้ว")
    : job.paymentMethod === "transfer" && job.paymentStatus !== "paid" ? "ลูกค้าโอนก่อนเดินทาง — ไม่ต้องเก็บเงินสด" : "ชำระแล้ว — ไม่ต้องเก็บเงิน";
  const lines = [
    `${state.kind === "open" ? "🚗 งานใหม่" : "🚗 งาน"} · <b>${escHtml(job.reference)}</b>`,
    `รถ: ${escHtml(job.vehicleName)}`,
    `วันที่/เวลา: ${escHtml(thaiDate(job.pickupDate, job.pickupTime))}`,
    `รับ: ${escHtml(job.pickup)}`,
    hourly ? `ระยะเวลา: ${escHtml(job.bookedHours ?? "-")} ชั่วโมง` : `ส่ง: ${escHtml(job.dropoff)}`,
    `จำนวน: ${job.passengers} คน, ${job.luggage} กระเป๋า`,
    ...(job.returnDate ? [`ขากลับ: ${escHtml(thaiDate(job.returnDate, job.returnTime))}`] : []),
    `ค่างาน: ${job.driverCost ? `${job.driverCost.toLocaleString("en-US")} บาท` : "รอแจ้งราคา"}`,
    `การชำระ: ${payment}`,
  ];
  if (state.kind === "taken") lines.push("", `✅ รับงานแล้ว: ${escHtml(state.driverName)}${state.plate ? ` · ${escHtml(state.plate)}` : ""}`);
  if (state.kind === "signing_up") lines.push("", `✅ รับงานแล้ว: ${escHtml(state.name)} (กำลังกรอกข้อมูลคนขับ)`);
  if (state.kind === "closed") lines.push("", state.reason === "cancelled" ? "❌ งานนี้ถูกยกเลิก" : state.reason === "past" ? "⏱ เลยเวลารับงานแล้ว" : "✅ มีคนขับแล้ว");
  if (state.kind === "open") lines.push("", "คนแรกที่กด «รับงาน» ได้งานนี้");
  return lines.join("\n");
}

// The first-time questions, asked one at a time in the private chat.
export type FormStep = "name" | "phone" | "plate" | "model" | "car_type" | "id_photo" | "car_photo";
export const FORM_STEPS: FormStep[] = ["name", "phone", "plate", "model", "car_type", "id_photo", "car_photo"];
export const STEP_QUESTION: Record<FormStep, string> = {
  name: "ชื่อ-นามสกุลคนขับ",
  phone: "เบอร์โทรศัพท์",
  plate: "ทะเบียนรถ (เช่น กข 1234)",
  model: "ยี่ห้อ/รุ่นรถ และสี (เช่น Toyota Commuter สีเงิน)",
  car_type: "ประเภทรถ",
  id_photo: "ส่งรูปใบขับขี่หรือบัตรประชาชน",
  car_photo: "ส่งรูปรถ (เห็นทะเบียน)",
};
export const CAR_TYPES = { sedan: "รถเก๋ง", suv: "SUV 7 ที่นั่ง", minivan: "รถตู้" } as const;
export type CarType = keyof typeof CAR_TYPES;
export const isCarType = (v: unknown): v is CarType => typeof v === "string" && v in CAR_TYPES;

export type DriverDraft = { name?: string; phone?: string; plate?: string; model?: string; carType?: CarType; idPhoto?: boolean; carPhoto?: boolean };

/** Checks one typed answer; returns the cleaned value or a Thai error to show. */
export function checkTextAnswer(step: FormStep, raw: string): { value: string } | { error: string } {
  const value = raw.trim().replace(/\s+/g, " ");
  if (step === "name") return value.length >= 3 && value.length <= 100 ? { value } : { error: "กรุณาพิมพ์ชื่อ-นามสกุล" };
  if (step === "phone") return /^[+0-9() .-]{9,20}$/.test(value) && value.replace(/\D/g, "").length >= 9 ? { value } : { error: "กรุณาพิมพ์เบอร์โทร เช่น 081 234 5678" };
  if (step === "plate") return value.length >= 2 && value.length <= 30 ? { value: value.toUpperCase() } : { error: "กรุณาพิมพ์ทะเบียนรถ" };
  if (step === "model") return value.length >= 2 && value.length <= 150 ? { value } : { error: "กรุณาพิมพ์ยี่ห้อ/รุ่นรถ" };
  if (step === "car_type") return { error: "กรุณากดเลือกประเภทรถจากปุ่ม" };
  return { error: "กรุณาส่งเป็นรูปภาพ" };
}

export const nextStep = (step: FormStep): FormStep | null => FORM_STEPS[FORM_STEPS.indexOf(step) + 1] ?? null;

/** The group's members who may take jobs (Telegram's getChatMember statuses). */
export const isGroupMember = (member: { status?: string; is_member?: boolean } | null) =>
  !!member && (member.status === "creator" || member.status === "administrator" || member.status === "member" || (member.status === "restricted" && member.is_member === true));
