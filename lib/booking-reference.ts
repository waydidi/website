export const BOOKING_REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomBookingReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => BOOKING_REFERENCE_ALPHABET[byte % BOOKING_REFERENCE_ALPHABET.length]).join("");
}

export function normalizeSurname(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function legacySurname(fullName: string) {
  return fullName.trim().split(/\s+/).at(-1) ?? "";
}
