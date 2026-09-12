import { env } from "cloudflare:workers";

const DEFAULT_SITE_URL = "https://waydidi-private-transfer.dankbangkok.chatgpt.site";

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
  return (env.WAYDIDI_PUBLIC_URL || DEFAULT_SITE_URL).replace(/\/$/, "");
}

function displayDate(date: string, time: string) {
  const parsed = new Date(`${date}T${time}:00+07:00`);
  if (!Number.isFinite(parsed.getTime())) return `${date} at ${time}`;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok",
  }).format(parsed);
}

function detailRow(label: string, value: string) {
  return `<tr><td style="padding:12px 0;border-bottom:1px solid #edf0f4;color:#8793a6;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;vertical-align:top">${escapeHtml(label)}</td><td style="padding:12px 0 12px 20px;border-bottom:1px solid #edf0f4;color:#211726;font-size:15px;font-weight:700;line-height:1.45;text-align:right;vertical-align:top">${escapeHtml(value)}</td></tr>`;
}

async function resend(payload: Record<string, unknown>, idempotencyKey: string) {
  if (!env.RESEND_API_KEY || !env.BOOKING_FROM_EMAIL) return { status: "pending_configuration" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({ from: env.BOOKING_FROM_EMAIL, ...payload }),
    });
    if (!response.ok) console.error("Resend rejected email", response.status, await response.text());
    return { status: response.ok ? "sent" : "failed" };
  } catch (error) {
    console.error("Resend request failed", error);
    return { status: "failed" };
  }
}

export async function sendConfirmationEmail(input: ConfirmationEmailInput) {
  const formattedDate = displayDate(input.pickupDate, input.pickupTime);
  const payment = input.paymentMethod === "cash" ? "Cash at pickup" : "Paid online";
  const checkUrl = `${siteUrl()}/booking/manage`;
  const safeName = escapeHtml(input.name);
  const safeReference = escapeHtml(input.reference);
  const total = `THB ${input.total.toLocaleString("en-US")}`;
  const html = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;background:#f3f5f8;color:#211726;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">Your Waydidi ride is confirmed. Booking ${safeReference}.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f8"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 8px 30px rgba(43,25,10,.08)">
<tr><td style="background:#ff8a05;padding:36px 38px 40px;color:#fff">
<img src="cid:waydidi-logo" width="176" alt="Waydidi" style="display:block;width:176px;height:auto;border:0;margin:0 0 38px">
<div style="width:52px;height:52px;border-radius:50%;background:#ffa84d;color:#fff;font-size:30px;line-height:52px;text-align:center;font-weight:700">✓</div>
<p style="margin:28px 0 8px;color:#ffe1c2;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">Payment received</p>
<h1 style="margin:0;color:#fff;font-size:38px;line-height:1.08;letter-spacing:-.03em">Your ride is booked.</h1>
<p style="margin:15px 0 0;color:#ffe5cc;font-size:16px">Booking reference <strong style="color:#fff">${safeReference}</strong></p>
</td></tr>
<tr><td style="padding:34px 38px 38px">
<p style="margin:0 0 10px;color:#211726;font-size:17px;line-height:1.6">Hi ${safeName},</p>
<p style="margin:0 0 24px;color:#586579;font-size:16px;line-height:1.6">Your private transfer is confirmed. Keep this email and the attached PDF for your pickup.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
${detailRow("Service", input.serviceType === "hourly" ? `${input.bookedHours}-hour private driver` : "Private transfer")}
${detailRow("Pickup", input.pickup)}
${detailRow("Drop-off", input.dropoff)}
${detailRow("Date & time", formattedDate)}
${detailRow("Travelers", `${input.passengers} passengers - ${input.luggage} bags`)}
${detailRow("Vehicle", input.vehicle)}
${detailRow("Phone / WhatsApp", input.customerPhone)}
${detailRow("Payment", payment)}
${detailRow("Total", total)}
</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding-top:30px">
<a href="${checkUrl}" style="display:inline-block;background:#ff8a05;color:#fff;text-decoration:none;border-radius:999px;padding:15px 28px;font-size:16px;font-weight:700">Check your booking</a>
</td></tr></table>
<p style="margin:28px 0 0;color:#6d7889;font-size:13px;line-height:1.6;text-align:center">Need help? Reply to this email and the Waydidi team will assist you.</p>
</td></tr></table>
<p style="margin:18px 0 0;color:#8a94a3;font-size:12px;line-height:1.5;text-align:center">This transactional email was sent for booking ${safeReference}.</p>
</td></tr></table></body></html>`;

  const text = [
    "Your ride is booked.", `Booking reference: ${input.reference}`, "", `Hi ${input.name},`,
    "Your private transfer is confirmed.", "", `Pickup: ${input.pickup}`, `Drop-off: ${input.dropoff}`,
    `Date and time: ${formattedDate}`, `Travelers: ${input.passengers} passengers - ${input.luggage} bags`,
    `Vehicle: ${input.vehicle}`, `Payment: ${payment}`, `Total: ${total}`, "", `Check your booking: ${checkUrl}`,
  ].join("\n");

  return resend({
    to: [input.to],
    subject: `Your Waydidi ride is booked · ${input.reference}`,
    html,
    text,
    attachments: [
      { path: `${siteUrl()}/waydidi-logo.png`, filename: "waydidi-logo.png", contentId: "waydidi-logo", content_type: "image/png" },
      { filename: `Waydidi-${input.reference}.pdf`, content: toBase64(input.pdf), content_type: "application/pdf" },
    ],
  }, input.retryId ? `confirmation-retry-${input.reference}-${input.retryId}` : `confirmation-${input.reference}`);
}

export async function sendOperationsAlert(booking: {
  reference: string; customerName: string; customerEmail: string; customerPhone: string; pickup: string; dropoff: string;
  pickupDate: string; pickupTime: string; passengers: number; luggage: number; vehicle: string; total: number; paymentMethod: string;
}) {
  if (!env.BOOKING_ALERT_EMAIL) return { status: "pending_configuration" };
  const payment = booking.paymentMethod === "cash" ? "Cash at pickup" : "Paid online";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#211726"><div style="background:#ff8a05;padding:28px 32px;color:#fff;border-radius:20px 20px 0 0"><p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#ffe1c2">New confirmed booking</p><h1 style="margin:0;font-size:28px">${escapeHtml(booking.reference)}</h1></div><div style="padding:28px 32px;border:1px solid #e6e9ef;border-top:0;border-radius:0 0 20px 20px"><table style="width:100%;border-collapse:collapse">${detailRow("Passenger", booking.customerName)}${detailRow("Email", booking.customerEmail)}${detailRow("Phone", booking.customerPhone)}${detailRow("Pickup", booking.pickup)}${detailRow("Drop-off", booking.dropoff)}${detailRow("Date & time", displayDate(booking.pickupDate, booking.pickupTime))}${detailRow("Travelers", `${booking.passengers} passengers - ${booking.luggage} bags`)}${detailRow("Vehicle", booking.vehicle)}${detailRow("Payment", payment)}${detailRow("Total", `THB ${booking.total.toLocaleString("en-US")}`)}</table></div></div>`;
  return resend({
    to: [env.BOOKING_ALERT_EMAIL],
    subject: `New confirmed booking · ${booking.reference}`,
    html,
    text: `New confirmed booking ${booking.reference}\n${booking.customerName} · ${booking.customerPhone}\n${booking.pickup} to ${booking.dropoff}\n${booking.pickupDate} at ${booking.pickupTime}\n${booking.vehicle} · THB ${booking.total.toLocaleString("en-US")} · ${payment}`,
  }, `operations-${booking.reference}`);
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
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f5f8;color:#211726;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#ff8a05;padding:30px 34px;color:#fff"><img src="${siteUrl()}/waydidi-logo.png" width="150" alt="Waydidi" style="display:block;width:150px;height:auto;margin-bottom:28px"><p style="margin:0 0 8px;color:#ffe1c2;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">${escapeHtml(kicker)}</p><h1 style="margin:0;color:#fff;font-size:32px;line-height:1.12">${escapeHtml(title)}</h1></td></tr><tr><td style="padding:30px 34px"><p style="margin:0 0 22px;color:#586579;font-size:16px;line-height:1.6">${escapeHtml(intro)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></td></tr></table></td></tr></table></body></html>`;
}

export async function sendCustomerTripReminder(input: TripReminderInput & { to: string; name: string; hoursBefore: 24 | 3 }) {
  const when = displayDate(input.pickupDate, input.pickupTime);
  const title = input.hoursBefore === 24 ? "Your ride is tomorrow." : "Your ride is coming up soon.";
  const html = reminderShell(
    `${input.hoursBefore}-hour reminder`,
    title,
    `Hi ${input.name}, this is a reminder for your confirmed Waydidi transfer.`,
    `${detailRow("Booking", input.reference)}${detailRow("Pickup", input.pickup)}${detailRow("Drop-off", input.dropoff)}${detailRow("Date & time", when)}${detailRow("Vehicle", input.vehicle)}`,
  );
  return resend({
    to: [input.to],
    subject: `${title} · ${input.reference}`,
    html,
    text: `${title}\nBooking ${input.reference}\nPickup: ${input.pickup}\nDrop-off: ${input.dropoff}\nDate and time: ${when}\nVehicle: ${input.vehicle}`,
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
  if (!env.BOOKING_ALERT_EMAIL) return { status: "pending_configuration" };
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

export async function sendRefundDecisionEmail(input:{to:string;name:string;reference:string;amount:number;decision:"approved"|"declined";reason?:string}){
  const approved=input.decision==="approved";
  const title=approved?"Your refund is approved.":"Refund request update.";
  const intro=approved?`Hi ${input.name}, Waydidi approved your refund. THB ${input.amount.toLocaleString("en-US")} is being returned to your original payment method.`:`Hi ${input.name}, Waydidi could not approve the refund request for booking ${input.reference}.${input.reason?` Reason: ${input.reason}`:""}`;
  const html=reminderShell(approved?"Refund approved":"Refund decision",title,intro,`${detailRow("Booking",input.reference)}${detailRow("Amount",`THB ${input.amount.toLocaleString("en-US")}`)}${detailRow("Status",approved?"Approved — processing by payment provider":"Declined")}`);
  return resend({to:[input.to],subject:`${title} · ${input.reference}`,html,text:`${title}\n${intro}\nBooking: ${input.reference}\nAmount: THB ${input.amount.toLocaleString("en-US")}`},`refund-${input.decision}-${input.reference}`);
}
