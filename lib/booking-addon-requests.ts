/** Keep purchased add-ons in the operational notes used by drivers, emails and PDFs. */
export function bookingAddonRequests(exchangeStop: boolean, ferryPeople: number, notes = "") {
  const customerNotes = notes
    .replace(/Currency exchange stop requested\.?/giu, "")
    .replace(/Ferry & hotel transfer requested for \d+\.?/giu, "")
    .trim();
  return [
    exchangeStop ? "Currency exchange stop requested." : "",
    ferryPeople > 0 ? `Ferry & hotel transfer requested for ${ferryPeople}.` : "",
    customerNotes,
  ].filter(Boolean).join(" ").slice(0, 500) || null;
}

/** Extra services on a booking, as short labels for staff lists (child seats, stops, ferry, big luggage). */
export function bookingAddonLabels(b: { childSeats: number; oversizedLuggage?: boolean | null; specialRequests: string | null }) {
  const notes = b.specialRequests ?? "";
  const ferry = /Ferry & hotel transfer requested for (\d+)/iu.exec(notes);
  return [
    b.childSeats > 0 ? `${b.childSeats} child seat${b.childSeats === 1 ? "" : "s"}` : "",
    /Currency exchange stop requested/iu.test(notes) ? "Currency exchange stop" : "",
    ferry ? `Ferry & hotel transfer · ${ferry[1]}` : "",
    b.oversizedLuggage ? "Oversized luggage" : "",
  ].filter(Boolean);
}
