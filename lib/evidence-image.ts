import jpeg from "jpeg-js";
import { ictTime } from "@/lib/evidence-rules";
export const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
export function sanitizeEvidence(bytes: Uint8Array) {
  if (bytes.length > MAX_EVIDENCE_BYTES || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new Error("Use a JPEG smaller than 2 MB.");
  const decoded = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 2, maxMemoryUsageInMB: 48, tolerantDecoding: false });
  if (!decoded.width || !decoded.height || decoded.width > 1600 || decoded.height > 1600) throw new Error("Photo dimensions exceed 1600 pixels.");
  // Deliberately discard decoded EXIF/comments; preserve only pixels.
  const original = jpeg.encode({width:decoded.width,height:decoded.height,data:decoded.data}, 80).data;
  return {original, width:decoded.width, height:decoded.height};
}
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
export function stampEvidence(image: {original: Uint8Array; width: number; height: number}, meta: {reference:string;leg:string;type:string;receivedAt:string;deviceCapturedAt:string;latitude:number|null;longitude:number|null;accuracy:number|null}) {
  const width = Math.max(image.width, 640), photoHeight = image.height * width / image.width;
  const lines = ["WAYDIDI TRAVEL", `${meta.type.toUpperCase()} PHOTO - ${meta.reference} / ${meta.leg}`,
    `Server received: ${ictTime(meta.receivedAt)}`, `Device capture (unverified): ${ictTime(meta.deviceCapturedAt)}`,
    meta.latitude === null ? "Location unavailable" : `${meta.latitude.toFixed(5)}, ${meta.longitude!.toFixed(5)} - GPS +/-${Math.round(meta.accuracy!)} m (device reported)`, "Address unavailable"];
  // Server-generated SVG only: escaped text and a re-encoded embedded JPEG; no external resources or scripts.
  return new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${photoHeight+190}" viewBox="0 0 ${width} ${photoHeight+190}"><image width="${width}" height="${photoHeight}" href="data:image/jpeg;base64,${Buffer.from(image.original).toString("base64")}"/><rect y="${photoHeight}" width="${width}" height="190" fill="#14202e"/><rect y="${photoHeight}" width="${width}" height="6" fill="#FE8B05"/>${lines.map((line,i)=>`<text x="18" y="${photoHeight+32+i*27}" font-family="Arial,sans-serif" font-size="16" fill="${i===0?'#FE8B05':'white'}">${escape(line)}</text>`).join("")}</svg>`);
}
