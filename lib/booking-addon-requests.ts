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
