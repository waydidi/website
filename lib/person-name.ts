/**
 * "First Last" from a booking's name fields. Some bookings store the full name in the first-name
 * field as well (e.g. "Tayla Kaye Whitehead" + "Whitehead"), so the surname is only added when
 * the name doesn't already end with it.
 */
export function fullName(name: string | null | undefined, surname: string | null | undefined) {
  const n = (name ?? "").trim().replace(/\s+/g, " "), s = (surname ?? "").trim().replace(/\s+/g, " ");
  if (!s) return n;
  if (!n) return s;
  return n.toLowerCase().endsWith(` ${s.toLowerCase()}`) || n.toLowerCase() === s.toLowerCase() ? n : `${n} ${s}`;
}
