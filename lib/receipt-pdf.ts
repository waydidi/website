import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { receiptFontBase64 } from "@/lib/pdf-receipt-font";
import { logoPng } from "@/lib/pdf-addon-images";
import type { Receipt } from "@/lib/receipt";

const orange = rgb(1, 0.541, 0.02), ink = rgb(0.122, 0.09, 0.149), muted = rgb(0.38, 0.43, 0.52), line = rgb(0.9, 0.91, 0.93);
const amount = (minor: number) => (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clean = (s: string) => s.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
export function amountInWords(minor: number): string {
  const small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const words = (n: number): string => {
    if (n < 20) return small[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? `-${small[n % 10]}` : "");
    for (const [value, label] of [[1000000000000, "trillion"], [1000000000, "billion"], [1000000, "million"], [1000, "thousand"], [100, "hundred"]] as const) if (n >= value) return `${words(Math.floor(n / value))} ${label}${n % value ? ` ${words(n % value)}` : ""}`;
    return "";
  };
  const value = `${words(Math.floor(minor / 100))} baht${minor % 100 ? ` and ${words(minor % 100)} satang` : " only"}`;
  return value[0].toUpperCase() + value.slice(1);
}
export async function createReceiptPdf(r: Receipt) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(Uint8Array.from(atob(receiptFontBase64), c => c.charCodeAt(0)), { subset: true });
  const logo = await pdf.embedPng(Uint8Array.from(atob(logoPng), c => c.charCodeAt(0)));
  pdf.setTitle(`${r.kind === "tax_invoice" ? "Tax invoice / receipt" : "Receipt"} ${r.number}`);
  pdf.setAuthor(r.issuer.name);
  pdf.setCreationDate(new Date(r.issuedAt));
  let page!: PDFPage;
  let y = 0;
  const text = (value: string, x: number, top: number, size = 10, color = ink) => page.drawText(clean(value), { x, y: top, size, font, color });
  const right = (value: string, x: number, top: number, size = 10, color = ink) => text(value, x - font.widthOfTextAtSize(clean(value), size), top, size, color);
  // Split long identifiers and Thai addresses by measured characters; never discard names.
  const wrap = (value: string, width: number, size = 10) => {
    const lines: string[] = [];
    for (const paragraph of clean(value).split("\n")) {
      let current = "";
      for (const char of Array.from(paragraph)) {
        if (current && font.widthOfTextAtSize(current + char, size) > width) { lines.push(current.trim()); current = char; }
        else current += char;
      }
      lines.push(current.trim());
    }
    return lines;
  };
  const newPage = () => {
    page = pdf.addPage([595, 842]);
    page.drawRectangle({ x: 0, y: 714, width: 595, height: 128, color: orange });
    page.drawImage(logo, { x: 33, y: 770, width: logo.width / logo.height * 56, height: 56 });
    text(r.kind === "tax_invoice" ? "Tax invoice / Receipt" : "Payment receipt", 46, 744, 25, rgb(1, 1, 1));
    right("DOCUMENT NUMBER", 549, 780, 9, rgb(1, 1, 1));
    right(r.number, 549, 764, 9, rgb(1, 1, 1));
    text(`Booking ${r.reference}`, 46, 689, 10, muted);
    right(`Issued ${new Date(r.issuedAt).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok" })} (Bangkok)`, 549, 689, 10, muted);
    y = 656;
  };
  const ensure = (height: number) => { if (y - height < 65) newPage(); };
  newPage();
  if (r.number.includes("SAMPLE")) { text("SAMPLE - NOT VALID FOR PAYMENT OR TAX", 46, y, 10, orange); y -= 25; }
  const block = (heading: string, values: string[], x: number) => {
    text(heading, x, y, 11, orange);
    let at = y - 21;
    for (const value of values.filter(Boolean)) for (const row of wrap(value, 235, 10)) { text(row, x, at); at -= 15; }
    return at;
  };
  const issuerEnd = block("ISSUED BY", [r.issuer.name, r.issuer.address, r.issuer.taxId ? `Tax ID: ${r.issuer.taxId}` : "", r.issuer.branch, "WhatsApp: +66 63 206 4884"], 46);
  const customerEnd = block("CUSTOMER / BILL TO", [r.customer.name, r.customer.address, r.customer.taxId ? `Tax ID: ${r.customer.taxId}` : "", r.customer.branch, r.customer.email], 314);
  y = Math.min(issuerEnd, customerEnd) - 13;
  const tableHeader = () => {
    ensure(40);
    page.drawRectangle({ x: 42, y: y - 10, width: 511, height: 27, color: rgb(1, 0.965, 0.91) });
    text("#", 49, y); text("DESCRIPTION", 73, y, 9); right("QTY", 378, y, 9); right("UNIT (THB)", 463, y, 9); right("TOTAL (THB)", 545, y, 9);
    y -= 32;
  };
  tableHeader();
  for (const [index, item] of r.items.entries()) {
    const rows = wrap(item.description, 279, 9);
    let offset = 0;
    // Long descriptions continue across pages without moving totals onto another row.
    while (offset < rows.length) {
      if (y < 95) { newPage(); tableHeader(); }
      const count = Math.min(rows.length - offset, Math.max(1, Math.floor((y - 75) / 15)));
      if (offset === 0) { text(String(index + 1), 49, y, 9); right(String(item.quantity), 378, y, 9); right(amount(item.unitMinor), 463, y, 9); right(amount(item.totalMinor), 545, y, 9); }
      for (let n = 0; n < count; n++) text(rows[offset + n], 73, y - n * 15, 9);
      y -= count * 15 + 12;
      offset += count;
      page.drawLine({ start: { x: 46, y: y + 5 }, end: { x: 549, y: y + 5 }, thickness: 0.5, color: line });
    }
  }
  const totals: [string, number][] = [
    ...(r.kind === "tax_invoice" ? [["Subtotal excluding VAT", r.subtotalMinor], [`VAT ${r.issuer.vatBasisPoints / 100}% (included)`, r.vatMinor]] as [string, number][] : []),
    ["Service total", r.totalMinor], ["Amount received", r.receivedMinor],
    ...(r.refundedMinor ? [["Refunds recorded", r.refundedMinor], ["Net received", r.receivedMinor - r.refundedMinor]] as [string, number][] : []),
    ["Outstanding balance", r.outstandingMinor],
  ];
  ensure(totals.length * 23 + 180);
  y -= 5;
  page.drawRectangle({ x: 42, y: y - totals.length * 23 - 9, width: 511, height: totals.length * 23 + 25, color: rgb(1, 0.965, 0.91), borderColor: rgb(1, 0.82, 0.64), borderWidth: 0.7 });
  for (const [label, value] of totals) { text(label, 56, y, 11); right(`THB ${amount(value)}`, 539, y, 11); y -= 23; }
  y -= 25;
  for (const row of wrap(`Amount received in words: ${amountInWords(r.receivedMinor)}`, 503, 9)) { text(row, 46, y, 9, muted); y -= 14; }
  for (const row of wrap(`Payment: ${r.paymentMethod === "cash" ? "Recorded cash collection" : "Recorded online payment"}. This document confirms the cumulative payments shown above for this booking.`, 503, 9)) { text(row, 46, y, 9, muted); y -= 14; }
  if (r.kind === "receipt") for (const row of wrap("Receipt only. This document does not charge VAT or serve as a VAT tax invoice.", 503, 9)) { text(row, 46, y, 9, muted); y -= 14; }
  y -= 35;
  ensure(55);
  for (const x of [46, 314]) { page.drawLine({ start: { x, y }, end: { x: x + 235, y }, thickness: 0.6, color: line }); text(x === 46 ? "Customer / service recipient" : "Authorized issuer", x, y - 16, 9, muted); text("Date: __________________", x, y - 34, 9, muted); }
  for (const [index, p] of pdf.getPages().entries()) p.drawText(`${r.number}  |  ${index + 1} / ${pdf.getPageCount()}`, { x: 46, y: 28, size: 8, font, color: muted });
  return pdf.save();
}
