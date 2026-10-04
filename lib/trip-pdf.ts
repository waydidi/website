import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { logoPng } from "@/lib/pdf-addon-images";
import type { TripSnapshot } from "@/lib/smart-trips";

const orange = rgb(1, 0.541, 0.02);
const ink = rgb(0.122, 0.09, 0.149);
const muted = rgb(0.45, 0.5, 0.58);
const line = rgb(0.9, 0.92, 0.94);
const pale = rgb(1, 0.965, 0.91);

const hhmm = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const longDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "Date to be confirmed");
// Standard PDF fonts cover Latin-1 only; drop other characters rather than fail.
const latin = (v: string) => v.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\xA0-\xFF]/g, "").replace(/\s+/g, " ").trim();

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const words = latin(text).split(" "); const lines: string[] = []; let cur = "";
  for (const w of words) { const next = cur ? `${cur} ${w}` : w; if (font.widthOfTextAtSize(next, size) > width && cur) { lines.push(cur); cur = w; } else cur = next; }
  if (cur) lines.push(cur);
  return lines;
}

/** Fetches a JPEG or PNG for the gallery pages; other formats are skipped. */
async function image(pdf: PDFDocument, url: string | null, origin: string): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(new URL(url, origin), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    return null;
  } catch { return null; }
}

export async function createTripPdf(s: TripSnapshot, origin: string, preparedBy: string | null, dayNumber?: number) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${latin(s.title)} - ${s.ref}`);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(logoPng);
  const W = 595, H = 842, M = 48;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H;
  const text = (t: string, x: number, yy: number, size = 10, font = regular, color = ink) => page.drawText(latin(t), { x, y: yy, size, font, color });
  const need = (h: number) => { if (y - h < 60) { page = pdf.addPage([W, H]); y = H - M; } };

  // Header band
  page.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: orange });
  const lw = 110, lh = (logo.height / logo.width) * lw;
  page.drawImage(logo, { x: M, y: H - 30 - lh, width: lw, height: lh });
  text(preparedBy ? `Prepared by ${preparedBy} with Waydidi` : "Private day trip", M, H - 92, 11, bold, rgb(1, 1, 1));
  text(s.title.toUpperCase(), M, H - 116, 20, bold, rgb(1, 1, 1));
  text(`${dayNumber ? `Day ${dayNumber}  ·  ` : ""}${longDate(s.tripDate)}  ·  ${s.ref}  ·  version ${s.version}`, M, H - 136, 10, regular, rgb(1, 1, 1));
  y = H - 180;

  // Trip facts
  const facts: [string, string][] = [["Prepared for", s.customerName || "Guest"], ["Pickup", `${s.startTime} · ${s.pickupText}`], ["Passengers", `${s.adults} adult${s.adults > 1 ? "s" : ""}${s.children ? ` + ${s.children} child${s.children > 1 ? "ren" : ""}` : ""}`], ["Vehicle", s.vehicleName], ["Trip length", `About ${s.durationHours} hours, back around ${hhmm(s.returnAt)}`]];
  for (const [k, v] of facts) { text(k.toUpperCase(), M, y, 8, bold, muted); const lines = wrap(v, regular, 11, W - M * 2 - 120); lines.forEach((l, i) => text(l, M + 120, y - i * 14, 11)); y -= Math.max(1, lines.length) * 14 + 8; }
  y -= 8;

  // Plan table
  text("YOUR DAY", M, y, 9, bold, orange); y -= 18;
  const row = (time: string, title: string, sub: string | null) => {
    const subLines = sub ? wrap(sub, regular, 9, W - M * 2 - 110) : [];
    need(22 + subLines.length * 12);
    page.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.6, color: line });
    text(time, M, y, 10, bold); text(title, M + 100, y, 11, bold);
    subLines.forEach((l, i) => text(l, M + 100, y - 13 - i * 12, 9, regular, muted));
    y -= 22 + subLines.length * 12;
  };
  row(s.startTime, "Hotel pickup", s.pickupText);
  for (const st of s.stops.filter((x) => !(s.liveSkipped ?? []).includes(x.id))) {
    const sub = [st.travelMin ? `${st.travelMin} min drive` : "", st.program ? `${st.program}${st.sessionTime ? ` at ${st.sessionTime}` : ""}` : "", st.checkIn != null ? `Please be ready to check in by ${hhmm(st.checkIn)}` : "", st.note ?? ""].filter(Boolean).join(" · ");
    row(`${hhmm(st.start)}-${hhmm(st.end)}`, st.name, sub || null);
  }
  row(hhmm(s.returnAt), s.endText === s.pickupText ? "Back at your hotel" : "Drop-off", s.endText);
  y -= 6;

  // Summary and price
  need(110);
  page.drawRectangle({ x: M, y: y - 74, width: W - M * 2, height: 84, color: pale });
  text("ESTIMATED DRIVING", M + 14, y - 10, 8, bold, muted); text(`${Math.floor(s.totalDrive / 60)} hr ${s.totalDrive % 60} min`, M + 14, y - 26, 13, bold);
  text("TOTAL PRICE", M + 200, y - 10, 8, bold, muted); text(`THB ${s.total.toLocaleString("en-US")}`, M + 200, y - 26, 13, bold);
  const priceLines = [`Car, driver and fuel: THB ${s.transportPrice.toLocaleString("en-US")}`, s.feesIncluded ? `Tickets included: THB ${s.feesIncluded.toLocaleString("en-US")}` : "", s.discount ? `Discount: -THB ${s.discount.toLocaleString("en-US")}` : "", s.feesOnSite ? `Pay on the day: about THB ${s.feesOnSite.toLocaleString("en-US")} in entrance fees` : ""].filter(Boolean);
  priceLines.forEach((l, i) => text(l, M + 14, y - 44 - i * 11, 8.5, regular, muted));
  y -= 100;

  // Packing list
  if (s.packing.length) {
    need(30 + s.packing.length * 14);
    text("WHAT TO BRING", M, y, 9, bold, orange); y -= 16;
    for (const p of s.packing) { for (const [i, l] of wrap(p, regular, 10, W - M * 2 - 14).entries()) { need(14); text(i ? l : `-  ${l}`, M + (i ? 12 : 0), y, 10); y -= 14; } }
    y -= 8;
  }
  if (s.notes) { need(40); text("NOTES", M, y, 9, bold, orange); y -= 16; for (const l of wrap(s.notes, regular, 10, W - M * 2)) { need(14); text(l, M, y, 10); y -= 14; } y -= 8; }

  need(80);
  text("IMPORTANT", M, y, 9, bold, orange); y -= 15;
  for (const l of ["Travel times are estimates and may change with traffic.", "Opening hours can change; we check them before your trip.", "Please be ready at the check-in time for booked activities.", "Your driver may adjust the route for traffic, weather or local conditions."]) { text(`-  ${l}`, M, y, 9, regular, muted); y -= 13; }

  // One page per place: photo, times, description and highlights
  let n = 0;
  for (const st of s.stops.filter((x) => !(s.liveSkipped ?? []).includes(x.id))) {
    if (st.kind !== "attraction") continue;
    n++;
    // Only places with something to show get their own page.
    if (!st.cover && !st.description && !st.highlights.length) continue;
    page = pdf.addPage([W, H]); y = H - M;
    text(String(n).padStart(2, "0"), M, y - 8, 28, bold, orange);
    for (const [i, l] of wrap(st.name.toUpperCase(), bold, 18, W - M * 2 - 60).entries()) text(l, M + 56, y - 4 - i * 22, 18, bold);
    y -= 52;
    const img = await image(pdf, st.cover, origin);
    if (img) { const w = W - M * 2, h = Math.min(300, (img.height / img.width) * w); page.drawImage(img, { x: M, y: y - h, width: w, height: h }); y -= h + 18; }
    text(`${st.program ? `${st.program} · ` : ""}${hhmm(st.start)}-${hhmm(st.end)}${st.openHours ? ` · open ${st.openHours}` : ""}`, M, y, 11, bold, orange); y -= 20;
    if (st.description) { for (const l of wrap(st.description, regular, 11, W - M * 2)) { text(l, M, y, 11); y -= 15; } y -= 6; }
    if (st.highlights.length) { text("HIGHLIGHTS", M, y, 9, bold, muted); y -= 15; for (const h of st.highlights) { text(`-  ${h}`, M, y, 10.5); y -= 14; } y -= 6; }
    if (st.dressCode) { text(`Dress code: ${st.dressCode}`, M, y, 10, bold); y -= 16; }
    if (st.fee) text(st.fee.included ? "Tickets are included in your price." : `Entrance fee paid on the day: THB ${st.fee.adult.toLocaleString("en-US")} adult${st.fee.child ? `, THB ${st.fee.child.toLocaleString("en-US")} child` : ""}.`, M, y, 10, regular, muted);
  }
  return pdf.save();
}
