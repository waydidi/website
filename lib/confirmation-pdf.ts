import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { BookingExtras } from "@/lib/booking-extras";
import { childSeatPng, exchangePng, ferryPng, logoPng } from "@/lib/pdf-addon-images";

type Confirmation = {
  reference: string; customerName: string; customerEmail: string;
  pickup: string; dropoff: string; pickupDate: string; pickupTime: string;
  passengers: number; luggage: number; vehicle: string; total: number;
  customerPhone: string; flightNumber: string | null; pickupSign: string | null;
  pickupInstructions: string | null; childSeats: number; oversizedLuggage: boolean;
  specialRequests: string | null; paymentMethod?: string;
  serviceType?: string; bookedHours?: number | null; includedDistanceMeters?: number | null; extraHourRate?: number | null; extraDistanceRate?: number | null;
  returnPickup?: string | null; returnDropoff?: string | null; returnDate?: string | null; returnTime?: string | null;
};

const orange = rgb(1, 0.541, 0.02);
const ink = rgb(0.122, 0.09, 0.149);
const muted = rgb(0.58, 0.65, 0.75);
const paleOrange = rgb(1, 0.965, 0.91);

function fitText(value: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let result = value;
  while (result.length > 1 && font.widthOfTextAtSize(`${result}...`, size) > maxWidth) result = result.slice(0, -1);
  return `${result.trim()}...`;
}

// The standard PDF font only covers Latin-1; drop other characters (e.g. Thai) rather than fail.
function latin(value: string) {
  return value.replace(/[^\x20-\x7E\xA0-\xFF]/g, "").replace(/\s+/g, " ").trim();
}

function drawField(page: PDFPage, bold: PDFFont, label: string, value: string, x: number, y: number) {
  page.drawText(label.toUpperCase(), { x, y, size: 8.5, font: bold, color: muted });
  page.drawText(fitText(value, bold, 11.5, 220), { x, y: y - 23, size: 11.5, font: bold, color: ink });
}

export async function createConfirmationPdf(booking: Confirmation, extras?: BookingExtras) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Header: Waydidi logo above the headline, booking reference on the right.
  page.drawRectangle({ x: 0, y: 720, width: 595, height: 122, color: orange });
  const logo = await pdf.embedPng(Uint8Array.from(atob(logoPng), (c) => c.charCodeAt(0)));
  const logoH = 56;
  page.drawImage(logo, { x: 33, y: 773, width: (logo.width / logo.height) * logoH, height: logoH });
  page.drawText("Your ride is booked", { x: 46, y: 746.5, size: 29, font: bold, color: rgb(1, 1, 1) });
  // Right column: label with the reference under it, bottom-aligned with the headline.
  page.drawText("Booking reference", { x: 549 - bold.widthOfTextAtSize("Booking reference", 14), y: 762.5, size: 14, font: bold, color: rgb(1, 1, 1) });
  page.drawText(booking.reference, { x: 549 - regular.widthOfTextAtSize(booking.reference, 10), y: 746.5, size: 10, font: regular, color: rgb(1, 1, 1) });

  const fields = [
    ["Service", booking.serviceType === "hourly" ? `${booking.bookedHours}-hour private driver` : "Private transfer"],
    ["Passenger", booking.customerName],
    ["Email", booking.customerEmail],
    ["Phone / WhatsApp", booking.customerPhone],
    ["Pickup", booking.pickup],
    ["Drop-off", booking.dropoff],
    ["Date & time", `${booking.pickupDate} at ${booking.pickupTime}`],
    ...(booking.returnDate && booking.returnTime ? [
      ["Return", `${booking.returnPickup ?? booking.dropoff} to ${booking.returnDropoff ?? booking.pickup}`],
      ["Return date & time", `${booking.returnDate} at ${booking.returnTime}`],
    ] : []),
    ["Travelers", `${booking.passengers} passengers - ${booking.luggage} bags`],
    ["Vehicle", booking.vehicle],
    ["Payment", booking.total === 0 ? "Nothing to pay" : booking.paymentMethod === "cash" ? "Cash at pickup" : booking.paymentMethod === "manual" ? "Paid" : "Paid online"],
    ["Total", `THB ${booking.total.toLocaleString()}`],
  ].slice(0, 10) as string[][];

  fields.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    drawField(page, bold, label, value, column === 0 ? 46 : 315, 680 - row * 72);
  });

  // Discounts go inside the total box; a tax-invoice note sits just above it.
  const discounts: [string, string][] = extras ? [
    ...(extras.discount ? [[/^(exclusive discount|special price)$/i.test(extras.discount.code) ? "Exclusive discount" : `Discount (${extras.discount.code})`, `-THB ${extras.discount.amount.toLocaleString()}`] as [string, string]] : []),
    ...(extras.memberDiscount ? [[extras.memberDiscount.label, `-THB ${extras.memberDiscount.amount.toLocaleString()}`] as [string, string]] : []),
  ] : [];
  const lines: [string, string][] = extras?.taxInvoice ? [["Tax invoice requested", fitText(latin(`${extras.taxInvoice.name} · Tax ID ${extras.taxInvoice.taxId}`) || `Tax ID ${extras.taxInvoice.taxId}`, regular, 9.5, 300)]] : [];
  const boxH = 58 + discounts.length * 18;
  const boxTop = 72 + boxH;
  lines.forEach(([label, value], index) => {
    const y = boxTop + 10 + (lines.length - 1 - index) * 13;
    page.drawText(label, { x: 46, y, size: 9.5, font: regular, color: rgb(0.38, 0.43, 0.52) });
    page.drawText(value, { x: 549 - regular.widthOfTextAtSize(value, 9.5), y, size: 9.5, font: regular, color: ink });
  });

  // Additional services box: picture, name, price on the right.
  const addons = (extras?.addons ?? []).slice(0, 3);
  if (addons.length) {
    const rowH = 36;
    const bottom = boxTop + 12 + lines.length * 13;
    const height = addons.length * rowH;
    const w = 511, r = 10;
    // Rounded box (10pt corners); svg paths are drawn downward from the top-left.
    page.drawSvgPath(`M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${height - r} A ${r} ${r} 0 0 1 ${w - r} ${height} H ${r} A ${r} ${r} 0 0 1 0 ${height - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`,
      { x: 42, y: bottom + height, color: rgb(1, 1, 1), borderColor: rgb(0.88, 0.89, 0.91), borderWidth: 0.8 });
    page.drawText("ADDITIONAL SERVICES", { x: 46, y: bottom + height + 8, size: 9, font: bold, color: orange });
    for (const [index, line] of addons.entries()) {
      const top = bottom + height - index * rowH;
      if (index > 0) page.drawLine({ start: { x: 42, y: top }, end: { x: 553, y: top }, thickness: 0.6, color: rgb(0.88, 0.89, 0.91) });
      const png = /child seat/i.test(line.label) ? childSeatPng : /ferry/i.test(line.label) ? ferryPng : exchangePng;
      const image = await pdf.embedPng(Uint8Array.from(atob(png), (c) => c.charCodeAt(0)));
      const scale = 26 / Math.max(image.width, image.height);
      page.drawImage(image, { x: 70 - (image.width * scale) / 2, y: top - rowH / 2 - (image.height * scale) / 2, width: image.width * scale, height: image.height * scale });
      page.drawText(latin(line.label), { x: 94, y: top - rowH / 2 - 3.5, size: 10.5, font: bold, color: ink });
      const price = line.amount > 0 ? `THB ${line.amount.toLocaleString()}` : "Free";
      page.drawText(price, { x: 539 - bold.widthOfTextAtSize(price, 10.5), y: top - rowH / 2 - 3.5, size: 10.5, font: bold, color: ink });
    }
  }

  page.drawRectangle({ x: 42, y: 69, width: 511, height: boxH, color: paleOrange, borderColor: rgb(1, 0.82, 0.64), borderWidth: 0.7 });
  discounts.forEach(([label, value], index) => {
    const y = boxTop - 25 - index * 18;
    page.drawText(label, { x: 56, y, size: 10, font: regular, color: rgb(0.38, 0.43, 0.52) });
    page.drawText(value, { x: 539 - bold.widthOfTextAtSize(value, 10), y, size: 10, font: bold, color: label === "Exclusive discount" ? rgb(0.86, 0.15, 0.15) : ink });
  });
  page.drawText("Total price", { x: 56, y: 97, size: 18, font: bold, color: ink });
  const total = `THB ${booking.total.toLocaleString()}`;
  page.drawText(total, { x: 539 - bold.widthOfTextAtSize(total, 18), y: 97, size: 18, font: bold, color: ink });
  page.drawText("*All inclusive", { x: 539 - regular.widthOfTextAtSize("*All inclusive", 9), y: 83, size: 9, font: regular, color: rgb(0.38, 0.43, 0.52) });

  return pdf.save();
}
