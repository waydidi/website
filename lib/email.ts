import { confirmationPdfName } from "@/lib/confirmation-pdf";
import type { BookingExtras } from "@/lib/booking-extras";
import { logoPng } from "@/lib/pdf-addon-images";
import { VEHICLES } from "@/lib/vehicles";
import { includesKohChangFerry } from "@/lib/booking-form";
import { env } from "cloudflare:workers";

import { SITE_URL } from "@/lib/site";

type ConfirmationEmailInput = {
  to: string;
  name: string;
  reference: string;
  pdf: Uint8Array;
  pickup: string;
  dropoff: string;
  pickupDate: string;
  pickupTime: string;
  vehicle: string;
  customerPhone: string;
  passengers: number;
  luggage: number;
  total: number;
  paymentMethod: string;
  retryId?: string;
  serviceType?: string;
  bookedHours?: number | null;
  pricingArea?: string | null;
  returnPickup?: string | null;
  returnDropoff?: string | null;
  returnDate?: string | null;
  returnTime?: string | null;
  outboundTotal?: number | null;
  returnTotal?: number | null;
  extras?: BookingExtras;
  surname?: string | null;
  flightNumber?: string | null;
};

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function siteUrl() {
  return (env.WAYDIDI_PUBLIC_URL || SITE_URL).replace(/\/$/, "");
}

function displayDate(date: string, time: string) {
  const parsed = new Date(`${date}T${time}:00+07:00`);
  if (!Number.isFinite(parsed.getTime())) return `${date} at ${time}`;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok",
  }).format(parsed);
}

function detailRow(label: string, value: string, valueColor = "#211726") {
  return `<tr><td style="padding:12px 0;border-bottom:1px solid #edf0f4;color:#8793a6;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;vertical-align:top">${escapeHtml(label)}</td><td style="padding:12px 0 12px 20px;border-bottom:1px solid #edf0f4;color:${valueColor};font-size:15px;font-weight:700;line-height:1.45;text-align:right;vertical-align:top">${escapeHtml(value)}</td></tr>`;
}

/** Outcome of sending one email. */
export type EmailDelivery = { status: "sent" | "failed" | "pending_configuration" };

// The logo travels inside the email (not loaded from the website), so it always shows.
const LOGO_ATTACHMENT = { content: logoPng, filename: "waydidi-logo.png", contentId: "waydidi-logo", content_type: "image/png" };
function withLogo(payload: Record<string, unknown>) {
  const html = typeof payload.html === "string" ? payload.html : "";
  const attachments = Array.isArray(payload.attachments) ? payload.attachments as { contentId?: string }[] : [];
  if (!html.includes("cid:waydidi-logo") || attachments.some((a) => a.contentId === "waydidi-logo")) return payload;
  return { ...payload, attachments: [...attachments, LOGO_ATTACHMENT] };
}

async function resend(payload: Record<string, unknown>, idempotencyKey: string): Promise<EmailDelivery> {
  if (!env.RESEND_API_KEY || !env.BOOKING_FROM_EMAIL) return { status: "pending_configuration" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({ from: env.BOOKING_FROM_EMAIL, ...withLogo(payload) }),
    });
    if (!response.ok) console.error("Resend rejected email", response.status, await response.text());
    return { status: response.ok ? "sent" : "failed" };
  } catch (error) {
    console.error("Resend request failed", error);
    return { status: "failed" };
  }
}

// "28 December 2026 — 3:00 PM" in Bangkok time.
function letterDate(date: string, time: string) {
  const parsed = new Date(`${date}T${time}:00+07:00`);
  if (!Number.isFinite(parsed.getTime())) return `${date} — ${time}`;
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(parsed);
  const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Bangkok" }).format(parsed);
  return `${day} — ${clock}`;
}

const WHATSAPP = "+66 63 206 4884";

export async function sendConfirmationEmail(input: ConfirmationEmailInput) {
  const roundTrip = Boolean(input.returnDate && input.returnTime);
  const payment = input.total === 0 ? "Nothing to pay" : input.paymentMethod === "cash" ? "Pay in cash" : input.paymentMethod === "manual" ? "Paid" : "Paid online";
  const addons = input.extras?.addons.map((line) => line.label.toLowerCase()) ?? [];
  const price = `${input.total.toLocaleString("en-US")} THB${addons.length ? ` (including ${addons.join(", ")}${roundTrip ? " for both ways" : ""})` : ""}`;
  const fullName = [input.name, input.surname].filter(Boolean).join(" ");
  const greeting = input.name === "there" ? "Hello," : `Dear ${input.name},`;
  const flight = input.flightNumber?.trim();
  // Each block is a list of [label, value] lines; blocks are separated by a blank line.
  const outbound: [string, string][] = [
    ["Booking reference", input.reference],
    ...(input.name === "there" ? [] : [["Lead passenger name", fullName] as [string, string]]),
    ...(input.serviceType === "hourly" && input.bookedHours ? [["Service", `${input.bookedHours}-hour private driver${input.pricingArea ? ` · ${input.pricingArea}` : ""}`] as [string, string]] : []),
    ["Date/Time", letterDate(input.pickupDate, input.pickupTime)],
    ...(flight ? [["Flight number", flight] as [string, string]] : []),
    ["From", input.pickup],
    ...(input.dropoff ? [["To", input.dropoff] as [string, string]] : []),
  ];
  const back: [string, string][] = roundTrip ? [
    ["Date/Time", letterDate(input.returnDate!, input.returnTime!)],
    ["From", input.returnPickup ?? input.dropoff],
    ["To", input.returnDropoff ?? input.pickup],
  ] : [];
  const vehicleClass = Object.entries(VEHICLES).find(([id, v]) => id === input.vehicle || v.name === input.vehicle)?.[1];
  const ferry = vehicleClass && includesKohChangFerry(input.pickup, input.dropoff, input.returnPickup, input.returnDropoff)
    ? [["Included", `Koh Chang car ferry tickets for ${vehicleClass.passengers} people${roundTrip ? " (both ways)" : ""}`] as [string, string]] : [];
  const closing: [string, string][] = [...ferry, ["Price", price], ["Payment method", payment]];
  const blocks = roundTrip ? [outbound, [...back, ...closing]] : [[...outbound, ...closing]];
  const p = (inner: string, extra = "") => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#211726${extra}">${inner}</p>`;
  const blockHtml = (lines: [string, string][]) => p(lines.map(([label, value]) => `${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong>`).join("<br>"));
  const html = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;background:#ffffff;color:#211726;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">Your Waydidi booking ${escapeHtml(input.reference)} is confirmed.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:24px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px"><tr><td>
<img src="cid:waydidi-logo" width="140" alt="Waydidi" style="display:block;width:140px;height:auto;border:0;margin:0 0 24px">
${p(escapeHtml(greeting))}
${p("Warm greetings from Waydidi Travel. We are pleased to confirm your booking with the following details:")}
${blocks.map(blockHtml).join("\n")}
${p("Please find your official booking confirmation as a PDF file in this email.")}
${p(`If you have any questions before your trip, feel free to contact us via WhatsApp: <a href="https://wa.me/${WHATSAPP.replace(/\D/g, "")}" style="color:#C96100">${WHATSAPP}</a>`)}
${p("We look forward to taking care of your journey.")}
${p("Best regards,<br>Waydidi Team")}
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    greeting, "", "Warm greetings from Waydidi Travel. We are pleased to confirm your booking with the following details:", "",
    ...blocks.flatMap((lines) => [...lines.map(([label, value]) => `${label}: ${value}`), ""]),
    "Please find your official booking confirmation as a PDF file in this email.", "",
    `If you have any questions before your trip, feel free to contact us via WhatsApp: ${WHATSAPP}`, "",
    "We look forward to taking care of your journey.", "Best regards,", "Waydidi Team",
  ].join("\n");

  return resend({
    to: [input.to],
    subject: `Booking confirmation · ${input.reference} · Waydidi Travel`,
    html,
    text,
    attachments: [
      LOGO_ATTACHMENT,
      { filename: confirmationPdfName(input.reference, input.pickupDate), content: toBase64(input.pdf), content_type: "application/pdf" },
    ],
  }, input.retryId ? `confirmation-retry-${input.reference}-${input.retryId}` : `confirmation-${input.reference}`);
}

export async function sendOperationsAlert(booking: {
  reference: string; customerName: string; customerEmail: string; customerPhone: string; pickup: string; dropoff: string;
  pickupDate: string; pickupTime: string; passengers: number; luggage: number; vehicle: string; total: number; paymentMethod: string;
  returnPickup?: string | null; returnDropoff?: string | null; returnDate?: string | null; returnTime?: string | null;
  serviceType?: string | null; bookedHours?: number | null; pricingArea?: string | null; childSeats?: number | null; specialRequests?: string | null; flightNumber?: string | null;
}) {
  if (!env.BOOKING_ALERT_EMAIL) return { status: "pending_configuration" } as EmailDelivery;
  const payment = booking.total === 0 ? "Nothing to pay" : booking.paymentMethod === "cash" ? "Cash at pickup" : booking.paymentMethod === "manual" ? "Paid" : "Paid online";
  const cash = booking.paymentMethod === "cash" && booking.total > 0;
  // Same look as the customer's confirmation page: stacked label / value blocks.
  const field = (label: string, value: string) => `<tr><td style="padding:0 0 22px"><p style="margin:0 0 6px;color:#8793a6;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">${escapeHtml(label)}</p><p style="margin:0;color:#211726;font-size:17px;font-weight:700;line-height:1.4">${escapeHtml(value)}</p></td></tr>`;
  const fields = [
    field("Service", booking.serviceType === "hourly" ? `${booking.bookedHours}-hour private driver${booking.pricingArea ? ` · ${booking.pricingArea}` : ""}` : "Private transfer"),
    field("Passenger", booking.customerName), field("Email", booking.customerEmail), field("Phone / WhatsApp", booking.customerPhone),
    field("Pickup", booking.pickup), field("Drop-off", booking.dropoff),
    field("Date & time", `${booking.pickupDate} at ${booking.pickupTime}`),
    booking.flightNumber ? field("Flight", booking.flightNumber) : "",
    booking.returnDate && booking.returnTime ? field("Return", `${booking.returnPickup ?? booking.dropoff} to ${booking.returnDropoff ?? booking.pickup}, ${booking.returnDate} at ${booking.returnTime}`) : "",
    field("Travelers", `${booking.passengers} passengers · ${booking.luggage} bags`), field("Vehicle", booking.vehicle), field("Payment", payment),
    booking.childSeats ? field("Child seats", String(booking.childSeats)) : "",
    booking.specialRequests ? field("Special requests", booking.specialRequests) : "",
    field("Total", `฿${booking.total.toLocaleString("en-US")}`),
  ].join("");
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;background:#f3f5f8;color:#211726;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f8"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 8px 30px rgba(43,25,10,.08)">
<tr><td style="background:#ff8a05;padding:36px 38px 40px;color:#fff">
<img src="cid:waydidi-logo" width="176" alt="Waydidi" style="display:block;width:176px;height:auto;border:0;margin:0 0 38px">
<div style="width:52px;height:52px;border-radius:50%;background:#ffa84d;color:#fff;font-size:30px;line-height:52px;text-align:center;font-weight:700">✓</div>
<p style="margin:28px 0 8px;color:#ffe1c2;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">${cash ? "Booking confirmed" : "Payment received"}</p>
<h1 style="margin:0;color:#fff;font-size:38px;line-height:1.08;letter-spacing:-.03em">Your ride is booked.</h1>
<p style="margin:15px 0 0;color:#ffe5cc;font-size:16px">Booking reference <strong style="color:#fff">${escapeHtml(booking.reference)}</strong></p>
</td></tr>
<tr><td style="padding:34px 38px 30px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${fields}</table>
<a href="${siteUrl()}/admin/journeys/${encodeURIComponent(booking.reference)}" style="display:block;margin-top:8px;background:#211726;color:#fff;text-align:center;text-decoration:none;font-size:17px;font-weight:700;padding:16px 24px;border-radius:999px">Open booking</a>
</td></tr></table></td></tr></table></body></html>`;
  return resend({
    to: [env.BOOKING_ALERT_EMAIL],
    subject: `New confirmed booking · ${booking.reference}`,
    html,
    text: `New confirmed booking ${booking.reference}\n${booking.customerName} · ${booking.customerPhone}\n${booking.pickup} to ${booking.dropoff}\n${booking.pickupDate} at ${booking.pickupTime}${booking.returnDate && booking.returnTime ? `\nReturn: ${booking.returnPickup ?? booking.dropoff} to ${booking.returnDropoff ?? booking.pickup}\n${booking.returnDate} at ${booking.returnTime}` : ""}\n${booking.vehicle} · THB ${booking.total.toLocaleString("en-US")} · ${payment}\nOpen booking: ${siteUrl()}/admin/journeys/${booking.reference}`,
  }, `operations-${booking.reference}`);
}

/** Tells operations a customer filled in a form link, so it can be booked. */
export async function sendFormAlert(input: {
  token: string; service: string; agency: string | null; note: string | null; price: number | null; origin?: string;
  answers: { name: string; phone: string; email: string; pickup: string; dropoff?: string; hours?: number; date: string; time: string; returnTrip?: boolean; returnDate?: string; returnTime?: string; passengers: number; luggage: number; vehicle: string };
}) {
  if (!env.BOOKING_ALERT_EMAIL) return { status: "pending_configuration" } as EmailDelivery;
  const a = input.answers;
  // Link back to the site the customer used (falls back to the configured address).
  const base = (input.origin || siteUrl()).replace(/\/$/, "");
  const rows = [
    detailRow("Name", a.name), detailRow("WhatsApp", a.phone), detailRow("Email", a.email),
    detailRow("From", a.pickup), a.dropoff ? detailRow("To", a.dropoff) : detailRow("Hours", String(a.hours ?? "")),
    detailRow("Date & time", displayDate(a.date, a.time)),
    a.returnTrip && a.returnDate && a.returnTime ? detailRow("Return", displayDate(a.returnDate, a.returnTime)) : "",
    detailRow("Travelers", `${a.passengers} passengers - ${a.luggage} bags`), detailRow("Vehicle", VEHICLES[a.vehicle as keyof typeof VEHICLES]?.name ?? a.vehicle),
    input.price != null ? detailRow("Agreed price", `THB ${input.price.toLocaleString("en-US")}`) : "",
    input.agency ? detailRow("Agency", input.agency) : "", input.note ? detailRow("Note", input.note) : "",
    `<tr><td colspan="2" style="padding:28px 0 4px"><a href="${base}/admin/bookings?type=${encodeURIComponent(input.service)}&form=${encodeURIComponent(input.token)}" style="display:block;background:#ff8a05;color:#ffffff;text-align:center;text-decoration:none;font-size:17px;font-weight:700;padding:16px 24px;border-radius:14px">Complete booking</a></td></tr>`,
  ].join("");
  const html = reminderShell("", `${a.name} filled in their ride details`, "", rows);
  return resend({
    to: [env.BOOKING_ALERT_EMAIL],
    subject: `Form answers in · ${a.name}${input.agency ? ` (${input.agency})` : ""}`,
    html,
    text: `${a.name} filled in the form.\nComplete booking: ${base}/admin/bookings?type=${encodeURIComponent(input.service)}&form=${encodeURIComponent(input.token)}\n${a.pickup}${a.dropoff ? ` to ${a.dropoff}` : ""}\n${a.date} at ${a.time}\n${a.passengers} passengers, ${a.luggage} bags · ${a.vehicle}`,
  }, `form-${input.token}`);
}

type TripReminderInput = {
  reference: string;
  pickup: string;
  dropoff: string;
  pickupDate: string;
  pickupTime: string;
  vehicle: string;
};

function reminderShell(kicker: string, title: string, intro: string, rows: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f5f8;color:#211726;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#ff8a05;padding:30px 34px;color:#fff"><img src="cid:waydidi-logo" width="150" alt="Waydidi" style="display:block;width:150px;height:auto;margin-bottom:28px">${kicker ? `<p style="margin:0 0 8px;color:#ffe1c2;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">${escapeHtml(kicker)}</p>` : ""}<h1 style="margin:0;color:#fff;font-size:32px;line-height:1.12">${escapeHtml(title)}</h1></td></tr><tr><td style="padding:30px 34px">${intro ? `<p style="margin:0 0 22px;color:#586579;font-size:16px;line-height:1.6">${escapeHtml(intro)}</p>` : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></td></tr></table></td></tr></table></body></html>`;
}

export async function sendCustomerTripReminder(input: TripReminderInput & { to: string; name: string; hoursBefore: 24 | 3; tripKey?: string; leg?: "outbound" | "return" }) {
  const tripUrl = input.tripKey ? `${siteUrl()}/trip/${encodeURIComponent(input.reference)}?key=${input.tripKey}&leg=${input.leg ?? "outbound"}` : null;
  const when = displayDate(input.pickupDate, input.pickupTime);
  const title = input.hoursBefore === 24 ? "Your ride is tomorrow." : "Your ride is coming up soon.";
  const html = reminderShell(
    `${input.hoursBefore}-hour reminder`,
    title,
    `Hi ${input.name}, this is a reminder for your confirmed Waydidi transfer.`,
    `${detailRow("Booking", input.reference)}${detailRow("Pickup", input.pickup)}${detailRow("Drop-off", input.dropoff)}${detailRow("Date & time", when)}${detailRow("Vehicle", input.vehicle)}${tripUrl ? `<tr><td colspan="2" align="center" style="padding-top:26px"><a href="${escapeHtml(tripUrl)}" style="display:inline-block;background:#ff8a05;color:#21140a;text-decoration:none;border-radius:999px;padding:14px 24px;font-size:15px;font-weight:700">Track your trip</a></td></tr>` : ""}`,
  );
  return resend({
    to: [input.to],
    subject: `${title} · ${input.reference}`,
    html,
    text: `${title}\nBooking ${input.reference}\nPickup: ${input.pickup}\nDrop-off: ${input.dropoff}\nDate and time: ${when}\nVehicle: ${input.vehicle}${tripUrl ? `\nTrack your trip: ${tripUrl}` : ""}`,
  }, `customer-reminder-${input.hoursBefore}h-${input.reference}`);
}

export async function sendDriverAssignmentEmail(input: TripReminderInput & { to: string; driverName: string; driverUrl: string }) {
  const when = displayDate(input.pickupDate, input.pickupTime);
  const html = reminderShell(
    "New assignment",
    "You have a new Waydidi trip.",
    `Hi ${input.driverName}, keep the secure trip link below for status updates.`,
    `${detailRow("Booking", input.reference)}${detailRow("Pickup", input.pickup)}${detailRow("Drop-off", input.dropoff)}${detailRow("Date & time", when)}${detailRow("Vehicle", input.vehicle)}<tr><td colspan="2" align="center" style="padding-top:26px"><a href="${escapeHtml(input.driverUrl)}" style="display:inline-block;background:#ff8a05;color:#fff;text-decoration:none;border-radius:999px;padding:14px 24px;font-size:15px;font-weight:700">Open driver trip</a></td></tr>`,
  );
  return resend({
    to: [input.to],
    subject: `New Waydidi trip · ${input.reference}`,
    html,
    text: `New Waydidi trip ${input.reference}\nPickup: ${input.pickup}\nDrop-off: ${input.dropoff}\nDate and time: ${when}\nOpen trip: ${input.driverUrl}`,
  }, `driver-assignment-${input.reference}-${input.to.toLowerCase()}`);
}

export async function sendDriverTripReminder(input: TripReminderInput & { to: string; driverName: string }) {
  const when = displayDate(input.pickupDate, input.pickupTime);
  const html = reminderShell(
    "Driver reminder",
    "Your trip starts in about 3 hours.",
    `Hi ${input.driverName}, prepare for this assignment and use the secure link from your assignment email to update each trip stage.`,
    `${detailRow("Booking", input.reference)}${detailRow("Pickup", input.pickup)}${detailRow("Drop-off", input.dropoff)}${detailRow("Date & time", when)}${detailRow("Vehicle", input.vehicle)}`,
  );
  return resend({
    to: [input.to],
    subject: `Driver reminder · ${input.reference}`,
    html,
    text: `Your trip starts in about 3 hours.\nBooking ${input.reference}\nPickup: ${input.pickup}\nDrop-off: ${input.dropoff}\nDate and time: ${when}`,
  }, `driver-reminder-3h-${input.reference}-${input.to.toLowerCase()}`);
}

export async function sendLateJourneyAlert(input: TripReminderInput & { alertType: string; title: string; details: string }) {
  if (!env.BOOKING_ALERT_EMAIL) return { status: "pending_configuration" } as EmailDelivery;
  const html = reminderShell(
    "Operations alert",
    input.title,
    input.details,
    `${detailRow("Booking", input.reference)}${detailRow("Pickup", input.pickup)}${detailRow("Drop-off", input.dropoff)}${detailRow("Date & time", displayDate(input.pickupDate, input.pickupTime))}${detailRow("Vehicle", input.vehicle)}`,
  );
  return resend({
    to: [env.BOOKING_ALERT_EMAIL],
    subject: `${input.title} · ${input.reference}`,
    html,
    text: `${input.title}\n${input.details}\nBooking ${input.reference}\n${input.pickup} to ${input.dropoff}\n${displayDate(input.pickupDate, input.pickupTime)}`,
  }, `late-alert-${input.alertType}-${input.reference}`);
}

export async function sendBookingManagementEmail(input: TripReminderInput & { to: string; name: string; action: "rescheduled" | "cancelled"; refundStatus?: string }) {
  const cancelled = input.action === "cancelled";
  const title = cancelled ? "Your booking is cancelled." : "Your pickup time is updated.";
  const intro = cancelled
    ? `Hi ${input.name}, booking ${input.reference} has been cancelled.${input.refundStatus === "awaiting_approval" ? " Your refund request is awaiting Waydidi administrator approval." : input.refundStatus && input.refundStatus !== "not_required" ? ` Refund status: ${input.refundStatus.replaceAll("_", " ")}.` : ""}`
    : `Hi ${input.name}, we saved the new pickup date and time for booking ${input.reference}.`;
  const html = reminderShell(cancelled ? "Cancellation confirmed" : "Schedule updated", title, intro, `${detailRow("Booking", input.reference)}${detailRow("Pickup", input.pickup)}${detailRow("Drop-off", input.dropoff)}${detailRow("Date & time", displayDate(input.pickupDate, input.pickupTime))}${detailRow("Vehicle", input.vehicle)}`);
  return resend({to:[input.to],subject:`${title} · ${input.reference}`,html,text:`${title}\n${intro}\nPickup: ${input.pickup}\nDrop-off: ${input.dropoff}\nDate and time: ${displayDate(input.pickupDate,input.pickupTime)}`},`booking-${input.action}-${input.reference}-${Date.now()}`);
}

export async function sendAccountSignInCode(input: { to: string; code: string; codeId: string }) {
  const html = reminderShell(
    "Waydidi account",
    `Your sign-in code is ${input.code}`,
    "Enter this code on the Waydidi sign-in page. It expires in 10 minutes. If you did not ask for it, you can ignore this email.",
    detailRow("Code", input.code),
  );
  return resend({
    to: [input.to],
    subject: `${input.code} is your Waydidi sign-in code`,
    html,
    text: `Your Waydidi sign-in code is ${input.code}. It expires in 10 minutes. If you did not ask for it, you can ignore this email.`,
  }, `account-code-${input.codeId}`);
}

// One friendly nudge to a signed-in member whose booking stopped at payment.
export async function sendUnfinishedBookingEmail(input: { to: string; name: string; reference: string; destination: string; pickupDate: string; pickupTime: string; path: string }) {
  const link = `${siteUrl()}${input.path}`;
  const place = input.destination.split(",")[0]?.trim() || input.destination;
  const title = `Your ride to ${place} is waiting.`;
  const when = displayDate(input.pickupDate, input.pickupTime);
  const html = reminderShell(
    "Finish your booking",
    title,
    `Hi ${input.name}, you started booking a private ride but didn't finish paying. Your trip details are saved, so it only takes a moment to complete.`,
    `${detailRow("To", input.destination)}${detailRow("Date & time", when)}<tr><td colspan="2" align="center" style="padding-top:26px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#ff8a05;color:#21140a;text-decoration:none;border-radius:999px;padding:14px 24px;font-size:15px;font-weight:700">Finish booking</a></td></tr><tr><td colspan="2" style="padding-top:22px;color:#8a94a6;font-size:12px;line-height:1.5">You're getting this one-time email because you started this booking while signed in to Waydidi. Prices are re-checked when you finish.</td></tr>`,
  );
  return resend({
    to: [input.to],
    subject: title,
    html,
    text: `${title}\nYou started booking a ride to ${input.destination} on ${when} but didn't finish paying.\nFinish booking: ${link}`,
  }, `member-unfinished-${input.reference}`);
}


// Member reward emails: almost at the next badge, new badge + mystery box, gift expiring.
export async function sendRewardEmail(input: { to: string; kicker: string; title: string; intro: string; cta: string; path: string; tag: string }) {
  const link = `${siteUrl()}${input.path}`;
  const html = reminderShell(
    input.kicker,
    input.title,
    input.intro,
    `<tr><td colspan="2" align="center" style="padding-top:18px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#ff8a05;color:#21140a;text-decoration:none;border-radius:999px;padding:14px 24px;font-size:15px;font-weight:700">${escapeHtml(input.cta)}</a></td></tr><tr><td colspan="2" style="padding-top:22px;color:#8a94a6;font-size:12px;line-height:1.5">You're getting this because you have a Waydidi member account. Manage emails in your account settings.</td></tr>`,
  );
  return resend({ to: [input.to], subject: input.title, html, text: `${input.title}\n${input.intro}\n${input.cta}: ${link}` }, input.tag);
}
