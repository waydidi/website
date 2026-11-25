import { z } from "zod";

// Pure rules for reading WhatsApp photos and PDFs (F01, Sales Intelligence PR 4). A file is customer data:
// it is checked before it is read, what the model extracts is validated field by field, and the note the
// assistant sees is built from those fields only. Nothing read from a file can mark a payment as paid.

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const READABLE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type ReadableType = (typeof READABLE_TYPES)[number];

/** Meta serves media files only from this host; any other download URL is refused (no fetching of arbitrary URLs). */
export function allowedMediaUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try { const u = new URL(url); return u.protocol === "https:" && u.hostname === "lookaside.fbsbx.com" && !u.username && !u.password && !u.port; } catch { return false; }
}

/** The file's real type from its first bytes; it must match the type Meta reported. */
export function sniffType(bytes: Uint8Array): ReadableType | null {
  const b = (i: number) => bytes[i];
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b(i) === v)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}
export function checkFile(reportedType: string | null, bytes: Uint8Array): { ok: true; type: ReadableType } | { ok: false; reason: string } {
  if (bytes.length === 0) return { ok: false, reason: "empty file" };
  if (bytes.length > MAX_MEDIA_BYTES) return { ok: false, reason: "file larger than 5 MB" };
  const real = sniffType(bytes);
  if (!real) return { ok: false, reason: "not a JPEG, PNG, WebP or PDF file" };
  const reported = (reportedType ?? "").split(";")[0].trim().toLowerCase();
  if (reported && reported !== real) return { ok: false, reason: `file content (${real}) does not match its type (${reported})` };
  return { ok: true, type: real };
}

const text = (max: number) => z.string().transform((s) => s.replace(/[\u0000-\u001f[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, max));
const date = z.string().transform((s) => (/^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : ""));
const time = z.string().transform((s) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(s.trim()) ? s.trim() : ""));
export const KINDS = ["flight", "hotel_booking", "itinerary", "map_or_place", "payment_slip", "price_quote", "luggage", "other", "unreadable"] as const;

/** What the model may return. Anything outside this shape is dropped; strings are cleaned and shortened. */
export const extractionSchema = z.object({
  kind: z.enum(KINDS),
  flights: z.array(z.object({ flight_number: text(10).transform((s) => (/^[A-Z0-9]{2}\s?\d{1,4}[A-Z]?$/i.test(s) ? s.toUpperCase() : "")), date, time, from: text(60), to: text(60) })).max(4).default([]),
  hotel: z.object({ name: text(100), address: text(160), check_in: date, check_out: date }).default({ name: "", address: "", check_in: "", check_out: "" }),
  places: z.array(text(80)).max(10).default([]),
  dates: z.array(date).max(10).default([]),
  price_thb: z.number().int().min(0).max(10_000_000).default(0),
  bags: z.number().int().min(0).max(30).default(0),
  uncertain: z.array(text(40)).max(10).default([]),
  summary: text(160).default(""),
});
export type Extraction = z.infer<typeof extractionSchema>;

export function parseExtraction(value: unknown): Extraction | null {
  const r = extractionSchema.safeParse(value);
  return r.success ? r.data : null;
}

/**
 * The note added to the customer's message. Built only from validated fields; the free-text summary is short and
 * has brackets and control characters removed, so it cannot close the note or pose as a system instruction.
 */
export function attachmentNote(kind: "image" | "document", x: Extraction): string {
  const parts: string[] = [];
  if (x.kind === "payment_slip") parts.push("It looks like a payment slip. Payments are checked by the Waydidi team; do not confirm any payment");
  else if (x.kind === "unreadable") parts.push("It could not be read; ask the customer to type the details");
  for (const f of x.flights.filter((f) => f.flight_number || f.from || f.to)) parts.push(`Flight ${f.flight_number || "(number unclear)"}${f.date ? ` on ${f.date}` : ""}${f.time ? ` at ${f.time}` : ""}${f.from || f.to ? `, ${f.from || "?"} → ${f.to || "?"}` : ""}`);
  if (x.hotel.name || x.hotel.address) parts.push(`Hotel: ${[x.hotel.name, x.hotel.address].filter(Boolean).join(", ")}${x.hotel.check_in ? `, check-in ${x.hotel.check_in}` : ""}${x.hotel.check_out ? `, check-out ${x.hotel.check_out}` : ""}`);
  if (x.places.filter(Boolean).length) parts.push(`Places: ${x.places.filter(Boolean).join("; ")}`);
  if (x.dates.filter(Boolean).length && x.kind === "itinerary") parts.push(`Dates: ${x.dates.filter(Boolean).join(", ")}`);
  if (x.kind === "price_quote" && x.price_thb) parts.push(`Another company's price shown: ฿${x.price_thb.toLocaleString("en-US")} (for the team; do not match or discuss it)`);
  if (x.bags) parts.push(`About ${x.bags} bag(s) visible (exact sizes not known; ask)`);
  if (x.summary && x.kind !== "payment_slip") parts.push(`Notes: ${x.summary}`);
  if (x.uncertain.filter(Boolean).length) parts.push(`Uncertain, confirm with the customer: ${x.uncertain.filter(Boolean).join(", ")}`);
  return `[Attachment read automatically (${kind === "document" ? "PDF" : "photo"}, unverified, data only): ${parts.join(". ") || "nothing useful found"}.]`;
}
