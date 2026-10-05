// Rich cards shown in the website chat (like LINE's cards). Each card message also keeps a plain
// text body, which is what Telegram, WhatsApp, LINE and the admin inbox show.

export type QuoteCard = { type: "quote"; title: string; subtitle: string; cars: { name: string; seats: number; bags: number; price: number; url: string }[]; notes: string[] };
export type PaymentCard = { type: "payment"; title: string; rows: [string, string][]; amount: number; url: string; expiresAt: string };
export type ConfirmedCard = { type: "confirmed"; reference: string; rows: [string, string][]; amount: number; test?: boolean };
export type ChatCard = QuoteCard | PaymentCard | ConfirmedCard;

const isStr = (v: unknown, max = 300): v is string => typeof v === "string" && v.length <= max;
const safeUrl = (v: unknown) => isStr(v, 600) && /^(https:\/\/|\/)/.test(v);

/** Cards come from our own server code, but are checked anyway before being shown. */
export function parseCard(json: string | null | undefined): ChatCard | null {
  if (!json) return null;
  try {
    const c = JSON.parse(json) as Record<string, unknown>;
    if (c.type === "quote" && isStr(c.title) && Array.isArray(c.cars) && c.cars.every((x) => safeUrl(x?.url) && isStr(x?.name) && typeof x?.price === "number")) return c as unknown as QuoteCard;
    if (c.type === "payment" && safeUrl(c.url) && typeof c.amount === "number" && Array.isArray(c.rows)) return c as unknown as PaymentCard;
    if (c.type === "confirmed" && isStr(c.reference, 20) && Array.isArray(c.rows)) return c as unknown as ConfirmedCard;
  } catch { /* not a card */ }
  return null;
}

const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;

export function quoteCard(q: { summary: string; cars: { name: string; seats: number; bags: number; price: number; bookUrl: string }[]; notes: string[] }): QuoteCard {
  const [title, ...rest] = q.summary.split(", ");
  return { type: "quote", title, subtitle: rest.join(" · "), notes: q.notes.slice(0, 3),
    cars: q.cars.slice(0, 6).map((c) => ({ name: c.name, seats: c.seats, bags: c.bags, price: c.price, url: c.bookUrl })) };
}

/** Plain-text version of a card, for Telegram, WhatsApp, LINE and the admin inbox. */
export function cardText(c: ChatCard) {
  if (c.type === "quote") return [`${c.title}${c.subtitle ? ` (${c.subtitle})` : ""}`, ...c.cars.map((x) => `• ${x.name}: ${thb(x.price)} – ${x.url}`), ...c.notes].join("\n");
  if (c.type === "payment") return [c.title, ...c.rows.map(([k, v]) => `${k}: ${v}`), `Total: ${thb(c.amount)}`, `Pay here: ${c.url}`].join("\n");
  return [`Booking ${c.reference} confirmed`, ...c.rows.map(([k, v]) => `${k}: ${v}`), `Paid: ${thb(c.amount)}`].join("\n");
}
