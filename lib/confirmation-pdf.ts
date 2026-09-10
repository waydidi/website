import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type Confirmation = {
  reference: string; customerName: string; customerEmail: string;
  pickup: string; dropoff: string; pickupDate: string; pickupTime: string;
  passengers: number; luggage: number; vehicle: string; total: number;
  customerPhone: string; flightNumber: string | null; pickupSign: string | null;
  pickupInstructions: string | null; childSeats: number; oversizedLuggage: boolean;
  specialRequests: string | null; paymentMethod?: string;
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

function drawField(page: PDFPage, bold: PDFFont, label: string, value: string, x: number, y: number) {
  page.drawText(label.toUpperCase(), { x, y, size: 8.5, font: bold, color: muted });
  page.drawText(fitText(value, bold, 11.5, 220), { x, y: y - 23, size: 11.5, font: bold, color: ink });
}

export async function createConfirmationPdf(booking: Confirmation) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({ x: 0, y: 548, width: 595, height: 294, color: orange });
  page.drawText("Waydidi", { x: 46, y: 782, size: 25, font: bold, color: rgb(1, 1, 1) });
  page.drawCircle({ x: 70, y: 704, size: 22, color: rgb(1, 0.68, 0.35) });
  page.drawLine({ start: { x: 59, y: 704 }, end: { x: 67, y: 696 }, thickness: 3.5, color: rgb(1, 1, 1) });
  page.drawLine({ start: { x: 67, y: 696 }, end: { x: 82, y: 713 }, thickness: 3.5, color: rgb(1, 1, 1) });
  page.drawText("PAYMENT RECEIVED", { x: 46, y: 653, size: 11, font: bold, color: rgb(1, 0.88, 0.77) });
  page.drawText("Your ride is booked.", { x: 46, y: 609, size: 31, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Booking reference", { x: 46, y: 577, size: 12, font: regular, color: rgb(1, 0.86, 0.72) });
  page.drawText(booking.reference, { x: 159, y: 577, size: 12, font: bold, color: rgb(1, 1, 1) });

  const fields = [
    ["Passenger", booking.customerName],
    ["Email", booking.customerEmail],
    ["Phone / WhatsApp", booking.customerPhone],
    ["Pickup", booking.pickup],
    ["Drop-off", booking.dropoff],
    ["Date & time", `${booking.pickupDate} at ${booking.pickupTime}`],
    ["Travelers", `${booking.passengers} passengers - ${booking.luggage} bags`],
    ["Vehicle", booking.vehicle],
    ["Payment", booking.paymentMethod === "cash" ? "Cash at pickup" : "Paid online"],
    ["Total", `THB ${booking.total.toLocaleString()}`],
  ];

  fields.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    drawField(page, bold, label, value, column === 0 ? 46 : 315, 510 - row * 72);
  });

  page.drawRectangle({ x: 42, y: 72, width: 511, height: 58, color: paleOrange, borderColor: rgb(1, 0.82, 0.64), borderWidth: 0.7 });
  page.drawText("BOOKING TOTAL", { x: 62, y: 103, size: 9, font: bold, color: orange });
  const total = `THB ${booking.total.toLocaleString()}`;
  page.drawText(total, { x: 531 - bold.widthOfTextAtSize(total, 18), y: 94, size: 18, font: bold, color: ink });
  page.drawText("Keep this confirmation for your pickup.", { x: 46, y: 39, size: 9, font: regular, color: rgb(0.38, 0.43, 0.52) });

  return pdf.save();
}
