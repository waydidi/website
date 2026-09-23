import { sha256Bytes } from "@/lib/security";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isValidImage(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  return mime === "image/webp" && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}

export async function prepareDriverImage(file: FormDataEntryValue | null, label: string) {
  if (!(file instanceof File) || !file.size) throw new Error(`Add the driver's ${label}.`);
  if (file.size > MAX_IMAGE_BYTES || !ACCEPTED_TYPES.has(file.type)) throw new Error(`${label} must be a JPG, PNG, or WebP image smaller than 8 MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isValidImage(bytes, file.type)) throw new Error(`The selected ${label} is not a valid image.`);
  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  return { bytes, mime: file.type, size: file.size, sha256: await sha256Bytes(bytes), extension };
}
