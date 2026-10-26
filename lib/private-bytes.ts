// Keep each private D1 blob comfortably below the per-row size limit.
export const PRIVATE_PART_BYTES = 900 * 1024;
export function privateParts(bytes: Uint8Array) {
  const parts: Uint8Array[] = [];
  for (let at = 0; at < Math.max(bytes.length, 1); at += PRIVATE_PART_BYTES) parts.push(bytes.slice(at, at + PRIVATE_PART_BYTES));
  return parts;
}
export function joinPrivateParts(parts: (ArrayBuffer | number[])[]) {
  const bytes = parts.map(part => part instanceof ArrayBuffer ? new Uint8Array(part) : Uint8Array.from(part));
  const result = new Uint8Array(bytes.reduce((size, part) => size + part.length, 0));
  let at = 0;
  for (const part of bytes) { result.set(part, at); at += part.length; }
  return result;
}
