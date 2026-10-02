import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { lineState } from "@/db/schema";
import { includesKohChangFerry, type FormAnswers, type FormService } from "@/lib/booking-form";
import { VEHICLES } from "@/lib/vehicles";

// LINE cards for customer forms: an orange "needs price" card when a form comes in,
// and a green "booked" card once the admin types the price in the chat.
const ORANGE = "#FF8A05";
const GREEN = "#06C755";

/** Small key-value store for the LINE chat (which form is waiting for a price). */
export async function getLineState(key: string) {
  const [row] = await getDb().select().from(lineState).where(eq(lineState.key, key)).limit(1).catch(() => []);
  return row?.value ?? null;
}
export async function setLineState(key: string, value: string | null) {
  if (value === null) { await getDb().delete(lineState).where(eq(lineState.key, key)); return; }
  const now = new Date().toISOString();
  await getDb().insert(lineState).values({ key, value, updatedAt: now }).onConflictDoUpdate({ target: lineState.key, set: { value, updatedAt: now } });
}

// "Mon, 28 Dec 2026 · 3:00 PM"
function when(date?: string, time?: string) {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00Z`);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
  if (!time) return day;
  const [h, m] = time.split(":").map(Number);
  return `${day} · ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const row = (label: string, value: string) => ({
  type: "box", layout: "horizontal", spacing: "md", contents: [
    { type: "text", text: label, size: "sm", color: "#8A8190", flex: 0 },
    { type: "text", text: value || "—", size: "sm", color: "#1F1726", weight: "bold", align: "end", wrap: true },
  ],
});
// Same people and luggage icons as the homepage search box, shown on the right as "👥 2 / 🧳 2".
const travellersRow = (people: number, bags: number, origin: string) => ({
  type: "box", layout: "horizontal", spacing: "md", contents: [
    { type: "text", text: "Travellers", size: "sm", color: "#8A8190", flex: 1, gravity: "center" },
    { type: "box", layout: "baseline", spacing: "xs", flex: 0, contents: [
      { type: "icon", url: `${origin}/line/users.png`, size: "sm" },
      { type: "text", text: String(people), size: "sm", color: "#1F1726", weight: "bold", flex: 0 },
      { type: "text", text: "/", size: "sm", color: "#8A8190", flex: 0 },
      { type: "icon", url: `${origin}/line/luggage.png`, size: "sm" },
      { type: "text", text: String(bags), size: "sm", color: "#1F1726", weight: "bold", flex: 0 },
    ] },
  ],
});
const sep = { type: "separator", margin: "md", color: "#EEE7DF" };
const header = (kicker: string, title: string, color: string) => ({
  type: "box", layout: "vertical", backgroundColor: color, paddingAll: "16px", contents: [
    { type: "text", text: kicker, size: "xs", color: "#FFFFFFCC", weight: "bold" },
    { type: "text", text: title, size: "lg", color: "#FFFFFF", weight: "bold", wrap: true, margin: "sm" },
  ],
});

/** The orange "needs price" card for a submitted form. */
export function formCard(input: { token: string; service: FormService; answers: FormAnswers; adminUrl: string; note?: string | null; agency?: string | null; presetPrice?: number | null; suggested?: { amount: number; detail: string } | null }) {
  const a = input.answers;
  const vehicle = VEHICLES[a.vehicle as keyof typeof VEHICLES];
  const services = [
    a.childSeats > 0 ? `Child seat × ${a.childSeats}` : "",
    a.exchangeStop ? "Exchange stop" : "",
    a.ferryPeople > 0 ? `Ferry & hotel transfer × ${a.ferryPeople}` : "",
    includesKohChangFerry(a.pickup, a.dropoff) && vehicle ? `Koh Chang ferry for ${vehicle.passengers}` : "",
  ].filter(Boolean);
  const body: unknown[] = [
    row("Date/Time", when(a.date, a.time)),
    ...(a.flightNumber ? [row("Flight", a.flightNumber)] : []),
    row("From", a.pickup),
    input.service === "hourly" ? row("Hours", `${a.hours ?? ""} hours`) : row(input.service === "tour" ? "Tour" : "To", a.dropoff),
  ];
  if (a.returnTrip && a.returnDate) body.push(sep, row("Return", when(a.returnDate, a.returnTime)), row("Route", `${a.dropoff} → ${a.pickup}`));
  body.push(sep, row("Vehicle", vehicle?.name ?? a.vehicle), travellersRow(a.passengers, a.luggage, new URL(input.adminUrl).origin));
  if (services.length) body.push({ type: "text", text: "Additional services", size: "sm", color: "#8A8190", margin: "md" }, { type: "text", text: services.join(" · "), size: "sm", color: "#C96100", weight: "bold", wrap: true });
  if (input.agency || input.note) body.push(sep, ...(input.agency ? [row("Agency", input.agency)] : []), ...(input.note ? [row("Note", input.note)] : []));
  if (input.presetPrice != null) body.push(row("Preset price", `${input.presetPrice.toLocaleString("en-US")} THB`));
  if (input.suggested) body.push(sep, row("Suggested", `${input.suggested.amount.toLocaleString("en-US")} THB`), { type: "text", text: input.suggested.detail, size: "xxs", color: "#8A8190", align: "end", wrap: true });
  return {
    type: "flex", altText: `New form: ${a.name} — needs a price`,
    contents: {
      type: "bubble",
      header: header("NEW FORM · NEEDS PRICE", a.name, ORANGE),
      body: { type: "box", layout: "vertical", spacing: "sm", contents: body },
      footer: { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "button", style: "primary", color: ORANGE, action: { type: "postback", label: "Set price", data: `price:${input.token}`, displayText: `Set price for ${a.name}` } },
        { type: "button", style: "secondary", action: { type: "uri", label: "Open in admin", uri: input.adminUrl } },
      ] },
    },
  };
}

/** The green "booked" card sent after a price is typed. */
export function bookedCard(input: { reference: string; name: string; total: number; emailSent: boolean; bookingUrl: string }) {
  return {
    type: "flex", altText: `Booked: Reference ID ${input.reference}`,
    contents: {
      type: "bubble",
      header: header("BOOKED", `Reference ID: ${input.reference}`, GREEN),
      body: { type: "box", layout: "vertical", spacing: "sm", contents: [
        row("Customer", input.name),
        row("Price", `${input.total.toLocaleString("en-US")} THB`),
        row("Payment", "Pay in cash"),
        row("Email + PDF", input.emailSent ? "Sent to customer ✓" : "Not sent — check email setup"),
      ] },
      footer: { type: "box", layout: "vertical", contents: [
        { type: "button", style: "secondary", action: { type: "uri", label: "Open booking", uri: input.bookingUrl } },
      ] },
    },
  };
}

/** "Type the price" prompt with the suggestion and one-tap quick replies (suggestion and ±10%). */
export function pricePrompt(token: string, name: string, suggested: { amount: number; detail: string } | null) {
  const text = suggested
    ? `Type the price for ${name} in THB.\n💡 Suggested: ${suggested.amount.toLocaleString("en-US")} THB (${suggested.detail})\nTap a price below or type your own.`
    : `Type the price for ${name} in THB.\nNo fare area matches this route, so there's no suggestion.`;
  const round = (n: number) => Math.max(50, Math.round(n / 50) * 50);
  const options = suggested ? [...new Set([round(suggested.amount), round(suggested.amount * 1.1), round(suggested.amount * 0.9)])] : [];
  return {
    type: "text", text,
    ...(options.length ? { quickReply: { items: options.map((amount) => ({ type: "action", action: { type: "postback", label: `${amount.toLocaleString("en-US")} THB`, data: `book:${token}:${amount}`, displayText: `${amount}` } })) } } : {}),
  };
}
